mod echo;
mod gateway;
mod tags;
mod written;

use super::live::Channel;
use anyhow::Result;
use echo::Echo;
use futures::StreamExt;
use rig_core::{
    client::{Client, CompletionClient, VerifyClient},
    completion::{CompletionError, CompletionModel, ToolDefinition},
    http_client,
    message::{AssistantContent, Message, ToolCall},
    streaming::StreamedAssistantContent,
};
use serde_json::{json, Value};
use std::{fmt, time::Duration};

const READY_LIMIT: Duration = Duration::from_secs(5);
use tags::{Piece, Splitter};

#[derive(Clone)]
pub struct Llm {
    client: Client<gateway::Gateway>,
    model: gateway::Model,
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
    match error.downcast_ref::<CompletionError>() {
        Some(CompletionError::HttpError(http)) => {
            status(http).is_none_or(|code| code >= 500 || code == 408 || code == 429)
        }
        Some(CompletionError::ResponseError(_) | CompletionError::JsonError(_)) => true,
        _ => false,
    }
}

fn status(error: &http_client::Error) -> Option<u16> {
    match error {
        http_client::Error::InvalidStatusCode(status)
        | http_client::Error::InvalidStatusCodeWithMessage(status, _)
        | http_client::Error::InvalidStatusCodeWithDetails { status, .. } => Some(status.as_u16()),
        _ => None,
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
        let client = gateway::client(url, key)?;
        Ok(Llm {
            model: client.completion_model(model),
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
                "presence_penalty": if ask.thinking { 1.5 } else { 0.0 },
                "truncate_sequence": true,
            }))
            .build();
        let mut stream = self.model.stream(request).await?;
        let mut reply = Reply::default();
        let mut splitter = Splitter::default();
        let mut musing = Splitter::thinking();
        let mut echo = Echo::default();
        let mut ended = false;
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
                    for piece in musing.push(&reasoning) {
                        route(piece, &mut reply);
                    }
                    if echo.push(&reasoning) {
                        reply.looped = true;
                        break;
                    }
                }
                StreamedAssistantContent::Text(text) => {
                    for piece in splitter.push(text.text()) {
                        route(piece, &mut reply);
                    }
                    if echo.push(text.text()) {
                        reply.looped = true;
                        break;
                    }
                }
                StreamedAssistantContent::ToolCall { tool_call, .. } => reply.calls.push(tool_call),
                StreamedAssistantContent::Final(done) => {
                    ended = true;
                    reply.tokens = done.usage.output_tokens;
                    reply.read = done
                        .usage
                        .input_tokens
                        .saturating_sub(done.usage.cached_input_tokens);
                }
                _ => {}
            }
        }
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
    fn reads_proposed_tactics() {
        assert_eq!(
            tactics("1. `norm_num`\n- simp [h]\n```\nexact h.le\nring"),
            vec!["norm_num", "simp [h]", "exact h.le"]
        );
    }
}
