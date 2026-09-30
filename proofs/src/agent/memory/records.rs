use serde::{Deserialize, Serialize};
use serde_json::Value;
use surrealdb::types::SurrealValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "lowercase")]
pub enum Trust {
    Open,
    Mathlib,
    Literature,
    Verified,
    Measured,
    Conjectured,
    Refuted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Target,
    Theorem,
    Equivalence,
    Conjecture,
    Observation,
    Insight,
    Question,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub key: String,
    pub kind: Kind,
    pub trust: Trust,
    pub title: String,
    pub body: String,
    pub lean: Option<String>,
    pub proof: Option<String>,
    pub source: Option<String>,
    pub front: String,
    pub episode: u64,
    pub evidence: Vec<Evidence>,
    pub text: String,
    pub updated: i64,
}

impl Node {
    pub fn new(key: &str, kind: Kind, trust: Trust, title: &str, body: &str) -> Self {
        let mut node = Node {
            key: key.to_string(),
            kind,
            trust,
            title: title.to_string(),
            body: body.to_string(),
            lean: None,
            proof: None,
            source: None,
            front: String::new(),
            episode: 0,
            evidence: Vec::new(),
            text: String::new(),
            updated: 0,
        };
        node.refresh();
        node
    }

    pub fn refresh(&mut self) {
        self.text = format!("{} {}", self.title, self.body);
    }

    pub fn line(&self) -> String {
        let mut line = format!(
            "[{}] ({:?}) {}: {}",
            self.key, self.trust, self.title, self.body
        );
        if let Some(lean) = &self.lean {
            line.push_str(&format!(" Lean: {lean}"));
        }
        line
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub episode: u64,
    pub tool: String,
    pub summary: String,
    pub held: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "lowercase")]
pub enum Relation {
    Implies,
    Equivalent,
    Uses,
    Supports,
    Refutes,
    Analogy,
}

impl Relation {
    pub fn parse(text: &str) -> Option<Self> {
        match text.trim().to_lowercase().as_str() {
            "implies" => Some(Relation::Implies),
            "equivalent" => Some(Relation::Equivalent),
            "uses" => Some(Relation::Uses),
            "supports" => Some(Relation::Supports),
            "refutes" => Some(Relation::Refutes),
            "analogy" => Some(Relation::Analogy),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub from: String,
    pub to: String,
    pub relation: Relation,
    pub episode: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub field: String,
    pub op: String,
    pub value: f64,
    pub observed: f64,
    pub held: bool,
    pub known: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Call {
    pub id: String,
    pub tool: String,
    pub args: Value,
    pub ok: bool,
    pub summary: String,
    pub verdict: Option<Verdict>,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub episode: u64,
    pub index: u32,
    pub thought: String,
    pub said: String,
    pub calls: Vec<Call>,
    pub tokens: u64,
    pub at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub number: u64,
    pub front: String,
    pub objective: String,
    pub prediction: String,
    pub summary: String,
    pub next: String,
    pub reward: f64,
    pub held: u32,
    pub broken: u32,
    pub verified: u32,
    #[surreal(default)]
    pub routine: u32,
    #[surreal(default)]
    pub known: u32,
    pub turns: u32,
    pub tokens: u64,
    pub started: i64,
    pub ended: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Stretch {
    pub from: f64,
    pub to: f64,
    pub zeros: Vec<f64>,
    pub expected: i64,
    pub missing: i64,
    pub bad_gram: u64,
    pub closest_gap: f64,
    pub episode: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub sigma_from: f64,
    pub sigma_to: f64,
    pub t_from: f64,
    pub t_to: f64,
    pub zeros: Option<i64>,
    pub episode: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Lemma {
    pub name: String,
    pub code: String,
    pub node: Option<String>,
    pub episode: u64,
    pub axioms: Vec<String>,
    #[surreal(default)]
    pub routine: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
pub struct ProofFailure {
    pub goal: String,
    pub script: String,
    pub error: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
pub struct ProofExperience {
    pub key: String,
    pub statement: String,
    pub shape: String,
    pub environment: String,
    pub library: String,
    pub goal: String,
    pub blocks: Vec<String>,
    pub failures: Vec<ProofFailure>,
    pub helpers: Vec<String>,
    pub checked: bool,
    pub axioms: Vec<String>,
    pub episode: u64,
    pub text: String,
}

impl ProofExperience {
    pub fn replayable(&self, statement: &str, environment: &str, library: &str) -> bool {
        self.statement == statement && self.environment == environment && self.library == library
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Arm {
    pub front: String,
    pub pulls: u64,
    pub reward: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Records {
    pub closest_gap: Option<f64>,
    pub gue_distance: Option<f64>,
    pub robin_digits: Option<f64>,
    pub robin_margin: Option<f64>,
    pub mertens_x: Option<u64>,
    pub mertens_ratio: Option<f64>,
    pub hasse_primes: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct Ledger {
    pub day_start: i64,
    pub spent: u64,
    pub failures: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
pub struct AgentState {
    pub awake_since: i64,
    pub episodes: u64,
    pub tokens: u64,
    pub frontier: f64,
    pub zeros: u64,
    pub missing: u64,
    pub contours: u64,
    pub predictions: u64,
    pub held: u64,
    pub broken: u64,
    pub verified: u64,
    #[surreal(default)]
    pub routine: u64,
    #[surreal(default)]
    pub known: u64,
    pub letter: String,
    pub last_front: String,
    #[surreal(default)]
    pub open_front: String,
    #[surreal(default)]
    pub open_since: i64,
    pub arms: Vec<Arm>,
    pub records: Records,
    pub budget: Ledger,
}
