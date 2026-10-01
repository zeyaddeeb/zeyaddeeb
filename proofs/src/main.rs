use axum::{extract::DefaultBodyLimit, routing::get, Router};
use proofs::{
    agent::{self, live::Hub},
    playground::{self, repl::Pool},
};
use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

const DRAIN: Duration = Duration::from_secs(10);

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

    let mut app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .merge(playground::routes::router(pool));

    let hub = Hub::new();
    let mut running = None;

    if let Some(config) = agent::config::Config::from_env() {
        let (store, about, agent) = agent::start(config, hub.clone()).await?;

        running = Some(agent);
        app = app.merge(agent::routes::router(hub.clone(), store, about));
        tracing::info!("the agent is awake");
    } else if let Some(database) = agent::config::archive() {
        let (store, about) = agent::archive(&database).await?;

        app = app.merge(agent::routes::router(hub.clone(), store, about));
        tracing::info!("the agent is off; its notebook is open");
    }

    let app = app.layer(DefaultBodyLimit::max(16 * 1024));

    let host = std::env::var("PROOFS_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let addr: SocketAddr = format!("{host}:3005").parse()?;

    tracing::info!(%addr, workers, "proofs backend listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    let closing = hub.clone();

    let mut server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move { closing.closed().await })
            .await
    });

    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;

    tokio::select! {
        served = &mut server => return Ok(served??),
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }

    hub.close();

    let parked = tokio::time::timeout(DRAIN, async {
        if let Some(agent) = running {
            let _ = agent.await;
        }

        let _ = server.await;
    })
    .await;

    if parked.is_err() {
        tracing::warn!("stopped before the agent finished parking");
    }

    Ok(())
}
