mod echo;
mod gateway;
mod tags;
mod written;

use super::live::Channel;
use anyhow::Result;
use echo::Echo;
use futures::StreamExt;
use rig_core::{
    completion::{CompletionRequest, ToolDefinition},
    message::{AssistantContent, Message, ToolCall, ToolName},
    providers::openai::{wire::Chat, OpenAI},
    streaming::{Item, StreamEvent},
    Model, ProviderError,
};
use serde_json::{json, Value};
use std::{fmt, time::Duration};

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct ProofPlan {
    #[serde(default)]
    pub strategy: String,
    #[serde(default)]
    pub candidates: Vec<String>,
    #[serde(default)]
    pub helpers: Vec<Helper>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Helper {
    pub statement: String,
    #[serde(default)]
    pub proof: Option<String>,
}

impl ProofPlan {
    pub fn parse(value: &Value) -> Result<Self> {
        let mut plan: Self = serde_json::from_value(value.clone())?;
        plan.candidates.retain(|script| !script.trim().is_empty());
        plan.candidates.truncate(3);
        plan.helpers
            .retain(|helper| !helper.statement.trim().is_empty());
        plan.helpers.truncate(3);
        Ok(plan)
    }

    pub fn from_reply(reply: &Reply) -> Self {
        if let Some(call) = reply
            .calls
            .iter()
            .find(|call| call.function.name == "proof_plan")
        {
            return Self::parse(&call.function.arguments).unwrap_or_default();
        }
        let text = reply.said.trim();
        let json_text = text
            .strip_prefix("```json")
            .and_then(|text| text.strip_suffix("```"))
            .unwrap_or(text)
            .trim();
        if let Ok(value) = serde_json::from_str::<Value>(json_text) {
            return Self::parse(&value).unwrap_or_default();
        }
        Self {
            candidates: tactics(text),
            ..Self::default()
        }
    }
}

const READY_LIMIT: Duration = Duration::from_secs(5);
use tags::{Piece, Splitter};

#[derive(Clone)]
pub struct Llm {
    client: OpenAI,
    model: Model<Chat>,
}

#[derive(Debug)]
pub struct Dropped;

impl fmt::Display for Dropped {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("the model server closed the stream before the reply ended")
    }
}

impl std::error::Error for Dropped {}

pub fn unreachable(error: &anyhow::Error) -> bool {
    if error.is::<Dropped>() {
        return true;
    }
    match error.downcast_ref::<ProviderError>() {
        Some(
            ProviderError::Http(_)
            | ProviderError::Truncated
            | ProviderError::Response(_)
            | ProviderError::Json(_),
        ) => true,
        Some(ProviderError::ProviderResponse(response)) => response.status.is_none_or(|status| {
            let code = status.as_u16();
            code >= 500 || code == 408 || code == 429
        }),
        _ => false,
    }
}

pub struct Ask<'a> {
    pub preamble: &'a str,
    pub history: &'a [Message],
    pub prompt: Message,
    pub tools: Vec<ToolDefinition>,
    pub thinking: bool,
    pub max_tokens: u64,
}

#[derive(Debug, Default)]
pub struct Reply {
    pub thought: String,
    pub said: String,
    pub calls: Vec<ToolCall>,
    pub tokens: u64,
    pub read: u64,
    pub looped: bool,
}

impl Reply {
    pub fn processed(&self) -> u64 {
        self.tokens + self.read
    }
}

impl Reply {
    pub fn message(&self) -> Message {
        let mut content = Vec::new();
        if !self.said.trim().is_empty() {
            content.push(AssistantContent::text(self.said.trim()));
        }
        content.extend(self.calls.iter().cloned().map(AssistantContent::ToolCall));
        if content.is_empty() {
            content.push(AssistantContent::text("(silence)"));
        }
        Message::Assistant { id: None, content }
    }
}

impl Llm {
    pub fn new(url: &str, key: &str, model: &str) -> Result<Self> {
        let client = gateway::client(url, key);
        Ok(Llm {
            model: client.chat(model),
            client,
        })
    }

    pub async fn ready(&self) -> bool {
        matches!(
            tokio::time::timeout(READY_LIMIT, self.client.verify()).await,
            Ok(Ok(()))
        )
    }

    pub async fn reply(&self, ask: Ask<'_>, mut sink: impl FnMut(Channel, &str)) -> Result<Reply> {
        let sent = ask.preamble.len()
            + serde_json::to_string(ask.history).map_or(0, |text| text.len())
            + serde_json::to_string(&ask.prompt).map_or(0, |text| text.len())
            + serde_json::to_string(&ask.tools).map_or(0, |text| text.len());
        let names: Vec<String> = ask.tools.iter().map(|tool| tool.name.clone()).collect();
        let request = CompletionRequest::new(ask.prompt)
            .preamble(ask.preamble.to_string())
            .messages(ask.history.iter().cloned())
            .tools(ask.tools)
            .max_tokens(ask.max_tokens)
            .temperature(if ask.thinking { 0.6 } else { 0.7 })
            .additional_params(json!({
                "enable_thinking": ask.thinking,
                "top_p": 0.95,
                "top_k": 20,
                "presence_penalty": if ask.thinking { 1.5 } else { 0.0 },
                "truncate_sequence": true,
            }));
        let mut stream = self.model.stream(request)?;
        let mut reply = Reply::default();
        let mut splitter = Splitter::default();
        let mut musing = Splitter::thinking();
        let mut echo = Echo::default();
        let mut route = |piece: Piece, reply: &mut Reply| match piece {
            Piece::Think(text) => {
                sink(Channel::Think, &text);
                reply.thought.push_str(&text);
            }
            Piece::Say(text) => {
                sink(Channel::Say, &text);
                reply.said.push_str(&text);
            }
        };
        while let Some(item) = stream.next().await {
            match item? {
                Item::Event(StreamEvent::Reasoning { text, .. }) => {
                    for piece in musing.push(&text) {
                        route(piece, &mut reply);
                    }
                    if echo.push(&text) {
                        reply.looped = true;
                        break;
                    }
                }
                Item::Event(StreamEvent::Text { text, .. }) => {
                    for piece in splitter.push(&text) {
                        route(piece, &mut reply);
                    }
                    if echo.push(&text) {
                        reply.looped = true;
                        break;
                    }
                }
                Item::Event(StreamEvent::End {
                    content: AssistantContent::ToolCall(tool_call),
                    ..
                }) => reply.calls.push(tool_call),
                _ => {}
            }
        }
        let ended = if reply.looped {
            false
        } else {
            match stream.finish().await {
                Ok(response) => {
                    let usage = response.usage;
                    reply.tokens = usage.output_tokens.unwrap_or(0);
                    reply.read = usage
                        .input_tokens
                        .unwrap_or(0)
                        .saturating_sub(usage.cached_input_tokens.unwrap_or(0));
                    true
                }
                Err(ProviderError::Truncated) => false,
                Err(error) => return Err(error.into()),
            }
        };
        if !ended && !reply.looped {
            return Err(Dropped.into());
        }
        for piece in musing.finish().into_iter().chain(splitter.finish()) {
            route(piece, &mut reply);
        }
        if reply.calls.is_empty() {
            let names: Vec<&str> = names.iter().map(String::as_str).collect();
            reply.calls = written_calls(&mut reply, &names, [&musing, &splitter])
                .into_iter()
                .enumerate()
                .filter_map(|(index, (name, args))| {
                    let name = ToolName::new(name).ok()?;
                    match AssistantContent::tool_call(format!("written-{index}"), name, args) {
                        AssistantContent::ToolCall(call) => Some(call),
                        _ => None,
                    }
                })
                .collect();
        }
        if reply.tokens == 0 {
            reply.tokens = ((reply.thought.len() + reply.said.len()) / 4) as u64;
        }
        if reply.read == 0 {
            reply.read = (sent / 4) as u64;
        }
        Ok(reply)
    }

    pub async fn propose(&self, goal: &str, failed: &[String]) -> Result<(Vec<String>, u64)> {
        let (plan, tokens) = self
            .plan(&json!({"goals": [goal], "failures": failed}), 1536)
            .await?;
        Ok((plan.candidates, tokens))
    }

    pub async fn plan(&self, context: &Value, max_tokens: u64) -> Result<(ProofPlan, u64)> {
        let ask = Ask {
            preamble: super::prompts::PROPOSER,
            history: &[],
            prompt: Message::user(serde_json::to_string(context)?),
            tools: vec![ToolDefinition {
                name: "proof_plan".into(),
                description: "Propose alternative Lean tactic blocks and optional smaller independent lemmas.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "strategy": {"type": "string"},
                        "candidates": {"type": "array", "maxItems": 3, "items": {"type": "string", "maxLength": 1200}},
                        "helpers": {"type": "array", "maxItems": 3, "items": {
                            "type": "object", "properties": {
                                "statement": {"type": "string", "maxLength": 1200},
                                "proof": {"type": "string", "maxLength": 1200}
                            }, "required": ["statement"]
                        }}
                    },
                    "required": ["strategy", "candidates", "helpers"]
                }),
            }],
            thinking: true,
            max_tokens,
        };
        let reply = self.reply(ask, |_, _| {}).await?;
        Ok((ProofPlan::from_reply(&reply), reply.processed()))
    }
}

fn written_calls(
    reply: &mut Reply,
    names: &[&str],
    splitters: [&Splitter; 2],
) -> Vec<(String, Value)> {
    let spoken: Vec<(String, Value)> = splitters
        .iter()
        .flat_map(|splitter| splitter.spoken())
        .filter_map(|block| written::parse(block))
        .collect();
    if !spoken.is_empty() {
        return spoken;
    }
    let found = written::loose(&reply.said, names);
    if !found.is_empty() {
        for (span, _, _) in found.iter().rev() {
            reply.said.replace_range(span.clone(), "");
        }
        return found
            .into_iter()
            .map(|(_, name, args)| (name, args))
            .collect();
    }
    let mused = splitters
        .iter()
        .flat_map(|splitter| splitter.mused())
        .rev()
        .find_map(|block| written::parse(block));
    mused
        .or_else(|| {
            written::loose(&reply.thought, names)
                .pop()
                .map(|(_, name, args)| (name, args))
        })
        .into_iter()
        .collect()
}

pub fn tactics(text: &str) -> Vec<String> {
    text.lines()
        .map(|line| {
            line.trim()
                .trim_start_matches(|c: char| {
                    c == '-' || c == '*' || c.is_ascii_digit() || c == '.' || c == ')'
                })
                .trim()
                .trim_matches('`')
                .trim()
                .to_string()
        })
        .filter(|line| !line.is_empty() && !line.starts_with("```") && line.len() <= 200)
        .take(3)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proof_plans_accept_tools_json_and_legacy_replies() {
        let args =
            json!({"strategy": "split", "candidates": ["constructor\n· exact hp\n· exact hq"]});
        let mut reply = Reply {
            said: args.to_string(),
            ..Reply::default()
        };
        assert_eq!(
            ProofPlan::from_reply(&reply).candidates[0],
            "constructor\n· exact hp\n· exact hq"
        );
        reply.said = "1. simp\n2. exact h".into();
        assert_eq!(
            ProofPlan::from_reply(&reply).candidates,
            vec!["simp", "exact h"]
        );
        if let AssistantContent::ToolCall(call) =
            AssistantContent::tool_call("plan", ToolName::new("proof_plan").unwrap(), args)
        {
            reply.calls.push(call);
        }
        assert_eq!(ProofPlan::from_reply(&reply).strategy, "split");
    }

    #[test]
    fn proof_plans_preserve_multiline_blocks() {
        let script = "have hn : ∀ n : ℕ, s ≠ -n := by\n  rintro n rfl\n  have : (0 : ℝ) ≤ n := n.cast_nonneg\n  simp at h0\n  linarith\nhave h1' : s ≠ 1 := by\n  rintro rfl\n  simp at h1\nrw [riemannZeta_one_sub hn h1', hs, mul_zero]";
        let plan = ProofPlan::parse(&json!({
            "strategy": "Establish the functional equation's side conditions.",
            "candidates": [script],
            "helpers": [{"statement": "lemma positive_ne_one (s : ℂ) (h : s.re < 1) : s ≠ 1"}],
        }))
        .unwrap();
        assert_eq!(plan.candidates, vec![script]);
        assert_eq!(plan.helpers.len(), 1);
        assert!(plan.helpers[0].proof.is_none());
        assert_eq!(
            serde_json::from_value::<ProofPlan>(serde_json::to_value(&plan).unwrap())
                .unwrap()
                .candidates,
            plan.candidates
        );
    }

    #[test]
    fn proof_plans_are_bounded_and_typed() {
        let plan = ProofPlan::parse(&json!({"candidates": ["", "rfl", "simp", "omega", "aesop"]}))
            .unwrap();
        assert_eq!(plan.candidates, vec!["rfl", "simp", "omega"]);
        assert!(ProofPlan::parse(&json!({"candidates": [42]})).is_err());
    }

    #[test]
    fn reads_proposed_tactics() {
        assert_eq!(
            tactics("1. `norm_num`\n- simp [h]\n```\nexact h.le\nring"),
            vec!["norm_num", "simp [h]", "exact h.le"]
        );
    }
}
