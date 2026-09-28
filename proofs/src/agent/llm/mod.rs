mod gateway;
mod tags;
mod written;

use super::live::Channel;
use anyhow::Result;
use futures::StreamExt;
use rig_core::{
    client::CompletionClient,
    completion::{CompletionModel, ToolDefinition},
    message::{AssistantContent, Message, ToolCall},
    streaming::StreamedAssistantContent,
};
use serde_json::json;
use tags::{Piece, Splitter};

#[derive(Clone)]
pub struct Llm {
    model: gateway::Model,
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
        let client = gateway::client(url, key)?;
        Ok(Llm {
            model: client.completion_model(model),
        })
    }

    pub async fn reply(&self, ask: Ask<'_>, mut sink: impl FnMut(Channel, &str)) -> Result<Reply> {
        let sent = ask.preamble.len()
            + serde_json::to_string(ask.history).map_or(0, |text| text.len())
            + serde_json::to_string(&ask.prompt).map_or(0, |text| text.len())
            + serde_json::to_string(&ask.tools).map_or(0, |text| text.len());
        let request = self
            .model
            .completion_request(ask.prompt)
            .preamble(ask.preamble.to_string())
            .messages(ask.history.iter().cloned())
            .tools(ask.tools)
            .max_tokens(ask.max_tokens)
            .temperature(if ask.thinking { 0.6 } else { 0.7 })
            .additional_params(json!({
                "enable_thinking": ask.thinking,
                "top_p": 0.95,
                "top_k": 20,
                "truncate_sequence": true,
            }))
            .build();
        let mut stream = self.model.stream(request).await?;
        let mut reply = Reply::default();
        let mut splitter = Splitter::default();
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
                StreamedAssistantContent::ReasoningDelta { reasoning, .. } => {
                    route(Piece::Think(reasoning), &mut reply);
                }
                StreamedAssistantContent::Text(text) => {
                    for piece in splitter.push(text.text()) {
                        route(piece, &mut reply);
                    }
                }
                StreamedAssistantContent::ToolCall { tool_call, .. } => reply.calls.push(tool_call),
                StreamedAssistantContent::Final(done) => {
                    reply.tokens = done.usage.output_tokens;
                    reply.read = done
                        .usage
                        .input_tokens
                        .saturating_sub(done.usage.cached_input_tokens);
                }
                _ => {}
            }
        }
        for piece in splitter.finish() {
            route(piece, &mut reply);
        }
        if reply.calls.is_empty() {
            reply.calls = splitter
                .calls()
                .iter()
                .filter_map(|block| written::parse(block))
                .enumerate()
                .filter_map(|(index, (name, args))| {
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
        let tried = if failed.is_empty() {
            "nothing yet".to_string()
        } else {
            failed.join("; ")
        };
        let ask = Ask {
            preamble: super::prompts::PROPOSER,
            history: &[],
            prompt: Message::user(format!("Goal:\n{goal}\n\nAlready failed: {tried}")),
            tools: Vec::new(),
            thinking: false,
            max_tokens: 200,
        };
        let reply = self.reply(ask, |_, _| {}).await?;
        Ok((tactics(&reply.said), reply.processed()))
    }
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
    fn reads_proposed_tactics() {
        assert_eq!(
            tactics("1. `norm_num`\n- simp [h]\n```\nexact h.le\nring"),
            vec!["norm_num", "simp [h]", "exact h.le"]
        );
    }
}
