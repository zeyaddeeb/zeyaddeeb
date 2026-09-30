use crate::lean::{goals::clean_error, guard, process::Process};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::time::timeout;

pub const HEADER: &str = include_str!("../../mathlib/Header.lean");
const TOOLCHAIN: &str = include_str!("../../mathlib/lean-toolchain");
const LAKEFILE: &str = include_str!("../../mathlib/lakefile.toml");

pub fn lean_version() -> &'static str {
    TOOLCHAIN.trim().rsplit(':').next().unwrap_or("unknown")
}

pub fn mathlib_version() -> &'static str {
    LAKEFILE
        .lines()
        .find_map(|line| line.trim().strip_prefix("rev = "))
        .map(|rev| rev.trim_matches('"'))
        .unwrap_or("unknown")
}

const TRUSTED_AXIOMS: &[&str] = &["propext", "Classical.choice", "Quot.sound"];
const ROUTINE: &[&str] = &[
    "rfl",
    "(norm_num; done)",
    "(simp; done)",
    "(simp_all; done)",
    "positivity",
    "linarith",
    "omega",
    "(ring_nf; done)",
    "aesop",
];
const RESTATED: &[&str] = &[
    "assumption",
    "tauto",
    "(simp_all; done)",
    "(intros; simp_all; done)",
    "aesop",
    "(unfold RiemannHypothesis at *; tauto)",
    "(unfold RiemannHypothesis at *; aesop)",
];

#[derive(Debug, Clone)]
pub struct Config {
    pub dir: PathBuf,
    pub lean_path: Option<String>,
    pub header: String,
    pub limit: Duration,
    pub idle: Duration,
}

impl Config {
    pub fn from_env() -> Self {
        let dir =
            PathBuf::from(std::env::var("PROOFS_REPL_DIR").unwrap_or_else(|_| ".repl".into()));
        let lean_path = std::env::var("PROOFS_AGENT_LEAN_PATH")
            .ok()
            .or_else(|| local_mathlib(&PathBuf::from("mathlib")));
        Config {
            dir,
            lean_path,
            header: HEADER.into(),
            limit: Duration::from_secs(
                std::env::var("PROOFS_AGENT_LEAN_SECONDS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60),
            ),
            idle: Duration::from_secs(
                std::env::var("PROOFS_AGENT_LEAN_IDLE")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(300),
            ),
        }
    }
}

pub fn local_mathlib(project: &std::path::Path) -> Option<String> {
    let packages = project.join(".lake/packages");
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(&packages).ok()? {
        let lib = entry.ok()?.path().join(".lake/build/lib/lean");
        if lib.is_dir() {
            paths.push(lib.canonicalize().ok()?.display().to_string());
        }
    }
    (!paths.is_empty()).then(|| paths.join(":"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
    pub ok: bool,
    pub names: Vec<String>,
    pub errors: Vec<String>,
    pub axioms: Vec<String>,
    pub millis: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub state: u64,
    pub goal: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Moved {
    pub ok: bool,
    pub state: Option<u64>,
    pub goals: Vec<String>,
    pub error: Option<String>,
    pub suggestion: Option<String>,
}

struct Live {
    process: Process,
    env: u64,
}

pub struct Workbench {
    config: Config,
    live: Option<Live>,
    library: Vec<String>,
    used: Instant,
    pub starts: u64,
}

impl Workbench {
    pub fn new(config: Config, library: Vec<String>) -> Self {
        Workbench {
            config,
            live: None,
            library,
            used: Instant::now(),
            starts: 0,
        }
    }

    pub fn available(&self) -> bool {
        self.config.dir.join(".lake/build/bin/repl").exists() && self.config.lean_path.is_some()
    }

    pub fn running(&self) -> bool {
        self.live.is_some()
    }

    pub fn library(&self) -> &[String] {
        &self.library
    }

    pub fn session(&self) -> Option<u64> {
        self.live.as_ref().map(|_| self.starts)
    }

    pub fn release(&mut self) {
        self.live = None;
    }

    pub fn rest_if_idle(&mut self) -> bool {
        if self.live.is_some() && self.used.elapsed() > self.config.idle {
            self.live = None;
            return true;
        }
        false
    }

    async fn ready(&mut self) -> anyhow::Result<&mut Live> {
        self.used = Instant::now();
        if self.live.is_none() {
            let mut process =
                Process::spawn(&self.config.dir, self.config.lean_path.as_deref()).await?;
            let reply = timeout(
                Duration::from_secs(180),
                process.send(&json!({ "cmd": self.config.header })),
            )
            .await
            .map_err(|_| anyhow::anyhow!("Mathlib took too long to load"))??;
            let mut env = reply["env"]
                .as_u64()
                .ok_or_else(|| anyhow::anyhow!("Mathlib did not load: {reply}"))?;
            for code in &self.library {
                if let Ok(Ok(reply)) = timeout(
                    self.config.limit,
                    process.send(&json!({ "cmd": code, "env": env })),
                )
                .await
                {
                    if first_error(&reply).is_none() {
                        if let Some(next) = reply["env"].as_u64() {
                            env = next;
                        }
                    }
                }
            }
            self.starts += 1;
            self.live = Some(Live { process, env });
        }
        Ok(self.live.as_mut().expect("live"))
    }

    async fn send(&mut self, request: Value) -> anyhow::Result<Value> {
        let limit = self.config.limit;
        let live = self.ready().await?;
        match timeout(limit, live.process.send(&request)).await {
            Ok(Ok(reply)) => Ok(reply),
            Ok(Err(error)) => {
                self.live = None;
                Err(error)
            }
            Err(_) => {
                self.live = None;
                Err(anyhow::anyhow!(
                    "Lean ran out of time ({}s)",
                    limit.as_secs()
                ))
            }
        }
    }

    fn env(&self) -> u64 {
        self.live.as_ref().map_or(0, |live| live.env)
    }

    pub async fn check(&mut self, code: &str) -> Checked {
        let began = Instant::now();
        let failed = |errors: Vec<String>, began: Instant| Checked {
            ok: false,
            names: Vec::new(),
            errors,
            axioms: Vec::new(),
            millis: began.elapsed().as_millis() as u64,
        };
        if let Err(refusal) = guard::declaration(code) {
            return failed(vec![refusal.message().to_string()], began);
        }
        if let Err(error) = self.ready().await {
            return failed(vec![error.to_string()], began);
        }
        let env = self.env();
        let reply = match self.send(json!({ "cmd": code, "env": env })).await {
            Ok(reply) => reply,
            Err(error) => return failed(vec![error.to_string()], began),
        };
        let errors = all_errors(&reply);
        if !errors.is_empty() {
            return failed(errors, began);
        }
        if messages(&reply)
            .iter()
            .any(|m| m["data"].as_str().is_some_and(|d| d.contains("sorry")))
        {
            return failed(vec!["The proof still contains a gap.".into()], began);
        }
        let names = declared(code);
        let Some(after) = reply["env"].as_u64() else {
            return failed(vec!["Lean returned no environment.".into()], began);
        };
        let mut axioms = Vec::new();
        for name in &names {
            let reply = match self
                .send(json!({ "cmd": format!("#print axioms {name}"), "env": after }))
                .await
            {
                Ok(reply) => reply,
                Err(error) => return failed(vec![error.to_string()], began),
            };
            for message in messages(&reply) {
                if let Some(text) = message["data"].as_str() {
                    axioms.extend(parse_axioms(text));
                }
            }
        }
        axioms.sort();
        axioms.dedup();
        let foreign: Vec<String> = axioms
            .iter()
            .filter(|a| !TRUSTED_AXIOMS.contains(&a.as_str()))
            .cloned()
            .collect();
        if !foreign.is_empty() {
            return failed(
                vec![format!(
                    "The proof leans on untrusted axioms: {}",
                    foreign.join(", ")
                )],
                began,
            );
        }
        Checked {
            ok: true,
            names,
            errors: Vec::new(),
            axioms,
            millis: began.elapsed().as_millis() as u64,
        }
    }

    pub async fn adopt(&mut self, code: &str) -> anyhow::Result<()> {
        let env = {
            self.ready().await?;
            self.env()
        };
        let reply = self.send(json!({ "cmd": code, "env": env })).await?;
        if let Some(error) = first_error(&reply) {
            anyhow::bail!(error);
        }
        let next = reply["env"]
            .as_u64()
            .ok_or_else(|| anyhow::anyhow!("no environment"))?;
        if let Some(live) = self.live.as_mut() {
            live.env = next;
        }
        self.library.push(code.to_string());
        Ok(())
    }

    pub async fn automatic(&mut self, statement: &str) -> bool {
        let code = format!(
            "example {} := by first | {}",
            signature(statement),
            ROUTINE.join(" | ")
        );
        self.check(&code).await.ok
    }

    pub async fn restated(&mut self, statement: &str) -> bool {
        let code = format!(
            "example {} := by first | {}",
            signature(statement),
            RESTATED.join(" | ")
        );
        self.check(&code).await.ok
    }

    pub async fn disproved(&mut self, proposition: &str) -> bool {
        let code = format!(
            "example : ¬ ({proposition}) := by first | {}",
            ROUTINE.join(" | ")
        );
        self.check(&code).await.ok
    }

    pub async fn open(&mut self, statement: &str) -> anyhow::Result<Opened> {
        let code = format!("{} := by sorry", statement.trim());
        guard::declaration(statement).map_err(|r| anyhow::anyhow!(r.message()))?;
        self.ready().await?;
        let env = self.env();
        let reply = self.send(json!({ "cmd": code, "env": env })).await?;
        if let Some(error) = first_error(&reply) {
            anyhow::bail!(clean_error(&error));
        }
        let sorry = reply["sorries"]
            .as_array()
            .and_then(|all| all.first())
            .ok_or_else(|| anyhow::anyhow!("Lean did not open a goal"))?;
        Ok(Opened {
            state: sorry["proofState"]
                .as_u64()
                .ok_or_else(|| anyhow::anyhow!("no proof state"))?,
            goal: sorry["goal"].as_str().unwrap_or_default().to_string(),
        })
    }

    pub async fn apply(&mut self, state: u64, tactic: &str) -> Moved {
        self.apply_guarded(state, tactic, guard::tactic(tactic))
            .await
    }

    pub async fn apply_block(&mut self, state: u64, script: &str) -> Moved {
        let indented = script
            .lines()
            .map(|line| format!("  {line}"))
            .collect::<Vec<_>>()
            .join("\n");
        let block = format!("(\n{indented}\n)");
        self.apply_guarded(state, &block, guard::proof_block(script))
            .await
    }

    async fn apply_guarded(
        &mut self,
        state: u64,
        tactic: &str,
        guarded: Result<(), guard::Refusal>,
    ) -> Moved {
        let refused = |error: String| Moved {
            ok: false,
            state: None,
            goals: Vec::new(),
            error: Some(error),
            suggestion: None,
        };
        if let Err(refusal) = guarded {
            return refused(refusal.message().to_string());
        }
        let reply = match self
            .send(json!({ "tactic": tactic, "proofState": state }))
            .await
        {
            Ok(reply) => reply,
            Err(error) => return refused(error.to_string()),
        };
        if let Some(message) = reply["message"].as_str() {
            return refused(clean_error(message));
        }
        if let Some(error) = first_error(&reply) {
            return refused(clean_error(&error));
        }
        if messages(&reply)
            .iter()
            .any(|m| m["data"].as_str().is_some_and(|d| d.contains("sorry")))
        {
            return refused("That move leaves a gap.".into());
        }
        let goals: Vec<String> = reply["goals"]
            .as_array()
            .map(|all| {
                all.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let status = reply["proofStatus"].as_str().unwrap_or("");
        if goals.is_empty() && !status.is_empty() && status != "Completed" {
            return refused(status.to_string());
        }
        Moved {
            ok: true,
            state: reply["proofState"].as_u64(),
            goals,
            error: None,
            suggestion: messages(&reply)
                .iter()
                .filter_map(|m| m["data"].as_str())
                .find_map(suggestion),
        }
    }
}

fn messages(reply: &Value) -> Vec<Value> {
    reply["messages"].as_array().cloned().unwrap_or_default()
}

fn first_error(reply: &Value) -> Option<String> {
    all_errors(reply).into_iter().next()
}

fn all_errors(reply: &Value) -> Vec<String> {
    let mut errors: Vec<String> = messages(reply)
        .iter()
        .filter(|m| m["severity"] == "error")
        .filter_map(|m| m["data"].as_str().map(clean_error))
        .collect();
    if let Some(message) = reply["message"].as_str() {
        errors.push(clean_error(message));
    }
    errors
}

pub fn declared(code: &str) -> Vec<String> {
    let tokens: Vec<&str> = code.split_whitespace().collect();
    tokens
        .windows(2)
        .filter(|pair| pair[0] == "theorem" || pair[0] == "lemma")
        .map(|pair| pair[1].to_string())
        .collect()
}

pub fn signature(code: &str) -> String {
    let head = code.split(":=").next().unwrap_or(code);
    let mut words = head.split_whitespace().peekable();
    if words
        .peek()
        .is_some_and(|word| matches!(*word, "theorem" | "lemma"))
    {
        words.next();
        words.next();
    }
    let text = words.collect::<Vec<_>>().join(" ");
    let names = binders(&text);
    let mut renamed = String::new();
    let mut word = String::new();
    let flush = |word: &mut String, renamed: &mut String| {
        match names.iter().position(|name| name == word) {
            Some(index) => renamed.push_str(&format!("v{index}")),
            None => renamed.push_str(word),
        }
        word.clear();
    };
    for c in text.chars() {
        if c.is_alphanumeric() || c == '_' || c == '\'' {
            word.push(c);
        } else {
            flush(&mut word, &mut renamed);
            renamed.push(c);
        }
    }
    flush(&mut word, &mut renamed);
    renamed
}

fn binders(text: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut depth = 0;
    let mut group = String::new();
    for c in text.chars() {
        match c {
            '(' | '{' | '[' | '⦃' => {
                if depth > 0 {
                    group.push(c);
                }
                depth += 1;
            }
            ')' | '}' | ']' | '⦄' => {
                depth -= 1;
                if depth == 0 {
                    if let Some((declared, _)) = group.split_once(':') {
                        names.extend(declared.split_whitespace().map(str::to_string));
                    }
                    group.clear();
                } else {
                    group.push(c);
                }
            }
            ':' if depth == 0 => break,
            _ if depth > 0 => group.push(c),
            _ => {}
        }
    }
    names
}

fn suggestion(text: &str) -> Option<String> {
    let (_, rest) = text.split_once("Try this:")?;
    let line = rest.trim().lines().next()?.trim();
    Some(line.trim_start_matches("[apply]").trim().to_string()).filter(|s| !s.is_empty())
}

fn parse_axioms(text: &str) -> Vec<String> {
    let Some(start) = text.find('[') else {
        return Vec::new();
    };
    let Some(end) = text.rfind(']') else {
        return Vec::new();
    };
    text[start + 1..end]
        .split(',')
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_pinned_versions() {
        assert_eq!(lean_version(), "v4.34.0");
        assert_eq!(mathlib_version(), "v4.34.0");
    }

    #[test]
    fn finds_declared_names() {
        assert_eq!(
            declared("theorem a : True := trivial\nlemma b.c (x : ℕ) : x = x := rfl\nexample : True := trivial"),
            vec!["a".to_string(), "b.c".to_string()]
        );
    }

    #[test]
    fn signatures_ignore_names_proofs_and_spacing() {
        let a =
            signature("theorem square_plus_3 (x : ℝ) (h : 0 < x) : 0 < x ^ 2 + x := by positivity");
        let b = signature("lemma square_plus_4 (x : ℝ)  (h : 0 < x) :\n  0 < x ^ 2 + x");
        assert_eq!(a, b);
        assert_eq!(a, "(v0 : ℝ) (v1 : 0 < v0) : 0 < v0 ^ 2 + v0");
        assert_eq!(
            a,
            signature("theorem renamed (y : ℝ) (hy : 0 < y) : 0 < y ^ 2 + y")
        );
        assert_eq!(
            signature("theorem p {s : ℂ} (hs : riemannZeta s = 0) : s.re < 1"),
            signature("theorem q {z : ℂ} (h : riemannZeta z = 0) : z.re < 1")
        );
        assert_ne!(a, signature("theorem c (x : ℝ) : 0 ≤ x ^ 2"));
    }

    #[test]
    fn reads_library_search_suggestions() {
        assert_eq!(
            suggestion("Try this:\n  [apply] exact riemannZeta_ne_zero_of_one_lt_re h").as_deref(),
            Some("exact riemannZeta_ne_zero_of_one_lt_re h")
        );
        assert_eq!(suggestion("unused variable"), None);
    }

    #[test]
    fn parses_axiom_lists() {
        assert_eq!(
            parse_axioms(
                "'riemannZeta_two' depends on axioms: [propext, Classical.choice, Quot.sound]"
            ),
            vec!["propext", "Classical.choice", "Quot.sound"]
        );
        assert!(parse_axioms("'t' does not depend on any axioms").is_empty());
    }
}
