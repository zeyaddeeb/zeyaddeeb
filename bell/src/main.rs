use bell::{dealer::Dealer, peers, routes, sites, station::Station, talk::Talk};
use std::{env, sync::Arc};
use tokio::net::TcpListener;
use tracing::info;

fn var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}

async fn shutdown() {
    let interrupt = tokio::signal::ctrl_c();
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("terminate handler");

    tokio::select! {
        _ = interrupt => {}
        _ = terminate.recv() => {}
    }
}

async fn serve(addr: String, app: axum::Router) -> anyhow::Result<()> {
    let listener = TcpListener::bind(&addr).await?;

    info!("listening on {addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(var("RUST_LOG").unwrap_or_else(|| "bell=info".into()))
        .init();

    let id = var("BELL_SITE").unwrap_or_else(|| "gcp-us-west1".into());
    let site = sites::find(&id).ok_or_else(|| anyhow::anyhow!("unknown site {id}"))?;
    let talk = Arc::new(Talk::default());
    let station = Arc::new(Station::new(site, var("BELL_NTP"), talk.clone()));
    let dealer = var("BELL_DEALER")
        .filter(|v| v == "true" || v == "1")
        .map(|_| Arc::new(Dealer::new(peers::parse(var("BELL_PEERS").as_deref()))));
    let talk_addr = var("BELL_TALK_ADDR").unwrap_or_else(|| "0.0.0.0:7000".into());

    info!(
        "site {} ({}), dealer {}",
        site.id,
        site.place,
        dealer.is_some()
    );
    tokio::spawn(talk.listen(TcpListener::bind(&talk_addr).await?));

    tokio::try_join!(
        serve(
            var("BELL_STATION_ADDR").unwrap_or_else(|| "0.0.0.0:8080".into()),
            routes::station(station),
        ),
        serve(
            var("BELL_OPEN_ADDR").unwrap_or_else(|| "0.0.0.0:8081".into()),
            routes::open(dealer),
        ),
    )?;

    Ok(())
}
