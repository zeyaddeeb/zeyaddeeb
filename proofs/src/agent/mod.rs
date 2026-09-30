pub mod bandit;
pub mod config;
mod cycle;
mod desk;
mod episode;
pub mod fronts;
pub mod governor;
mod improve;
pub mod live;
pub mod llm;
pub mod memory;
pub mod prompts;
pub mod routes;
pub mod rules;
mod search;
pub mod seed;
mod sleep;
pub mod tools;
pub mod tree;

use crate::lean::workbench::Workbench;
use config::Config;
use governor::{Governor, Wait};
use live::{Event, Hub, Phase};
use llm::{Ask, Llm, Reply};
use memory::{AgentState, Lemma, Store};
use std::{sync::Arc, time::Duration};

const LEASE_SECONDS: u64 = 1200;
const DROPS: u32 = 3;
const RECONNECT_FIRST: Duration = Duration::from_secs(2);
const RECONNECT_MAX: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub enum Stop {
    GaveUp,
    Displaced,
    Shutdown,
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
    premises: Arc<crate::lean::premises::Index>,
    governor: Governor,
    state: AgentState,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct About {
    pub mode: &'static str,
    pub model: String,
    pub tokens_per_day: u64,
    pub trial_pairs: usize,
    pub alpha: f64,
    pub lean: &'static str,
    pub mathlib: &'static str,
    pub calibration: Vec<crate::math::calibration::Check>,
}

async fn about(
    mode: &'static str,
    model: String,
    tokens_per_day: u64,
    trial_pairs: usize,
) -> anyhow::Result<About> {
    let calibration = tokio::task::spawn_blocking(crate::math::calibration::run).await?;
    if calibration.iter().any(|check| !check.passed) {
        tracing::error!(?calibration, "an instrument failed calibration");
    }
    Ok(About {
        mode,
        model,
        tokens_per_day,
        trial_pairs,
        alpha: rules::ALPHA,
        lean: crate::lean::workbench::lean_version(),
        mathlib: crate::lean::workbench::mathlib_version(),
        calibration,
    })
}

pub async fn archive(database: &str) -> anyhow::Result<(Store, About)> {
    let about = about(
        "off",
        config::model(),
        config::tokens_per_day(),
        config::trial_pairs(),
    )
    .await?;
    let store = Store::connect(database, None).await?;
    Ok((store, about))
}

pub async fn start(
    config: Config,
    hub: Arc<Hub>,
) -> anyhow::Result<(Store, About, tokio::task::JoinHandle<()>)> {
    let about = about(
        config.mode.name(),
        config.model.clone(),
        config.limits.tokens_per_day,
        config.trial_pairs,
    )
    .await?;
    let store = Store::connect(&config.database, None).await?;
    let agent = Agent::new(config, store.clone(), hub).await?;
    let running = tokio::spawn(agent.run());
    Ok((store, about, running))
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
        let mut agent = Agent {
            premises: crate::lean::premises::Index::from_env(&config.workbench.header),
            bench: Workbench::new(config.workbench.clone(), library),
            governor: Governor::new(config.limits, state.budget.clone()),
            config,
            store,
            hub,
            llm,
            state,
        };
        agent.seed_rules().await?;
        Ok(agent)
    }

    fn emit(&self, event: Event) {
        self.hub.emit(event);
    }

    async fn keep_lemma(&mut self, lemma: &Lemma) -> anyhow::Result<()> {
        self.bench.adopt(&lemma.code).await?;
        self.store.put_lemma(lemma).await?;
        Ok(())
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
        self.nap(wait.duration()).await;
        Ok(())
    }

    async fn nap(&self, duration: Duration) {
        tokio::select! {
            _ = tokio::time::sleep(duration) => {}
            _ = self.hub.closed() => {}
        }
    }

    fn stopping(&self) -> bool {
        self.hub.closing()
    }

    async fn reconnect(&mut self) -> Result<(), Stop> {
        self.emit(Event::Phase {
            phase: Phase::Rest,
            seconds: None,
            reason: Some("the model server is restarting; reconnecting".into()),
        });
        let mut wait = RECONNECT_FIRST;
        loop {
            if self.stopping() {
                return Err(Stop::Shutdown);
            }
            if !self.store.claim(&self.config.holder, LEASE_SECONDS).await? {
                return Err(Stop::Displaced);
            }
            if self.llm.ready().await {
                tracing::info!("the model server is back");
                return Ok(());
            }
            self.nap(wait).await;
            wait = (wait * 2).min(RECONNECT_MAX);
        }
    }

    async fn ask(&mut self, turn: u32, ask: Ask<'_>) -> Result<Reply, Stop> {
        let mut drops = 0;
        loop {
            if self.stopping() {
                return Err(Stop::Shutdown);
            }
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
            let limited = tokio::time::timeout(self.config.turn_limit, streamed);
            let outcome = tokio::select! {
                outcome = limited => Some(outcome),
                _ = self.hub.closed() => None,
            };
            let Some(outcome) = outcome else {
                self.emit(Event::Retry { turn });
                return Err(Stop::Shutdown);
            };
            match outcome {
                Ok(Ok(reply)) => {
                    self.governor.spend(reply.processed());
                    self.state.tokens += reply.tokens;
                    return Ok(reply);
                }
                Ok(Err(error)) if llm::unreachable(&error) && drops < DROPS => {
                    drops += 1;
                    tracing::warn!(%error, drops, "the model server dropped the turn");
                    self.emit(Event::Retry { turn });
                    self.reconnect().await?;
                }
                outcome => {
                    let message = match outcome {
                        Ok(Err(error)) if llm::unreachable(&error) => {
                            tracing::warn!(%error, "the model server keeps dropping this turn");
                            "The model server keeps dropping this turn; backing off."
                        }
                        Ok(Err(error)) => {
                            tracing::warn!(%error, "the model refused the request");
                            "The model could not answer this turn; backing off."
                        }
                        _ => "The model took too long to answer; backing off.",
                    };
                    self.emit(Event::Retry { turn });
                    self.emit(Event::Trouble {
                        message: message.to_string(),
                    });
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

    async fn propose(
        &mut self,
        context: &serde_json::Value,
        tokens: u64,
        limit: Duration,
    ) -> (llm::ProofPlan, u64) {
        if self.stopping() || self.governor.check(now()).is_some() {
            return (llm::ProofPlan::default(), 0);
        }
        let max_tokens = self
            .config
            .max_tokens
            .min(tokens)
            .min(self.governor.remaining(now()));
        if max_tokens == 0 {
            return (llm::ProofPlan::default(), 0);
        }
        let proposed = tokio::select! {
            proposed = tokio::time::timeout(limit.min(self.config.turn_limit).min(Duration::from_secs(300)), self.llm.plan(context, max_tokens)) => Some(proposed),
            _ = self.hub.closed() => None,
        };
        match proposed {
            None => (llm::ProofPlan::default(), 0),
            Some(Ok(Ok((plan, processed)))) => {
                self.governor.spend(processed);
                (plan, processed)
            }
            _ => {
                self.governor.fail(now());
                (llm::ProofPlan::default(), tokens)
            }
        }
    }
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}
