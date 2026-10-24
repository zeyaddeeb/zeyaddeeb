use crate::cups::{prompt::CLOSE, task::CUPS};
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const LINE: &str = "\n";

#[derive(Clone)]
pub struct Gateway {
    http: reqwest::Client,
    url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Stop {
    Line,
    Closed,
    Limit,
    End,
}

#[derive(Debug)]
pub struct Chunk {
    pub stop: Stop,
    pub tokens: usize,
}

#[derive(Deserialize)]
struct Piece {
    #[serde(default)]
    content: String,
    #[serde(default)]
    stop: bool,
    #[serde(default)]
    stop_type: String,
    #[serde(default)]
    stopping_word: String,
    #[serde(default)]
    tokens_predicted: usize,
}

#[derive(Deserialize)]
struct Choice {
    token: String,
    logprob: f32,
}

#[derive(Deserialize)]
struct Step {
    top_logprobs: Vec<Choice>,
}

#[derive(Deserialize)]
struct Probed {
    completion_probabilities: Vec<Step>,
}

impl Gateway {
    pub fn new(url: &str) -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .build()?,
            url: url.trim_end_matches('/').to_string(),
        })
    }

    pub fn from_env() -> Option<Self> {
        std::env::var("CUPS_REASONER_URL")
            .ok()
            .filter(|url| !url.is_empty())
            .and_then(|url| Self::new(&url).ok())
    }

    pub async fn think(
        &self,
        prompt: &str,
        limit: usize,
        cancel: &CancellationToken,
        mut on: impl FnMut(&str),
    ) -> Result<Option<Chunk>> {
        let body = json!({
            "prompt": prompt,
            "n_predict": limit,
            "stream": true,
            "cache_prompt": true,
            "temperature": 0.6,
            "top_p": 0.95,
            "top_k": 20,
            "stop": [LINE, CLOSE],
        });
        let response = tokio::select! {
            r = self.send(&body, Duration::from_secs(120)) => r?,
            _ = cancel.cancelled() => return Ok(None),
        };
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        loop {
            let next = tokio::select! {
                next = stream.next() => next,
                _ = cancel.cancelled() => return Ok(None),
            };
            let Some(bytes) = next else {
                return Err(anyhow!("the model server closed the stream early"));
            };

            buffer.push_str(&String::from_utf8_lossy(&bytes?));

            while let Some(end) = buffer.find('\n') {
                let line: String = buffer.drain(..=end).collect();
                let Some(data) = line.trim().strip_prefix("data:") else {
                    continue;
                };
                let piece: Piece = serde_json::from_str(data.trim())?;

                if !piece.content.is_empty() {
                    on(&piece.content);
                }

                if piece.stop {
                    let stop = match (piece.stop_type.as_str(), piece.stopping_word.as_str()) {
                        ("word", CLOSE) => Stop::Closed,
                        ("word", _) => Stop::Line,
                        ("limit", _) => Stop::Limit,
                        _ => Stop::End,
                    };

                    return Ok(Some(Chunk {
                        stop,
                        tokens: piece.tokens_predicted,
                    }));
                }
            }
        }
    }

    pub async fn probe(&self, prompt: &str) -> Result<[f32; CUPS]> {
        let body = json!({
            "prompt": prompt,
            "n_predict": 1,
            "n_probs": 20,
            "temperature": 0.0,
            "cache_prompt": true,
        });
        let probed: Probed = self
            .send(&body, Duration::from_secs(60))
            .await?
            .json()
            .await?;
        let step = probed
            .completion_probabilities
            .first()
            .ok_or_else(|| anyhow!("no probabilities"))?;

        Ok(spread(&step.top_logprobs))
    }

    async fn send(&self, body: &serde_json::Value, timeout: Duration) -> Result<reqwest::Response> {
        let attempt = || {
            self.http
                .post(format!("{}/completion", self.url))
                .json(body)
                .timeout(timeout)
                .send()
        };
        let response = match attempt().await {
            Ok(response) => response,
            Err(error) if error.is_request() || error.is_connect() => attempt().await?,
            Err(error) => return Err(error.into()),
        };

        Ok(response.error_for_status()?)
    }

    pub async fn healthy(&self) -> bool {
        self.http
            .get(format!("{}/health", self.url))
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success())
    }
}

fn spread(choices: &[Choice]) -> [f32; CUPS] {
    let mut p = [0f32; CUPS];

    for choice in choices {
        let token = choice.token.trim();

        if let Ok(n @ 1..=5) = token.parse::<usize>() {
            if token.len() == 1 {
                p[n - 1] += choice.logprob.exp();
            }
        }
    }

    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_single_cup_digits_count() {
        let choices = vec![
            Choice {
                token: "3".into(),
                logprob: (0.7f32).ln(),
            },
            Choice {
                token: " 4".into(),
                logprob: (0.2f32).ln(),
            },
            Choice {
                token: "34".into(),
                logprob: (0.05f32).ln(),
            },
            Choice {
                token: "6".into(),
                logprob: (0.05f32).ln(),
            },
        ];
        let p = spread(&choices);

        assert!((p[2] - 0.7).abs() < 1e-5);
        assert!((p[3] - 0.2).abs() < 1e-5);
        assert_eq!(p[0] + p[1] + p[4], 0.0);
    }
}
