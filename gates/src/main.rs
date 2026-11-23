use axum::{routing::get, Router};
use gates::{lab::Lab, routes};
use std::{net::SocketAddr, path::PathBuf};

fn env<T: std::str::FromStr>(name: &str, fallback: T) -> T {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(fallback)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "gates=info,tower_http=info".into()),
        )
        .init();

    let data: PathBuf = env("GATES_DATA", PathBuf::from("data"));
    let workers: usize = env("GATES_WORKERS", 1);
    let lab = Lab::open(&data, workers)?;

    let researcher = {
        let lab = lab.clone();

        std::thread::spawn(move || lab.run())
    };

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .merge(routes::router(lab.clone()));

    let host = std::env::var("GATES_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let addr: SocketAddr = format!("{host}:3009").parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!(%addr, data = %data.display(), workers, "gates listening");

    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = terminate.recv() => {}
            }
        })
        .await?;

    lab.stop();

    let _ = tokio::task::spawn_blocking(move || researcher.join()).await;

    Ok(())
}
