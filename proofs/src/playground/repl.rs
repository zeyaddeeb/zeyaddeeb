use crate::{
    lean::{
        goals::{self, Goal},
        process::Process,
    },
    playground::levels::{Level, LEVELS},
};
use anyhow::{anyhow, bail, Context};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::{
    sync::{Mutex, Semaphore},
    time::timeout,
};

#[derive(Debug, Clone, Serialize)]
pub struct Step {
    pub error: Option<String>,
    pub goals: Vec<Goal>,
    pub ok: bool,
    pub tactic: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Run {
    pub steps: Vec<Step>,
    pub solved: bool,
    pub micros: u64,
}

pub struct Repl {
    process: Process,
    bases: HashMap<&'static str, u64>,
    starts: HashMap<&'static str, Vec<Goal>>,
    uses: usize,
    poisoned: bool,
}

impl Repl {
    pub async fn spawn(dir: &Path) -> anyhow::Result<Self> {
        let mut repl = Repl {
            process: Process::spawn(dir, None).await?,
            bases: HashMap::new(),
            starts: HashMap::new(),
            uses: 0,
            poisoned: false,
        };
        let source: String = LEVELS
            .iter()
            .map(|level| format!("{} := by sorry\n\n", level.statement))
            .collect();
        let reply = repl.send(&json!({ "cmd": source })).await?;
        let sorries = reply["sorries"]
            .as_array()
            .ok_or_else(|| anyhow!("levels did not load: {reply}"))?;
        if sorries.len() != LEVELS.len() {
            bail!(
                "expected {} levels, Lean returned {}: {reply}",
                LEVELS.len(),
                sorries.len()
            );
        }
        for (level, sorry) in LEVELS.iter().zip(sorries) {
            let state = sorry["proofState"].as_u64().context("proof state")?;
            let goal = sorry["goal"].as_str().context("goal")?;
            repl.bases.insert(level.id, state);
            repl.starts.insert(level.id, vec![goals::parse(goal)]);
        }
        Ok(repl)
    }

    pub async fn command(&mut self, source: &str) -> anyhow::Result<Value> {
        self.send(&json!({ "cmd": source })).await
    }

    async fn send(&mut self, request: &Value) -> anyhow::Result<Value> {
        self.process.send(request).await
    }

    pub async fn run(&mut self, level: &Level, tactics: &[String], limit: Duration) -> Run {
        let began = std::time::Instant::now();
        let mut state = self.bases[level.id];
        let mut steps = Vec::with_capacity(tactics.len());
        let mut solved = false;
        for tactic in tactics {
            let request = json!({ "tactic": tactic, "proofState": state });
            let reply = match timeout(limit, self.send(&request)).await {
                Ok(Ok(reply)) => reply,
                Ok(Err(error)) => {
                    self.poisoned = true;
                    tracing::warn!(%error, "repl failed");
                    steps.push(failed(tactic, "Lean stopped unexpectedly. Try again."));
                    break;
                }
                Err(_) => {
                    self.poisoned = true;
                    steps.push(failed(tactic, "Lean ran out of time on this move."));
                    break;
                }
            };
            if let Some(message) = reply["message"].as_str() {
                steps.push(failed(tactic, &goals::clean_error(message)));
                break;
            }
            if let Some(message) = first_error(&reply) {
                steps.push(failed(tactic, &goals::clean_error(&message)));
                break;
            }
            let Some(next) = reply["proofState"].as_u64() else {
                steps.push(failed(tactic, "Lean returned no proof state."));
                break;
            };
            let goals: Vec<Goal> = reply["goals"]
                .as_array()
                .map(|all| {
                    all.iter()
                        .filter_map(Value::as_str)
                        .map(goals::parse)
                        .collect()
                })
                .unwrap_or_default();
            let status = reply["proofStatus"].as_str().unwrap_or("");
            if goals.is_empty() && status != "Completed" {
                steps.push(failed(tactic, status));
                break;
            }
            state = next;
            solved = goals.is_empty();
            steps.push(Step {
                tactic: tactic.clone(),
                ok: true,
                goals,
                error: None,
            });
        }
        self.uses += 1;
        Run {
            steps,
            solved,
            micros: began.elapsed().as_micros() as u64,
        }
    }
}

fn failed(tactic: &str, error: &str) -> Step {
    Step {
        tactic: tactic.to_string(),
        ok: false,
        goals: Vec::new(),
        error: Some(error.to_string()),
    }
}

fn first_error(reply: &Value) -> Option<String> {
    reply["messages"]
        .as_array()?
        .iter()
        .find(|m| m["severity"] == "error")
        .and_then(|m| m["data"].as_str())
        .map(str::to_string)
}

pub struct Pool {
    dir: PathBuf,
    idle: Mutex<Vec<Repl>>,
    permits: Semaphore,
    step_limit: Duration,
    recycle: usize,
    starts: HashMap<&'static str, Vec<Goal>>,
}

#[derive(Debug)]
pub enum PoolError {
    Busy,
    Down(anyhow::Error),
}

impl Pool {
    pub async fn start(
        dir: PathBuf,
        workers: usize,
        step_limit: Duration,
        recycle: usize,
    ) -> anyhow::Result<Self> {
        let mut idle = Vec::with_capacity(workers);
        for _ in 0..workers {
            idle.push(Repl::spawn(&dir).await?);
        }
        let starts = idle[0].starts.clone();
        Ok(Pool {
            dir,
            idle: Mutex::new(idle),
            permits: Semaphore::new(workers),
            step_limit,
            recycle,
            starts,
        })
    }

    pub fn start_goals(&self, level: &Level) -> Vec<Goal> {
        self.starts.get(level.id).cloned().unwrap_or_default()
    }

    pub async fn run(&self, level: &Level, tactics: &[String]) -> Result<Run, PoolError> {
        let _permit = timeout(Duration::from_secs(10), self.permits.acquire())
            .await
            .map_err(|_| PoolError::Busy)?
            .map_err(|_| PoolError::Busy)?;
        let ready = self.idle.lock().await.pop();
        let mut repl = match ready {
            Some(repl) => repl,
            None => Repl::spawn(&self.dir).await.map_err(PoolError::Down)?,
        };
        let run = repl.run(level, tactics, self.step_limit).await;
        if !repl.poisoned && repl.uses < self.recycle {
            self.idle.lock().await.push(repl);
        }
        Ok(run)
    }
}
