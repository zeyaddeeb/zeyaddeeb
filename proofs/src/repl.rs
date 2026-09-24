use crate::{
    goals::{self, Goal},
    levels::{Level, LEVELS},
};
use anyhow::{anyhow, bail, Context};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::{Mutex, Semaphore},
    time::timeout,
};

#[derive(Debug, Clone, Serialize)]
pub struct Step {
    pub tactic: String,
    pub ok: bool,
    pub goals: Vec<Goal>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Run {
    pub steps: Vec<Step>,
    pub solved: bool,
    pub micros: u64,
}

pub struct Repl {
    _child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    bases: HashMap<&'static str, u64>,
    starts: HashMap<&'static str, Vec<Goal>>,
    uses: usize,
    poisoned: bool,
}

impl Repl {
    pub async fn spawn(dir: &Path) -> anyhow::Result<Self> {
        let dir = dir
            .canonicalize()
            .with_context(|| format!("finding {}", dir.display()))?;
        let binary = dir.join(".lake/build/bin/repl");
        let mut command = Command::new(&binary);
        if let Some(root) = sysroot(&dir) {
            command.env("LEAN_SYSROOT", root);
        }
        let mut child = command
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("starting {}", binary.display()))?;
        let stdin = child.stdin.take().context("repl stdin")?;
        let stdout = BufReader::new(child.stdout.take().context("repl stdout")?);
        let mut repl = Repl {
            _child: child,
            stdin,
            stdout,
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
        let mut line = serde_json::to_string(request)?;
        line.push_str("\n\n");
        self.stdin.write_all(line.as_bytes()).await?;
        self.stdin.flush().await?;
        let mut text = String::new();
        loop {
            let mut line = String::new();
            if self.stdout.read_line(&mut line).await? == 0 {
                bail!("repl exited; is the Lean toolchain from lean-toolchain installed with elan, or LEAN_SYSROOT set?");
            }
            if line.trim().is_empty() {
                if text.trim().is_empty() {
                    continue;
                }
                break;
            }
            text.push_str(&line);
        }
        Ok(serde_json::from_str(&text)?)
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

fn sysroot(dir: &Path) -> Option<PathBuf> {
    if std::env::var_os("LEAN_SYSROOT").is_some() {
        return None;
    }
    let toolchain = std::fs::read_to_string(dir.join("lean-toolchain")).ok()?;
    let name = toolchain.trim().replace('/', "--").replace(':', "---");
    let home = std::env::var_os("ELAN_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".elan")))?;
    let root = home.join("toolchains").join(name);
    root.join("lib/lean").is_dir().then_some(root)
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
