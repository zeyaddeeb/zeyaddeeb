use crate::{
    circuit::Circuit,
    families::catalog,
    improve::Trial,
    lab::{known, Known, Lab, Working},
    method::Method,
    synth::{Cut, Outcome, PairCut},
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use std::sync::Arc;
use tokio_util::io::ReaderStream;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CalibrationView {
    at: i64,
    matches: bool,
    by_size: Vec<u64>,
    expected: Vec<u64>,
    classes: usize,
    functions: u64,
    lemmas: u64,
    millis: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Rung {
    at: i64,
    gates: usize,
    verdict: &'static str,
    lemmas: u64,
    bytes: u64,
    millis: u64,
    check_millis: u64,
    limit_seconds: u64,
    reason: Option<String>,
    cuts: Vec<Cut>,
    pair_cuts: Vec<PairCut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StudyView {
    id: String,
    family: String,
    title: String,
    rule: String,
    purpose: Option<String>,
    inputs: u8,
    table: String,
    lower: usize,
    size: Option<usize>,
    circuit: Option<Circuit>,
    limit_seconds: u64,
    proof: Option<String>,
    known: Option<Known>,
    rungs: Vec<Rung>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Overview {
    started: i64,
    workers: usize,
    calibration: Option<CalibrationView>,
    working: Option<Working>,
    lemmas: usize,
    studies: Vec<StudyView>,
    method: Method,
    trials: Vec<Trial>,
    moves: Vec<MoveView>,
    next_trial_millis: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveView {
    id: String,
    label: String,
    tried: u32,
    kept: u32,
}

const SHOWN_TRIALS: usize = 24;

pub fn router(lab: Arc<Lab>) -> Router {
    Router::new()
        .route("/lab", get(overview))
        .route("/proofs/{name}", get(proof))
        .with_state(lab)
}

async fn overview(State(lab): State<Arc<Lab>>) -> Json<Overview> {
    let record = lab.record();
    let entries = catalog();

    let lemmas = record.lemmas.len();
    let method = record.method();
    let last_trial = record.trials.last().map_or(0, |t| t.millis);
    let next_trial_millis = lab
        .trial_every
        .max(2 * last_trial)
        .saturating_sub(record.since_trial_millis);

    let moves = record
        .moves
        .iter()
        .map(|(id, stats)| MoveView {
            id: id.clone(),
            label: record
                .trials
                .iter()
                .rev()
                .find(|t| &t.change == id)
                .map_or_else(|| id.clone(), |t| t.label.clone()),
            tried: stats.tried,
            kept: stats.kept,
        })
        .collect();

    let trials = record
        .trials
        .iter()
        .rev()
        .take(SHOWN_TRIALS)
        .rev()
        .cloned()
        .collect();

    let studies = record
        .studies
        .into_iter()
        .map(|study| {
            let entry = entries.iter().find(|e| e.id == study.id);
            let served = study
                .purpose
                .as_ref()
                .and_then(|purpose| entries.iter().find(|e| &e.id == purpose));

            let rungs = study
                .attempts
                .iter()
                .map(|stamped| {
                    let attempt = &stamped.attempt;
                    let (verdict, lemmas, bytes, check_millis, reason) = match &attempt.outcome {
                        Outcome::Impossible { proof } => {
                            ("no", proof.lemmas, proof.bytes, proof.check_millis, None)
                        }
                        Outcome::Found { .. } => ("yes", 0, 0, 0, None),
                        Outcome::Unknown { reason } => ("open", 0, 0, 0, Some(reason.clone())),
                    };

                    Rung {
                        at: stamped.at,
                        gates: attempt.gates,
                        verdict,
                        lemmas,
                        bytes,
                        millis: attempt.millis,
                        check_millis,
                        limit_seconds: stamped.limit_seconds,
                        reason,
                        cuts: attempt.cuts.clone(),
                        pair_cuts: attempt.pair_cuts.clone(),
                    }
                })
                .collect();

            let (family, title, rule) = match (entry, served) {
                (Some(entry), _) => (
                    entry.family.to_string(),
                    entry.title.to_string(),
                    entry.rule.to_string(),
                ),
                (None, Some(served)) => (
                    "auxiliary".to_string(),
                    format!("Piece of {}", served.title.to_lowercase()),
                    format!(
                        "{} with one input fixed, solved first so its size can bound the original.",
                        served.title
                    ),
                ),
                (None, None) => (
                    "auxiliary".to_string(),
                    "Auxiliary".to_string(),
                    "Solved first to bound a larger function.".to_string(),
                ),
            };

            StudyView {
                family,
                title,
                rule,
                purpose: study.purpose.clone(),
                inputs: study.table.inputs,
                table: study.table.hex(),
                known: known(&study.id),
                id: study.id,
                lower: study.lower,
                size: study.size,
                circuit: study.circuit,
                limit_seconds: study.limit_seconds,
                proof: study.proof,
                rungs,
            }
        })
        .collect();

    Json(Overview {
        started: record.started,
        workers: lab.workers,
        calibration: record.calibration.map(|c| CalibrationView {
            at: c.at,
            matches: c.matches,
            by_size: c.census.by_size,
            expected: c.expected,
            classes: c.census.classes,
            functions: c.census.functions,
            lemmas: c.census.lemmas,
            millis: c.census.millis,
        }),
        working: lab.working(),
        lemmas,
        studies,
        method,
        trials,
        moves,
        next_trial_millis,
    })
}

pub fn proof_name(name: &str) -> bool {
    let Some((stem, extension)) = name.rsplit_once('.') else {
        return false;
    };

    let parts: Vec<&str> = stem.split('-').collect();

    matches!(extension, "lrat" | "cnf")
        && parts.len() == 3
        && parts[0].len() == 1
        && parts[0].chars().all(|c| c.is_ascii_digit())
        && !parts[1].is_empty()
        && parts[1].len() <= 16
        && parts[1]
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        && !parts[2].is_empty()
        && parts[2].len() <= 3
        && parts[2].chars().all(|c| c.is_ascii_digit())
}

async fn proof(State(lab): State<Arc<Lab>>, Path(name): Path<String>) -> Response {
    if !proof_name(&name) {
        return StatusCode::NOT_FOUND.into_response();
    }

    match tokio::fs::File::open(lab.proofs().join(&name)).await {
        Ok(file) => (
            [
                (
                    header::CONTENT_TYPE,
                    "text/plain; charset=utf-8".to_string(),
                ),
                (
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{name}\""),
                ),
            ],
            Body::from_stream(ReaderStream::new(file)),
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_proof_files_can_be_named() {
        assert!(proof_name("4-6996-6.lrat"));
        assert!(proof_name("6-0123456789abcdef-11.cnf"));
        assert!(!proof_name("../record.json"));
        assert!(!proof_name("4-6996-6.lrat.partial"));
        assert!(!proof_name("record.json"));
        assert!(!proof_name("4-69G6-6.lrat"));
        assert!(!proof_name("4-6996-6.txt"));
    }
}
