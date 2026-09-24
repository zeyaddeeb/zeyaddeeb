use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use proofs::{
    guard,
    levels::{self, LEVELS},
    repl::{Pool, PoolError, Step},
};
use serde::Deserialize;
use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

const MAX_STEPS: usize = 24;

#[derive(Deserialize)]
struct Check {
    level: String,
    steps: Vec<String>,
}

fn env<T: std::str::FromStr>(name: &str, fallback: T) -> T {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(fallback)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "proofs=info,tower_http=info".into()),
        )
        .init();
    let dir: PathBuf = env("PROOFS_REPL_DIR", PathBuf::from(".repl"));
    let workers: usize = env("PROOFS_WORKERS", 2);
    let pool = Arc::new(
        Pool::start(
            dir,
            workers.max(1),
            Duration::from_secs(env("PROOFS_STEP_SECONDS", 5)),
            env("PROOFS_RECYCLE", 200),
        )
        .await?,
    );
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/levels", get(list))
        .route("/check", post(check))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .with_state(pool);

    let host = std::env::var("PROOFS_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let addr: SocketAddr = format!("{host}:3005").parse()?;
    tracing::info!(%addr, workers, "proofs backend listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("SIGTERM handler");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = terminate.recv() => {}
            }
        })
        .await?;
    Ok(())
}

async fn list(State(pool): State<Arc<Pool>>) -> impl IntoResponse {
    let levels: Vec<_> = LEVELS
        .iter()
        .map(|level| {
            serde_json::json!({
                "id": level.id,
                "statement": level.statement,
                "goals": pool.start_goals(level),
            })
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
            Json(serde_json::json!({
                "level": level.id,
                "goals": pool.start_goals(level),
                "steps": run.steps,
                "solved": run.solved,
                "leanMs": run.micros as f64 / 1000.0,
            }))
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
