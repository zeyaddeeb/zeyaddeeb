use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use proofs::{
    agent::{
        config::Config,
        governor::Limits,
        live::{Channel, Event, Hub},
        memory::{Store, Trust},
        Agent,
    },
    lean::workbench,
};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};

enum Part {
    Think(&'static str),
    Say(&'static str),
    Call(&'static str, Value),
}

#[derive(Default)]
struct Script {
    turns: VecDeque<Vec<Part>>,
    fail_first: bool,
    requests: Vec<Value>,
    violations: Vec<String>,
}

type Shared = Arc<Mutex<Script>>;

fn chunk(delta: Value, finish: Option<&str>) -> String {
    let body = json!({
        "id": "mock",
        "object": "chat.completion.chunk",
        "created": 0,
        "model": "mock",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    });
    format!("data: {body}\n\n")
}

fn check_ids(request: &Value) -> Option<String> {
    let mut issued = Vec::new();
    for message in request["messages"].as_array()? {
        if let Some(calls) = message["tool_calls"].as_array() {
            issued.extend(
                calls
                    .iter()
                    .filter_map(|c| c["id"].as_str().map(str::to_string)),
            );
        }
        if message["role"] == "tool" {
            let id = message["tool_call_id"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            if !issued.contains(&id) {
                return Some(format!("tool result {id} answers no call"));
            }
        }
    }
    None
}

async fn completions(State(script): State<Shared>, Json(request): Json<Value>) -> Response {
    let mut script = script.lock().unwrap();
    if let Some(violation) = check_ids(&request) {
        script.violations.push(violation.clone());
        return (StatusCode::BAD_REQUEST, violation).into_response();
    }
    script.requests.push(request);
    if script.fail_first {
        script.fail_first = false;
        return (StatusCode::INTERNAL_SERVER_ERROR, "warming up").into_response();
    }
    let parts = script.turns.pop_front().unwrap_or_else(|| {
        vec![Part::Call(
            "conclude",
            json!({"summary": "Out of script.", "next": "Nothing."}),
        )]
    });
    let mut body = chunk(json!({"role": "assistant"}), None);
    let mut calls = 0;
    for part in parts {
        body.push_str(&match part {
            Part::Think(text) => chunk(json!({"reasoning_content": text}), None),
            Part::Say(text) => chunk(json!({"content": text}), None),
            Part::Call(name, args) => {
                calls += 1;
                chunk(
                    json!({"tool_calls": [{
                        "index": calls - 1,
                        "id": format!("call_{}_{calls}", script.requests.len()),
                        "type": "function",
                        "function": {"name": name, "arguments": args.to_string()},
                    }]}),
                    None,
                )
            }
        });
    }
    let finish = if calls > 0 { "tool_calls" } else { "stop" };
    body.push_str(&chunk(json!({}), Some(finish)));
    body.push_str("data: [DONE]\n\n");
    ([("content-type", "text/event-stream")], body).into_response()
}

async fn serve(script: Shared) -> String {
    let app = Router::new()
        .route("/v1/chat/completions", post(completions))
        .with_state(script);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}/v1")
}

fn config(url: String) -> Config {
    Config {
        mode: proofs::agent::config::Mode::Always,
        llm_url: url,
        model: "mock".into(),
        api_key: "none".into(),
        database: "mem://".into(),
        holder: "test".into(),
        actions: 8,
        max_tokens: 512,
        turn_limit: Duration::from_secs(30),
        rest_watched: Duration::ZERO,
        rest_unwatched: Duration::ZERO,
        sleep_every: 1,
        keep_episodes: 10,
        search_budget: 2,
        limits: Limits {
            tokens_per_day: 1_000_000,
            backoff_base: Duration::ZERO,
            backoff_max: Duration::ZERO,
            failures_before_giving_up: 3,
        },
        workbench: workbench::Config::from_env(),
    }
}

fn script(lean: bool) -> VecDeque<Vec<Part>> {
    let mut turns = VecDeque::from([
        vec![
            Part::Think("Gram blocks first; a short block would be news."),
            Part::Call(
                "plan",
                json!({"objective": "Locate every zero up to t = 100", "prediction": "None missing", "instrument": "line"}),
            ),
        ],
        vec![
            Part::Say("Recording the claim before I look."),
            Part::Call(
                "conjecture",
                json!({"title": "Nothing missing below 100", "statement": "Every Gram block below t = 100 holds its Rosser count."}),
            ),
        ],
        vec![Part::Call(
            "line",
            json!({"from": 10, "to": 100, "claim": "e1-1", "expect": {"field": "bad_gram", "op": "=", "value": 0}}),
        )],
        vec![Part::Call(
            "line",
            json!({"expect": {"field": "missing", "op": "=", "value": 0}}),
        )],
    ]);
    if lean {
        turns.push_back(vec![Part::Call(
            "formalize",
            json!({"statement": "theorem mock_found (x : ℝ) (h : 0 < x) : 0 < x ^ 2 + x"}),
        )]);
        turns.push_back(vec![Part::Call(
            "formalize",
            json!({"statement": "theorem mock_found_again (y : ℝ) (h : 0 < y) : 0 < y ^ 2 + y"}),
        )]);
        turns.push_back(vec![Part::Call(
            "formalize",
            json!({
                "statement": "theorem mock_zero_re_lt_one (s : ℂ) (hs : riemannZeta s = 0) : s.re < 1",
                "proof": "by\n  by_contra h\n  exact riemannZeta_ne_zero_of_one_le_re (not_lt.mp h) hs",
                "claim": "rh",
            }),
        )]);
    }
    turns.extend([
        vec![Part::Call(
            "conclude",
            json!({"summary": "29 zeros below 100, none missing.", "next": "Climb to 300."}),
        )],
        vec![Part::Call(
            "insight",
            json!({"title": "Rosser holds early", "body": "No short blocks yet.", "basis": ["e1-1"]}),
        )],
        vec![Part::Call("letter", json!({"text": "Climb, and watch the closest pairs."}))],
    ]);
    turns
}

#[tokio::test]
async fn one_shift_climbs_the_trust_ladder_and_sleeps() {
    let lean = workbench::Workbench::new(workbench::Config::from_env(), Vec::new()).available();
    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: script(lean),
        fail_first: true,
        ..Default::default()
    }));
    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();
    let mut agent = Agent::new(config(url), store.clone(), hub.clone())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .expect("the shift finishes")
        .expect("the shift succeeds");

    let (violations, first) = {
        let script = shared.lock().unwrap();
        (script.violations.clone(), script.requests[0].clone())
    };
    assert!(violations.is_empty(), "{violations:?}");
    assert_eq!(first["enable_thinking"], true);
    assert!(first["tools"].as_array().unwrap().len() >= 7);

    let episode = store.episode(1).await.unwrap().expect("episode 1 stored");
    assert_eq!(episode.front, "line");
    assert_eq!(episode.held, 1);
    assert_eq!(episode.known, 1);
    assert_eq!(episode.summary, "29 zeros below 100, none missing.");

    let claim = store.node("e1-1").await.unwrap().expect("the conjecture");
    assert_eq!(claim.trust, Trust::Measured);
    assert_eq!(claim.evidence.len(), 1);

    let state = store.state().await.unwrap().unwrap();
    assert!(state.frontier > 100.0, "{}", state.frontier);
    assert_eq!(state.missing, 0);
    assert_eq!((state.predictions, state.held, state.known), (1, 1, 1));
    let stretches = store.stretches().await.unwrap();
    let mut zeros: Vec<f64> = stretches.iter().flat_map(|s| s.zeros.clone()).collect();
    proofs::math::line::distinct(&mut zeros);
    let below = zeros.iter().filter(|&&z| z <= state.frontier).count();
    assert_eq!(state.zeros as usize, below);
    assert_eq!(zeros.iter().filter(|&&z| z < 100.0).count(), 29);
    assert_eq!(state.letter, "Climb, and watch the closest pairs.");
    assert!(store.node("s1-1").await.unwrap().is_some());

    if lean {
        let lemmas = store.lemmas().await.unwrap();
        assert_eq!(lemmas.len(), 2, "the restated lemma is refused");
        let found = lemmas.iter().find(|l| l.name == "mock_found").unwrap();
        assert!(found.code.contains(":= by"), "{}", found.code);
        assert!(found.routine);
        assert!(
            store.node("lean-mock_found").await.unwrap().is_none(),
            "routine lemmas stay out of the blueprint"
        );
        let proved = store
            .node("lean-mock_zero_re_lt_one")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(proved.trust, Trust::Verified);
        let rh = store.node("rh").await.unwrap().unwrap();
        assert_eq!(
            rh.trust,
            Trust::Open,
            "a different statement cannot prove rh"
        );
        assert!(store
            .links()
            .await
            .unwrap()
            .iter()
            .any(|l| l.from == "lean-mock_zero_re_lt_one" && l.to == "rh"));
        assert_eq!((state.verified, state.routine), (1, 1));
    }

    let turns = store.turns(1).await.unwrap();
    assert!(turns[0].thought.contains("Gram blocks"));
    let backlog = hub.backlog();
    assert!(backlog
        .iter()
        .any(|e| matches!(&e.event, Event::Sleep { after: 1 })));
    assert!(!backlog
        .iter()
        .any(|e| matches!(&e.event, Event::Delta { channel: Channel::Think, text, .. } if text.contains("Gram"))));
    let transcript = store.turns(1).await.unwrap();
    let line = transcript
        .iter()
        .flat_map(|t| &t.calls)
        .find(|c| c.tool == "line")
        .expect("line call stored");
    assert!(line.verdict.as_ref().unwrap().held);
    assert!(line.verdict.as_ref().unwrap().known.is_none());
    assert!(line.data["millis"].is_u64());
    let known = transcript
        .iter()
        .flat_map(|t| &t.calls)
        .filter(|c| c.tool == "line")
        .nth(1)
        .expect("second line call stored");
    assert_eq!(
        known.verdict.as_ref().unwrap().known.as_deref(),
        Some("Platt and Trudgian 2021")
    );
    assert!(known.data["turing"]["count"].is_u64(), "{}", known.data);
}

#[tokio::test]
async fn watched_mode_waits_for_a_viewer_before_it_spends_anything() {
    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: script(false),
        ..Default::default()
    }));
    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();
    let mut settings = config(url);
    settings.mode = proofs::agent::config::Mode::Watched;
    let mut agent = Agent::new(settings, store.clone(), hub.clone())
        .await
        .unwrap();
    let waited = tokio::time::timeout(Duration::from_secs(2), agent.shift()).await;
    assert!(waited.is_err(), "no viewer, no episode");
    assert!(shared.lock().unwrap().requests.is_empty());
    let _viewer = hub.subscribe();
    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .expect("a viewer wakes it")
        .expect("the shift succeeds");
    assert!(store.episode(1).await.unwrap().is_some());
}

#[tokio::test]
async fn switched_off_it_still_opens_its_notebook() {
    let (store, about) = proofs::agent::archive("mem://").await.unwrap();
    assert_eq!(about.mode, "off");
    assert_eq!(about.calibration.len(), 6);
    assert!(store.episodes(5).await.unwrap().is_empty());
}

#[tokio::test]
async fn a_dead_gateway_is_given_up_on_gracefully() {
    let dead = Router::new().route(
        "/v1/chat/completions",
        post(|| async { (StatusCode::SERVICE_UNAVAILABLE, "down") }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, dead).await.unwrap() });
    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();
    let mut agent = Agent::new(
        config(format!("http://{address}/v1")),
        store.clone(),
        hub.clone(),
    )
    .await
    .unwrap();
    let stopped = tokio::time::timeout(Duration::from_secs(30), agent.shift())
        .await
        .expect("gives up in time");
    assert!(
        matches!(stopped, Err(proofs::agent::Stop::GaveUp)),
        "{stopped:?}"
    );
    let troubles = hub
        .backlog()
        .iter()
        .filter(|e| matches!(e.event, Event::Trouble { .. }))
        .count();
    assert_eq!(troubles, 3);
    assert!(store.episode(1).await.unwrap().is_none());
    assert_eq!(store.state().await.unwrap().unwrap().budget.failures, 3);
}
