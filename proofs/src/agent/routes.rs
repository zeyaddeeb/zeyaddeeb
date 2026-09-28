use super::{
    fronts::FRONTS,
    live::{Envelope, Hub},
    memory::{AgentState, Episode, Lemma, Link, Node, Probe, Store, Stretch, Turn},
    About,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event as SseEvent, KeepAlive, Sse},
        IntoResponse,
    },
    routing::get,
    Json, Router,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, f64::consts::PI, sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tokio_stream::wrappers::BroadcastStream;

const WATCHERS: usize = 256;
const BINS: usize = 48;
const RECENT_ZEROS: usize = 240;
const PAGE: usize = 60;

#[derive(Clone)]
struct Shared {
    hub: Arc<Hub>,
    store: Store,
    about: Arc<About>,
    seats: Arc<Semaphore>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Front {
    id: &'static str,
    title: &'static str,
    question: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bin {
    from: f64,
    to: f64,
    zeros: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Strip {
    frontier: f64,
    bins: Vec<Bin>,
    recent: Vec<f64>,
    closest: Vec<(f64, f64)>,
    probes: Vec<Probe>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Overview {
    about: Arc<About>,
    state: AgentState,
    fronts: Vec<Front>,
    backlog: Vec<Envelope>,
    episodes: Vec<Episode>,
    nodes: Vec<Node>,
    links: Vec<Link>,
    lemmas: Vec<Lemma>,
    strip: Strip,
    watchers: usize,
}

#[derive(Serialize)]
struct Mode {
    mode: &'static str,
}

#[derive(Deserialize)]
struct Page {
    before: Option<u64>,
}

#[derive(Deserialize)]
struct Search {
    q: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Transcript {
    episode: Episode,
    turns: Vec<Turn>,
}

pub fn router(hub: Arc<Hub>, store: Store, about: About) -> Router {
    Router::new()
        .route("/agent", get(overview))
        .route("/agent/mode", get(mode))
        .route("/agent/events", get(events))
        .route("/agent/episodes", get(episodes))
        .route("/agent/search", get(search))
        .route("/agent/episodes/{number}", get(transcript))
        .with_state(Shared {
            hub,
            store,
            about: Arc::new(about),
            seats: Arc::new(Semaphore::new(WATCHERS)),
        })
}

async fn overview(State(shared): State<Shared>) -> Result<Json<Overview>, StatusCode> {
    let store = &shared.store;
    let failed = |error: anyhow::Error| {
        tracing::error!(%error, "agent overview");
        StatusCode::SERVICE_UNAVAILABLE
    };
    let stretches = store.stretches().await.map_err(failed)?;
    let mut probes = store.probes().await.map_err(failed)?;
    let keep = probes.len().saturating_sub(200);
    probes.drain(..keep);
    let state = store.state().await.map_err(failed)?.unwrap_or_default();
    Ok(Json(Overview {
        about: shared.about.clone(),
        strip: strip(state.frontier, &stretches, probes),
        state,
        fronts: FRONTS
            .iter()
            .map(|front| Front {
                id: front.id,
                title: front.title,
                question: front.question,
            })
            .collect(),
        backlog: shared.hub.backlog(),
        episodes: store.episodes(PAGE).await.map_err(failed)?,
        nodes: store.nodes().await.map_err(failed)?,
        links: store.links().await.map_err(failed)?,
        lemmas: store.lemmas().await.map_err(failed)?,
        watchers: shared.hub.watchers(),
    }))
}

async fn mode(State(shared): State<Shared>) -> Json<Mode> {
    Json(Mode {
        mode: shared.about.mode,
    })
}

async fn events(State(shared): State<Shared>) -> impl IntoResponse {
    let Ok(seat) = shared.seats.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let hub = shared.hub.clone();
    let stream = BroadcastStream::new(shared.hub.subscribe())
        .filter_map(move |item| {
            let _seat = &seat;
            async move {
                let envelope = item.ok()?;
                let data = serde_json::to_string(&envelope).ok()?;
                Some(Ok::<_, Infallible>(SseEvent::default().data(data)))
            }
        })
        .take_until(async move { hub.closed().await });
    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(20)))
        .into_response()
}

async fn episodes(
    State(shared): State<Shared>,
    Query(page): Query<Page>,
) -> Result<Json<Vec<Episode>>, StatusCode> {
    shared
        .store
        .episodes_before(page.before.unwrap_or(u64::MAX / 2), PAGE)
        .await
        .map(Json)
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
}

async fn search(
    State(shared): State<Shared>,
    Query(search): Query<Search>,
) -> Result<Json<Vec<Episode>>, StatusCode> {
    let query: String = search.q.chars().take(100).collect();
    if query.trim().is_empty() {
        return Ok(Json(Vec::new()));
    }
    shared
        .store
        .search(&query, 12)
        .await
        .map(Json)
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
}

async fn transcript(
    State(shared): State<Shared>,
    Path(number): Path<u64>,
) -> Result<Json<Transcript>, StatusCode> {
    let store = &shared.store;
    let episode = store
        .episode(number)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let turns = store
        .turns(number)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(Json(Transcript { episode, turns }))
}

fn strip(frontier: f64, stretches: &[Stretch], probes: Vec<Probe>) -> Strip {
    let mut zeros: Vec<f64> = stretches
        .iter()
        .flat_map(|s| s.zeros.iter().copied())
        .collect();
    crate::math::line::distinct(&mut zeros);
    let top = zeros
        .last()
        .copied()
        .unwrap_or(frontier)
        .max(frontier)
        .max(10.0);
    let width = (top - 10.0) / BINS as f64;
    let bins = (0..BINS)
        .map(|i| {
            let from = 10.0 + width * i as f64;
            let to = from + width;
            Bin {
                from,
                to,
                zeros: zeros.iter().filter(|&&z| z >= from && z < to).count(),
            }
        })
        .filter(|_| width > 0.0)
        .collect();
    let mut pairs: Vec<(f64, f64)> = zeros.windows(2).map(|w| (w[0], w[1])).collect();
    let normalized = |(a, b): &(f64, f64)| (b - a) * (a / (2.0 * PI)).ln() / (2.0 * PI);
    pairs.sort_by(|x, y| normalized(x).total_cmp(&normalized(y)));
    pairs.truncate(8);
    Strip {
        frontier,
        bins,
        recent: zeros[zeros.len().saturating_sub(RECENT_ZEROS)..].to_vec(),
        closest: pairs,
        probes,
    }
}
