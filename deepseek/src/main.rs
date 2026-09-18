use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{get, post},
    Json, Router,
};
use deepseek_lab::{
    protocol::ClientCommand,
    state::{AppState, CreateError, Limits, Session},
};
use futures_util::Stream;
use std::{convert::Infallible, net::SocketAddr, str::FromStr, sync::Arc, time::Duration};
use tokio::sync::broadcast::error::RecvError;
use uuid::Uuid;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "deepseek_lab=info,tower_http=info".into()),
        )
        .init();
    let state = AppState::new(Limits::from_env());
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ready", get(ready))
        .route("/stats", get(stats))
        .route("/sessions", post(create_session))
        .route("/sessions/{id}", get(get_session).delete(delete_session))
        .route("/sessions/{id}/commands", post(command))
        .route("/sessions/{id}/events", get(events))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .with_state(state.clone());

    let sweeper = state.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(10));
        loop {
            tick.tick().await;
            sweeper.sweep().await;
        }
    });

    let host = std::env::var("DEEPSEEK_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let addr: SocketAddr = format!("{host}:3004").parse()?;
    tracing::info!(%addr, workers = state.limits.workers, "deepseek lab backend listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let closing = state.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("SIGTERM handler");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = terminate.recv() => {}
            }
            tracing::info!("shutting down: canceling sessions and waiting for cleanup");
            closing.shutdown().await;
        })
        .await?;
    Ok(())
}

async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    if state.root.is_cancelled() {
        (StatusCode::SERVICE_UNAVAILABLE, "shutting down")
    } else {
        (StatusCode::OK, "ready")
    }
}

async fn stats(State(state): State<AppState>) -> impl IntoResponse {
    use std::sync::atomic::Ordering::Relaxed;
    let s = &state.stats;
    let steps = s.steps.load(Relaxed).max(1);
    let cancellations = s.cancellations.load(Relaxed);
    Json(serde_json::json!({
        "sessions": state.session_count(),
        "sessionLimit": state.limits.sessions,
        "workers": state.limits.workers,
        "steps": s.steps.load(Relaxed),
        "meanStepMs": s.step_micros.load(Relaxed) as f64 / steps as f64 / 1000.0,
        "cancellations": cancellations,
        "meanCancelMs": s.cancel_micros.load(Relaxed) as f64 / cancellations.max(1) as f64 / 1000.0,
        "maxCancelMs": s.cancel_micros_max.load(Relaxed) as f64 / 1000.0,
        "numericalFailures": s.numerical_failures.load(Relaxed),
        "cleanupFailures": s.cleanup_failures.load(Relaxed),
    }))
}

fn find(
    state: &AppState,
    id: &str,
    headers: &HeaderMap,
) -> Result<Arc<Session>, (StatusCode, &'static str)> {
    let id = Uuid::from_str(id).map_err(|_| (StatusCode::BAD_REQUEST, "invalid session id"))?;
    let session = state
        .session(id)
        .ok_or((StatusCode::NOT_FOUND, "session not found"))?;
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if !session.authorized(token) {
        return Err((StatusCode::FORBIDDEN, "invalid session capability"));
    }
    Ok(session)
}

async fn create_session(State(state): State<AppState>) -> impl IntoResponse {
    match state.create_session().await {
        Ok(view) => {
            let token = state.session(view.id).expect("new session").access_token();
            (
                StatusCode::CREATED,
                [("x-session-token", token)],
                Json(view),
            )
                .into_response()
        }
        Err(CreateError::Full) => (
            StatusCode::SERVICE_UNAVAILABLE,
            [(header::RETRY_AFTER, "30")],
            "every model slot is in use",
        )
            .into_response(),
        Err(CreateError::Failed(error)) => {
            (StatusCode::INTERNAL_SERVER_ERROR, error).into_response()
        }
    }
}

async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    match find(&state, &id, &headers) {
        Ok(session) => Json(state.snapshot(&session)).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn delete_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    match find(&state, &id, &headers) {
        Ok(session) => {
            tokio::spawn(async move { state.close(session.id, "session deleted").await });
            StatusCode::ACCEPTED.into_response()
        }
        Err(error) => error.into_response(),
    }
}

async fn command(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(command): Json<ClientCommand>,
) -> impl IntoResponse {
    match find(&state, &id, &headers) {
        Ok(session) => {
            state.dispatch(session, command).await;
            StatusCode::ACCEPTED.into_response()
        }
        Err(error) => error.into_response(),
    }
}

struct Reader {
    state: AppState,
    session: Arc<Session>,
}
impl Drop for Reader {
    fn drop(&mut self) {
        self.state.disconnected(&self.session);
    }
}

async fn events(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let session = match find(&state, &id, &headers) {
        Ok(session) => session,
        Err(error) => return error.into_response(),
    };
    if !state.connected(&session) {
        return (StatusCode::TOO_MANY_REQUESTS, "too many readers").into_response();
    }
    let (snapshot, mut receiver) = state.subscribe(&session);
    let reader = Reader {
        state: state.clone(),
        session: session.clone(),
    };
    let stream = async_stream(move |mut yield_event| async move {
        let _reader = reader;
        let mut floor = snapshot.seq;
        yield_event(snapshot).await;
        loop {
            let received = tokio::select! {
                received = receiver.recv() => received,
                _ = session.closed() => break,
            };
            match received {
                Ok(envelope) if envelope.seq > floor => yield_event(envelope).await,
                Ok(_) => {}
                Err(RecvError::Lagged(skipped)) => {
                    tracing::debug!(skipped, "reader lagged; resending snapshot");
                    let snapshot = state.snapshot_envelope(&session);
                    floor = snapshot.seq;
                    yield_event(snapshot).await;
                }
                Err(RecvError::Closed) => break,
            }
        }
    });
    (
        [
            (header::CACHE_CONTROL, "no-cache, no-transform"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))),
    )
        .into_response()
}

fn async_stream<F, Fut>(body: F) -> impl Stream<Item = Result<Event, Infallible>>
where
    F: FnOnce(
            Box<
                dyn FnMut(
                        deepseek_lab::protocol::Envelope,
                    ) -> futures_util::future::BoxFuture<'static, ()>
                    + Send,
            >,
        ) -> Fut
        + Send
        + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let (tx, rx) = tokio::sync::mpsc::channel::<Event>(64);
    let sender_tx = tx.clone();
    let sender = move |envelope: deepseek_lab::protocol::Envelope| -> futures_util::future::BoxFuture<'static, ()> {
        let tx = sender_tx.clone();
        Box::pin(async move {
            if let Ok(data) = serde_json::to_string(&envelope) {
                let _ = tx.send(Event::default().id(envelope.seq.to_string()).data(data)).await;
            }
        })
    };
    let disconnected = tx.clone();
    tokio::spawn(async move {
        tokio::select! {
            _ = disconnected.closed() => {},
            _ = body(Box::new(sender)) => {},
        }
    });
    futures_util::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|event| (Ok(event), rx))
    })
}
