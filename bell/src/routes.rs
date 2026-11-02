use crate::{
    dealer::{self, Ask, Dealer, Event},
    plan::{Line, Plan},
    station::{self, Station},
};
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use bytes::Bytes;
use futures_util::{stream, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, sync::Arc};

fn ndjson<T: Serialize>(items: impl Stream<Item = T> + Send + 'static) -> Response {
    let body = items.map(|item| {
        let mut line = serde_json::to_vec(&item).unwrap_or_default();

        line.push(b'\n');
        Ok::<_, Infallible>(Bytes::from(line))
    });

    (
        [
            (header::CONTENT_TYPE, "application/x-ndjson"),
            (header::CACHE_CONTROL, "no-cache, no-transform"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Body::from_stream(body),
    )
        .into_response()
}

fn busy() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::RETRY_AFTER, "5")],
        Json(serde_json::json!({ "reason": "busy" })),
    )
        .into_response()
}

pub fn station(station: Arc<Station>) -> Router {
    Router::new()
        .route("/hello", get(hello))
        .route("/plan", post(plan))
        .with_state(station)
}

async fn hello(State(station): State<Arc<Station>>) -> impl IntoResponse {
    Json(serde_json::json!({
        "site": station.site.id,
        "clock": station.clock(false).await,
    }))
}

async fn plan(State(station): State<Arc<Station>>, Json(plan): Json<Plan>) -> Response {
    match station.run(plan).await {
        Ok(lines) => ndjson::<Line>(lines),
        Err(station::Refusal::Invalid) => StatusCode::BAD_REQUEST.into_response(),
        Err(station::Refusal::Busy) => busy(),
    }
}

pub fn open(dealer: Option<Arc<Dealer>>) -> Router {
    let health = Router::new().route("/healthz", get(|| async { "ok" }));

    match dealer {
        Some(dealer) => health.merge(
            Router::new()
                .route("/sites", get(sites))
                .route("/runs", post(runs))
                .with_state(dealer),
        ),
        None => health,
    }
}

#[derive(Deserialize)]
struct Fresh {
    fresh: Option<bool>,
}

async fn sites(State(dealer): State<Arc<Dealer>>, Query(q): Query<Fresh>) -> impl IntoResponse {
    Json(serde_json::json!({ "sites": dealer.sites(q.fresh.unwrap_or(false)).await }))
}

async fn runs(State(dealer): State<Arc<Dealer>>, Json(ask): Json<Ask>) -> Response {
    match dealer.run(ask).await {
        Ok(events) => ndjson::<Event>(stream::unfold(events, |mut rx| async move {
            rx.recv().await.map(|event| (event, rx))
        })),
        Err(dealer::Refusal::Invalid) => StatusCode::BAD_REQUEST.into_response(),
        Err(dealer::Refusal::Busy) => busy(),
    }
}
