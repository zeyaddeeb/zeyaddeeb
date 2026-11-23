use crate::lean::workbench::{self, Config, Workbench};
use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

pub const STATEMENTS: &str = include_str!("../claim/Statements.lean");

const MATHLIB: &str =
    "theorem claim_is_mathlib : RiemannZetaZerosOnLine = RiemannHypothesis := rfl";

const EXCEPTION: &str = "theorem claim_needs_its_exception :
    ¬ ∀ s : ℂ, riemannZeta s = 0 → s ≠ 1 → s.re = 1 / 2 := by
  intro h
  have := h _ (riemannZeta_neg_two_mul_nat_add_one 0) (by norm_num)
  norm_num at this";

const ZETA: &str = "theorem claim_covers_zeta (h : DirichletLZerosOnLine) (s : ℂ)
    (h₀ : 0 < s.re) (h₁ : s.re < 1) (hs : riemannZeta s = 0) : s.re = 1 / 2 :=
  h 1 1 s h₀ h₁ (by rwa [DirichletCharacter.LFunction_modOne_eq])";

const PRIMITIVE: &str =
    "theorem claim_primitive_case : DirichletLZerosOnLine → PrimitiveDirichletLZerosOnLine := by
  intro h N _ χ _ s h₀ h₁ hs
  exact h N χ s h₀ h₁ hs";

pub const KEYS: [&str; 5] = ["statements", "mathlib", "exception", "zeta", "primitive"];

pub fn steps() -> Vec<String> {
    let statements = STATEMENTS
        .lines()
        .filter(|line| !line.starts_with("import "))
        .collect::<Vec<_>>()
        .join("\n");

    vec![
        statements.trim().to_string(),
        MATHLIB.into(),
        EXCEPTION.into(),
        ZETA.into(),
        PRIMITIVE.into(),
    ]
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    pub key: &'static str,
    pub code: String,
    pub ok: bool,
    pub millis: u64,
    pub axioms: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum Audit {
    Waiting,
    Running {
        since: i64,
    },
    Done {
        at: i64,
        millis: u64,
        lean: &'static str,
        mathlib: &'static str,
        lines: Vec<Line>,
    },
    Unavailable,
}

impl Audit {
    pub fn passed(&self) -> bool {
        matches!(self, Audit::Done { lines, .. } if lines.iter().all(|line| line.ok))
    }
}

pub struct Ledger {
    audit: Mutex<Audit>,
}

impl Ledger {
    pub fn new() -> Arc<Self> {
        Arc::new(Ledger {
            audit: Mutex::new(Audit::Waiting),
        })
    }

    pub fn audit(&self) -> Audit {
        self.audit.lock().expect("claim lock").clone()
    }

    fn set(&self, audit: Audit) {
        *self.audit.lock().expect("claim lock") = audit;
    }

    pub async fn run(&self, config: Config) {
        let mut bench = Workbench::new(config, Vec::new());

        if !bench.available() {
            self.set(Audit::Unavailable);

            return;
        }

        let began = Instant::now();

        self.set(Audit::Running {
            since: crate::agent::now(),
        });

        let codes = steps();
        let checked = bench.audit(&codes).await;

        bench.release();

        let lines: Vec<Line> = KEYS
            .iter()
            .zip(codes)
            .zip(checked)
            .map(|((key, code), checked)| Line {
                key,
                code,
                ok: checked.ok,
                millis: checked.millis,
                axioms: checked.axioms,
                error: checked.errors.into_iter().next(),
            })
            .collect();

        let audit = Audit::Done {
            at: crate::agent::now(),
            millis: began.elapsed().as_millis() as u64,
            lean: workbench::lean_version(),
            mathlib: workbench::mathlib_version(),
            lines,
        };

        if audit.passed() {
            tracing::info!("the claimed statements check out against Mathlib");
        } else {
            tracing::warn!(?audit, "a claimed statement did not check");
        }

        self.set(audit);
    }
}

pub fn router(ledger: Arc<Ledger>) -> Router {
    Router::new().route("/claim", get(read)).with_state(ledger)
}

async fn read(State(ledger): State<Arc<Ledger>>) -> Json<Audit> {
    Json(ledger.audit())
}
