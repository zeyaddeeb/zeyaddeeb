use crate::cups::reason::{Action, Desk, Refusal, Run};
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use futures_util::stream;
use serde::Deserialize;
use std::{convert::Infallible, str::FromStr, sync::Arc, time::Duration};
use tokio::sync::broadcast::error::RecvError;
use uuid::Uuid;

#[derive(Deserialize)]
struct Ask {
    start: usize,
    swaps: Vec<usize>,
}

pub fn routes(desk: Arc<Desk>) -> Router {
    Router::new()
        .route("/cups/status", get(status))
        .route("/cups/runs", post(open))
        .route("/cups/runs/{id}", axum::routing::delete(close))
        .route("/cups/runs/{id}/actions", post(act))
        .route("/cups/runs/{id}/events", get(events))
        .with_state(desk)
}

fn find(desk: &Desk, id: &str, headers: &HeaderMap) -> Result<Arc<Run>, StatusCode> {
    let id = Uuid::from_str(id).map_err(|_| StatusCode::BAD_REQUEST)?;
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");

    desk.find(id, token).ok_or(StatusCode::NOT_FOUND)
}

async fn status(State(desk): State<Arc<Desk>>) -> impl IntoResponse {
    Json(serde_json::json!({ "live": desk.live(), "busy": desk.busy() }))
}

async fn open(State(desk): State<Arc<Desk>>, Json(ask): Json<Ask>) -> Response {
    match desk.open(ask.start, &ask.swaps) {
        Ok(run) => (
            StatusCode::CREATED,
            [("x-run-token", run.token())],
            Json(serde_json::json!({ "id": run.id })),
        )
            .into_response(),
        Err(Refusal::Invalid) => StatusCode::BAD_REQUEST.into_response(),
        Err(Refusal::Off) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "reason": "off" })),
        )
            .into_response(),
        Err(Refusal::Busy) => (
            StatusCode::SERVICE_UNAVAILABLE,
            [(header::RETRY_AFTER, "30")],
            Json(serde_json::json!({ "reason": "busy" })),
        )
            .into_response(),
    }
}

async fn close(
    State(desk): State<Arc<Desk>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    match find(&desk, &id, &headers) {
        Ok(run) => {
            desk.close(run.id);
            StatusCode::ACCEPTED.into_response()
        }
        Err(code) => code.into_response(),
    }
}

async fn act(
    State(desk): State<Arc<Desk>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(action): Json<Action>,
) -> Response {
    match find(&desk, &id, &headers) {
        Ok(run) if desk.act(&run, action) => StatusCode::ACCEPTED.into_response(),
        Ok(_) => StatusCode::CONFLICT.into_response(),
        Err(code) => code.into_response(),
    }
}

async fn events(
    State(desk): State<Arc<Desk>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let run = match find(&desk, &id, &headers) {
        Ok(run) => run,
        Err(code) => return code.into_response(),
    };
    let (snapshot, receiver) = run.subscribe();
    let floor = snapshot.seq;

    run.touch();

    let first = stream::once(async move { Ok::<_, Infallible>(frame(&snapshot)) });
    let rest = stream::unfold(
        (receiver, run, floor),
        |(mut receiver, run, mut floor)| async move {
            loop {
                match receiver.recv().await {
                    Ok(envelope) if envelope.seq > floor => {
                        floor = envelope.seq;
                        run.touch();
                        return Some((Ok(frame(&envelope)), (receiver, run, floor)));
                    }
                    Ok(_) => {}
                    Err(RecvError::Lagged(_)) => {
                        let snapshot = run.snapshot();

                        floor = snapshot.seq;
                        return Some((Ok(frame(&snapshot)), (receiver, run, floor)));
                    }
                    Err(RecvError::Closed) => return None,
                }
            }
        },
    );

    (
        [
            (header::CACHE_CONTROL, "no-cache, no-transform"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Sse::new(futures_util::StreamExt::chain(first, rest))
            .keep_alive(KeepAlive::new().interval(Duration::from_secs(15))),
    )
        .into_response()
}

fn frame(envelope: &crate::cups::reason::Envelope) -> Event {
    Event::default()
        .id(envelope.seq.to_string())
        .data(serde_json::to_string(envelope).unwrap_or_default())
}
