mod diarizer;
mod protocol;
mod rtc;
mod state;
mod ws;

use axum::{
    extract::{ConnectInfo, Path, State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::{net::SocketAddr, str::FromStr};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;
use uuid::Uuid;

use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "diarization=info,tower_http=info".into()),
        )
        .init();

    let state = AppState::new()?;
    let cors = CorsLayer::new()
        .allow_origin(Any)
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

    let addr = SocketAddr::from(([0, 0, 0, 0], 3003));
    info!("diarization backend listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}

async fn health_check() -> impl IntoResponse {
    "ok"
}

async fn create_session(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let host = request_host(&headers).unwrap_or_else(|| addr.to_string());
    Json(state.create_session(&host))
}

async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Ok(session_id) = Uuid::from_str(&session_id) else {
        return (StatusCode::BAD_REQUEST, "invalid session id").into_response();
    };

    let host = request_host(&headers).unwrap_or_else(|| addr.to_string());
    match state.session_info(session_id, &host) {
        Some(session) => Json(session).into_response(),
        None => (StatusCode::NOT_FOUND, "session not found").into_response(),
    }
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Ok(session_id) = Uuid::from_str(&session_id) else {
        return (StatusCode::BAD_REQUEST, "invalid session id").into_response();
    };

    if !state.sessions.contains_key(&session_id) {
        return (StatusCode::NOT_FOUND, "session not found").into_response();
    }

    let host = request_host(&headers).unwrap_or_else(|| addr.to_string());
    ws.on_upgrade(move |socket| ws::handle(socket, session_id, state, host))
}

fn request_host(headers: &HeaderMap) -> Option<String> {
    headers
        .get("host")
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned)
}
