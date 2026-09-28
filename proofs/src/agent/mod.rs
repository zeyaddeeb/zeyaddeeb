pub mod bandit;
pub mod config;
mod cycle;
mod desk;
mod episode;
pub mod fronts;
pub mod governor;
pub mod live;
pub mod llm;
pub mod memory;
pub mod prompts;
pub mod routes;
mod search;
pub mod seed;
mod sleep;
pub mod tools;

use crate::lean::workbench::Workbench;
use config::Config;
use governor::{Governor, Wait};
use live::{Event, Hub, Phase};
use llm::{Ask, Llm, Reply};
use memory::{AgentState, Store};
use std::{sync::Arc, time::Duration};

const LEASE_SECONDS: u64 = 1200;

#[derive(Debug)]
pub enum Stop {
    GaveUp,
    Displaced,
    Failed(anyhow::Error),
}

impl From<anyhow::Error> for Stop {
    fn from(error: anyhow::Error) -> Self {
        Stop::Failed(error)
    }
}

pub struct Agent {
    config: Config,
    store: Store,
    hub: Arc<Hub>,
    llm: Llm,
    bench: Workbench,
    governor: Governor,
    state: AgentState,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct About {
    pub mode: &'static str,
    pub model: String,
    pub tokens_per_day: u64,
    pub lean: &'static str,
    pub mathlib: &'static str,
    pub calibration: Vec<crate::math::calibration::Check>,
}

async fn about(mode: &'static str, model: String, tokens_per_day: u64) -> anyhow::Result<About> {
    let calibration = tokio::task::spawn_blocking(crate::math::calibration::run).await?;
    if calibration.iter().any(|check| !check.passed) {
        tracing::error!(?calibration, "an instrument failed calibration");
    }
    Ok(About {
        mode,
        model,
        tokens_per_day,
        lean: crate::lean::workbench::lean_version(),
        mathlib: crate::lean::workbench::mathlib_version(),
        calibration,
    })
}

pub async fn archive(database: &str) -> anyhow::Result<(Store, About)> {
    let about = about("off", config::model(), config::tokens_per_day()).await?;
    let store = Store::connect(database, None).await?;
    Ok((store, about))
}

pub async fn start(config: Config, hub: Arc<Hub>) -> anyhow::Result<(Store, About)> {
    let about = about(
        config.mode.name(),
        config.model.clone(),
        config.limits.tokens_per_day,
    )
    .await?;
    let store = Store::connect(&config.database, None).await?;
    let agent = Agent::new(config, store.clone(), hub).await?;
    tokio::spawn(agent.run());
    Ok((store, about))
}

impl Agent {
    pub async fn new(config: Config, store: Store, hub: Arc<Hub>) -> anyhow::Result<Self> {
        let llm = Llm::new(&config.llm_url, &config.api_key, &config.model)?;
        for node in seed::nodes() {
            store.insert_missing(&node).await?;
        }
        for link in seed::links() {
            store.link(&link).await?;
        }
        let state = store.state().await?.unwrap_or_else(|| AgentState {
            awake_since: now(),
            ..Default::default()
        });
        let library = store
            .lemmas()
            .await?
            .into_iter()
            .map(|lemma| lemma.code)
            .collect();
        Ok(Agent {
            bench: Workbench::new(config.workbench.clone(), library),
            governor: Governor::new(config.limits, state.budget.clone()),
            config,
            store,
            hub,
            llm,
            state,
        })
    }

    fn emit(&self, event: Event) {
        self.hub.emit(event);
    }

    async fn save(&mut self) -> anyhow::Result<()> {
        self.state.budget = self.governor.ledger().clone();
        self.store.save_state(&self.state).await?;
        self.emit(Event::Stats {
            state: self.state.clone(),
        });
        Ok(())
    }

    async fn pause(&mut self, wait: &Wait) -> anyhow::Result<()> {
        self.emit(Event::Phase {
            phase: Phase::Rest,
            seconds: Some(wait.duration().as_secs()),
            reason: Some(wait.reason().to_string()),
        });
        self.save().await?;
        tokio::time::sleep(wait.duration()).await;
        Ok(())
    }

    async fn ask(&mut self, turn: u32, ask: Ask<'_>) -> Result<Reply, Stop> {
        loop {
            if !self.store.claim(&self.config.holder, LEASE_SECONDS).await? {
                return Err(Stop::Displaced);
            }
            if let Some(wait) = self.governor.check(now()) {
                self.pause(&wait).await?;
                continue;
            }
            let hub = self.hub.clone();
            let request = Ask {
                preamble: ask.preamble,
                history: ask.history,
                prompt: ask.prompt.clone(),
                tools: ask.tools.clone(),
                thinking: ask.thinking,
                max_tokens: ask.max_tokens.min(self.governor.remaining(now()).max(64)),
            };
            let streamed = self.llm.reply(request, |channel, text| {
                hub.emit(Event::Delta {
                    turn,
                    channel,
                    text: text.to_string(),
                })
            });
            match tokio::time::timeout(self.config.turn_limit, streamed).await {
                Ok(Ok(reply)) => {
                    self.governor.spend(reply.processed());
                    self.state.tokens += reply.tokens;
                    return Ok(reply);
                }
                outcome => {
                    let message = match outcome {
                        Ok(Err(error)) => format!("The model failed: {error}"),
                        _ => "The model took too long to answer.".to_string(),
                    };
                    tracing::warn!(%message, "model call failed");
                    self.emit(Event::Retry { turn });
                    self.emit(Event::Trouble { message });
                    let wait = self.governor.fail(now());
                    if self.governor.exhausted() {
                        self.save().await?;
                        return Err(Stop::GaveUp);
                    }
                    self.pause(&wait).await?;
                }
            }
        }
    }

    async fn propose(&mut self, goal: &str, failed: &[String]) -> Vec<String> {
        if self.governor.check(now()).is_some() {
            return Vec::new();
        }
        let proposed =
            tokio::time::timeout(Duration::from_secs(300), self.llm.propose(goal, failed)).await;
        match proposed {
            Ok(Ok((tactics, processed))) => {
                self.governor.spend(processed);
                tactics
            }
            _ => {
                self.governor.fail(now());
                Vec::new()
            }
        }
    }
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}
