use crate::{
    lean::{goals::Goal, guard},
    playground::{
        levels::{self, LEVELS},
        repl::{Pool, PoolError, Step},
    },
};
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const MAX_STEPS: usize = 24;

#[derive(Deserialize)]
struct Check {
    level: String,
    steps: Vec<String>,
}

#[derive(Serialize)]
struct LevelStart {
    goals: Vec<Goal>,
    id: &'static str,
    statement: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Checked {
    goals: Vec<Goal>,
    lean_ms: f64,
    level: &'static str,
    solved: bool,
    steps: Vec<Step>,
}

pub fn router(pool: Arc<Pool>) -> Router {
    Router::new()
        .route("/levels", get(list))
        .route("/check", post(check))
        .with_state(pool)
}

async fn list(State(pool): State<Arc<Pool>>) -> impl IntoResponse {
    let levels: Vec<_> = LEVELS
        .iter()
        .map(|level| LevelStart {
            goals: pool.start_goals(level),
            id: level.id,
            statement: level.statement,
        })
        .collect();

    Json(levels)
}

async fn check(State(pool): State<Arc<Pool>>, Json(request): Json<Check>) -> impl IntoResponse {
    let Some(level) = levels::find(&request.level) else {
        return (StatusCode::NOT_FOUND, "unknown level").into_response();
    };

    if request.steps.len() > MAX_STEPS {
        return (StatusCode::BAD_REQUEST, "too many steps").into_response();
    }

    let refused = request
        .steps
        .iter()
        .enumerate()
        .find_map(|(index, step)| guard::tactic(step).err().map(|refusal| (index, refusal)));

    let allowed = refused.map_or(request.steps.len(), |(index, _)| index);

    let tactics: Vec<String> = request.steps[..allowed]
        .iter()
        .map(|step| step.trim().to_string())
        .collect();

    match pool.run(level, &tactics).await {
        Ok(mut run) => {
            if let Some((index, refusal)) = refused {
                if run.steps.len() == allowed && run.steps.iter().all(|s| s.ok) {
                    run.solved = false;

                    run.steps.push(Step {
                        tactic: request.steps[index].trim().to_string(),
                        ok: false,
                        goals: Vec::new(),
                        error: Some(refusal.message().to_string()),
                    });
                }
            }

            Json(Checked {
                goals: pool.start_goals(level),
                lean_ms: run.micros as f64 / 1000.0,
                level: level.id,
                solved: run.solved,
                steps: run.steps,
            })
            .into_response()
        }
        Err(PoolError::Busy) => (
            StatusCode::SERVICE_UNAVAILABLE,
            [(header::RETRY_AFTER, "5")],
            "every Lean worker is busy",
        )
            .into_response(),
        Err(PoolError::Down(error)) => {
            tracing::error!(%error, "could not start Lean");

            (StatusCode::SERVICE_UNAVAILABLE, "Lean is not available").into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lean::goals::Hypothesis;

    fn goal() -> Goal {
        Goal {
            case: Some("succ".into()),
            hyps: vec![Hypothesis {
                names: vec!["p".into(), "q".into()],
                kind: "Prop".into(),
            }],
            target: "p → q → p".into(),
        }
    }

    #[test]
    fn level_start_matches_previous_json() {
        let level = &LEVELS[0];

        let typed = LevelStart {
            goals: vec![goal()],
            id: level.id,
            statement: level.statement,
        };

        let loose = serde_json::json!({
            "id": level.id,
            "statement": level.statement,
            "goals": vec![goal()],
        });

        assert_eq!(
            serde_json::to_string(&typed).unwrap(),
            serde_json::to_string(&loose).unwrap()
        );
    }

    #[test]
    fn checked_matches_previous_json() {
        let steps = vec![
            Step {
                tactic: "intro hp".into(),
                ok: true,
                goals: vec![goal()],
                error: None,
            },
            Step {
                tactic: "exact hq".into(),
                ok: false,
                goals: Vec::new(),
                error: Some("type mismatch".into()),
            },
        ];

        let micros = 1234u64;

        let typed = Checked {
            goals: vec![goal()],
            lean_ms: micros as f64 / 1000.0,
            level: "intro",
            solved: false,
            steps: steps.clone(),
        };

        let loose = serde_json::json!({
            "level": "intro",
            "goals": vec![goal()],
            "steps": steps,
            "solved": false,
            "leanMs": micros as f64 / 1000.0,
        });

        assert_eq!(
            serde_json::to_string(&typed).unwrap(),
            serde_json::to_string(&loose).unwrap()
        );
    }
}
