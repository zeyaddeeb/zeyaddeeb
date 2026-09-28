use super::governor::Limits;
use crate::lean::workbench;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Always,
    Watched,
}

impl Mode {
    pub fn name(self) -> &'static str {
        match self {
            Mode::Always => "always",
            Mode::Watched => "watched",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub mode: Mode,
    pub llm_url: String,
    pub model: String,
    pub api_key: String,
    pub database: String,
    pub holder: String,
    pub actions: usize,
    pub max_tokens: u64,
    pub turn_limit: Duration,
    pub rest_watched: Duration,
    pub rest_unwatched: Duration,
    pub sleep_every: u64,
    pub keep_episodes: u64,
    pub search_budget: usize,
    pub limits: Limits,
    pub workbench: workbench::Config,
}

fn var(name: &str, fallback: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| fallback.to_string())
}

fn number<T: std::str::FromStr>(name: &str, fallback: T) -> T {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(fallback)
}

fn seconds(name: &str, fallback: u64) -> Duration {
    Duration::from_secs(number(name, fallback))
}

impl Config {
    pub fn from_env() -> Option<Self> {
        let mode = match var("PROOFS_AGENT", "off").as_str() {
            "on" => Mode::Always,
            "watched" => Mode::Watched,
            _ => return None,
        };
        Some(Config {
            mode,
            llm_url: var(
                "PROOFS_AGENT_LLM_URL",
                "http://inference-gateway.llm.svc.cluster.local:1234/v1",
            ),
            model: model(),
            api_key: var("PROOFS_AGENT_API_KEY", "none"),
            database: var("PROOFS_AGENT_DB", "mem://"),
            holder: var("HOSTNAME", "local"),
            actions: number("PROOFS_AGENT_ACTIONS", 8),
            max_tokens: number("PROOFS_AGENT_MAX_TOKENS", 1536),
            turn_limit: seconds("PROOFS_AGENT_TURN_SECONDS", 900),
            rest_watched: seconds("PROOFS_AGENT_REST_SECONDS", 30),
            rest_unwatched: seconds("PROOFS_AGENT_IDLE_REST_SECONDS", 1800),
            sleep_every: number::<u64>("PROOFS_AGENT_SLEEP_EVERY", 4).max(1),
            keep_episodes: number("PROOFS_AGENT_KEEP_EPISODES", 200),
            search_budget: number("PROOFS_AGENT_SEARCH_NODES", 10),
            limits: Limits {
                tokens_per_day: tokens_per_day(),
                backoff_base: seconds("PROOFS_AGENT_BACKOFF_SECONDS", 30),
                backoff_max: seconds("PROOFS_AGENT_BACKOFF_MAX_SECONDS", 1800),
                failures_before_giving_up: number("PROOFS_AGENT_FAILURES", 4),
            },
            workbench: workbench::Config::from_env(),
        })
    }
}

pub fn archive() -> Option<String> {
    std::env::var("PROOFS_AGENT_DB")
        .ok()
        .filter(|url| !url.starts_with("mem://"))
}

pub fn model() -> String {
    var("PROOFS_AGENT_MODEL", "Qwen/Qwen3.5-2B")
}

pub fn tokens_per_day() -> u64 {
    number("PROOFS_AGENT_TOKENS_PER_DAY", 300_000)
}
