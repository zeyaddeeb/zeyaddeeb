mod audio;
mod clients;
mod codec;
mod door;
mod house;
mod line;
mod mel;
mod network;
mod player;
mod protocol;
mod rng;
mod room;
mod rtc;
mod run;
mod spectrum;
mod state;
mod stt;
mod tools;
mod ws;

use std::{
    net::SocketAddr,
    path::PathBuf,
    str::FromStr,
    time::{Duration, Instant},
};

use anyhow::Context;
use axum::{
    extract::{ConnectInfo, Path, State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{info, warn};
use uuid::Uuid;

use clients::{welcome, who};
use door::Door;
use house::House;
use network::Network;
use room::Room;
use state::{AppState, Policy, Turned};

const DEFAULT_BIND_ADDR: &str = "0.0.0.0:3003";
const DEFAULT_HOUSE: &str = "house.tape";
const SWEEP_EVERY: Duration = Duration::from_secs(30);
const LONGEST_VISIT: Duration = Duration::from_secs(600);
const LARGEST_MESSAGE: usize = 64 * 1024;

fn main() -> anyhow::Result<()> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();

    if !arguments.is_empty() {
        return tools::run(&tools::models(), &arguments);
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(serve())
}

async fn serve() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "voice=info,tower_http=info".into()),
        )
        .init();

    let models = tools::models();

    Room::furnished(&models).context("the models are missing")?;

    let door = Door::new(move || Room::open(&models));
    let state = AppState::new(door, Network::from_env()?, policy());

    play_house(&state);
    tokio::spawn(keep(state.clone()));

    let cors = CorsLayer::new()
        .allow_origin(allowed(&state.origins))
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/sessions", post(create_session))
        .route("/sessions/{session_id}", get(get_session))
        .route("/ws/{session_id}", get(ws_upgrade))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = std::env::var("VOICE_BIND_ADDR")
        .unwrap_or_else(|_| DEFAULT_BIND_ADDR.to_string())
        .parse()
        .context("VOICE_BIND_ADDR is not an address")?;

    info!("voice backend listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}

fn play_house(state: &AppState) {
    let tape = std::env::var("VOICE_HOUSE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_HOUSE));

    match House::load(&tape) {
        Ok(house) => {
            info!("the house tape has {} generations", house.generations.len());

            let _ = state.house.set(house);
        }
        Err(error) => warn!("no house tape: {error:#}"),
    }
}

async fn keep(state: AppState) {
    let mut tick = tokio::time::interval(SWEEP_EVERY);
    let idle = Duration::from_secs(setting("VOICE_ROOM_IDLE_SECONDS", 120));

    loop {
        tick.tick().await;
        state.sweep(Instant::now());

        if state.door.close_if_idle(Instant::now(), idle) {
            info!("the room is empty; the models are unloaded");
        }
    }
}

fn setting(variable: &str, default: u64) -> u64 {
    std::env::var(variable)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn policy() -> Policy {
    let usual = Policy::default();

    Policy {
        parallel_runs: setting("VOICE_PARALLEL_RUNS", usual.parallel_runs as u64) as usize,
        sessions_per_client: setting(
            "VOICE_SESSIONS_PER_CLIENT",
            usual.sessions_per_client as u64,
        ) as usize,
        takes_per_client_hour: setting(
            "VOICE_TAKES_PER_CLIENT_HOUR",
            usual.takes_per_client_hour as u64,
        ) as usize,
        origins: std::env::var("VOICE_ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(|origin| origin.trim().trim_end_matches('/').to_string())
            .filter(|origin| !origin.is_empty())
            .collect(),
    }
}

fn allowed(origins: &[String]) -> AllowOrigin {
    if origins.is_empty() {
        return AllowOrigin::any();
    }

    AllowOrigin::list(origins.iter().filter_map(|origin| origin.parse().ok()))
}

async fn health_check() -> impl IntoResponse {
    "ok"
}

async fn create_session(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !welcome(&headers, &state.origins) {
        return (StatusCode::FORBIDDEN, "this page cannot use the room").into_response();
    }

    match state.create_session(who(&headers, peer).as_deref()) {
        Ok(session) => Json(session).into_response(),
        Err(Turned::Full) => (StatusCode::TOO_MANY_REQUESTS, "the room is full").into_response(),
        Err(Turned::Greedy) => {
            (StatusCode::TOO_MANY_REQUESTS, "too many visits at once").into_response()
        }
    }
}

async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let Ok(session_id) = Uuid::from_str(&session_id) else {
        return (StatusCode::BAD_REQUEST, "invalid session id").into_response();
    };

    match state.session(session_id) {
        Some(_) => Json(state.session_info(session_id)).into_response(),
        None => (StatusCode::NOT_FOUND, "session not found").into_response(),
    }
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !welcome(&headers, &state.origins) {
        return (StatusCode::FORBIDDEN, "this page cannot use the room").into_response();
    }

    let Ok(session_id) = Uuid::from_str(&session_id) else {
        return (StatusCode::BAD_REQUEST, "invalid session id").into_response();
    };

    if state.session(session_id).is_none() {
        return (StatusCode::NOT_FOUND, "session not found").into_response();
    }

    ws.max_message_size(LARGEST_MESSAGE)
        .max_frame_size(LARGEST_MESSAGE)
        .on_upgrade(move |socket| async move {
            let handled =
                tokio::time::timeout(LONGEST_VISIT, ws::handle(socket, session_id, state.clone()))
                    .await;

            if matches!(handled, Ok(false)) {
                return;
            }

            if let Some(session) = state.leave(session_id) {
                ws::hang_up(&session).await;
            }
        })
}
