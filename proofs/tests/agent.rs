use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use proofs::{
    agent::{
        config::Config,
        governor::Limits,
        live::{Channel, Envelope, Event, Hub, Phase},
        memory::{AgentState, Call, Store, Trust, Turn},
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
    drop_first: bool,
    models_down: u32,
    hang_after: Option<usize>,
    viewer: Option<Box<dyn Send>>,
    leave_after: usize,
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

async fn models(State(script): State<Shared>) -> Response {
    let mut script = script.lock().unwrap();

    if script.models_down > 0 {
        script.models_down -= 1;

        return (StatusCode::SERVICE_UNAVAILABLE, "loading").into_response();
    }

    Json(json!({"object": "list", "data": [{"id": "mock", "object": "model"}]})).into_response()
}

async fn completions(State(shared): State<Shared>, Json(request): Json<Value>) -> Response {
    let hang = {
        let mut script = shared.lock().unwrap();

        script
            .hang_after
            .is_some_and(|after| script.requests.len() >= after)
            && {
                script.requests.push(request.clone());

                true
            }
    };

    if hang {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }

    let mut script = shared.lock().unwrap();

    if let Some(violation) = check_ids(&request) {
        script.violations.push(violation.clone());

        return (StatusCode::BAD_REQUEST, violation).into_response();
    }

    script.requests.push(request);

    if script.requests.len() == script.leave_after {
        script.viewer.take();
    }

    if script.fail_first {
        script.fail_first = false;

        return (StatusCode::INTERNAL_SERVER_ERROR, "warming up").into_response();
    }

    if script.drop_first {
        script.drop_first = false;

        let mut body = chunk(json!({"role": "assistant"}), None);

        body.push_str(&chunk(json!({"reasoning_content": "half a thou"}), None));

        return ([("content-type", "text/event-stream")], body).into_response();
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
        .route("/v1/models", get(models))
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
        trial_pairs: 4,
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

    let requests = shared.lock().unwrap().requests.clone();

    for message in requests
        .iter()
        .flat_map(|request| request["messages"].as_array().unwrap())
        .filter(|message| message["role"] != "user")
    {
        assert!(
            message["content"].is_string() || message["content"].is_null(),
            "the gateway takes typed parts only from users: {message}"
        );
    }

    assert!(requests.iter().any(|request| request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m["role"] == "tool")));

    assert_eq!(first["enable_thinking"], true);
    assert_eq!(first["model"], "mock");
    assert_eq!(first["stream"], true);
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
async fn proof_search_repairs_using_lean_errors_and_keeps_nested_blocks() {
    if !workbench::Workbench::new(workbench::Config::from_env(), vec![]).available() {
        return;
    }

    let statement = "theorem mock_repaired (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 0";
    let block = "have hn : ∀ n : ℕ, s ≠ -n := by\n  rintro n rfl\n  have : (0 : ℝ) ≤ n := n.cast_nonneg\n  simp at h0\n  linarith\nhave h1' : s ≠ 1 := by\n  rintro rfl\n  simp at h1\nrw [riemannZeta_one_sub hn h1', hs, mul_zero]";

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: VecDeque::from([
            vec![Part::Call(
                "plan",
                json!({"objective": "Prove reflection", "prediction": "The side conditions suffice", "instrument": "formalize"}),
            )],
            vec![Part::Call(
                "formalize",
                json!({"statement": statement, "claim": "rh"}),
            )],
            vec![Part::Call(
                "proof_plan",
                json!({"strategy": "Try a lemma", "candidates": ["exact missing_name"], "helpers": []}),
            )],
            vec![Part::Call(
                "proof_plan",
                json!({"strategy": "Repair the missing premise", "candidates": [block], "helpers": []}),
            )],
            vec![Part::Call(
                "conclude",
                json!({"summary": "Reflection checked", "next": "Use it"}),
            )],
        ]),
        ..Default::default()
    }));

    let store = Store::connect("mem://", None).await.unwrap();
    let mut settings = config(serve(shared.clone()).await);

    settings.sleep_every = 100;

    let mut agent = Agent::new(settings, store.clone(), Hub::new())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .unwrap()
        .unwrap();

    let lemmas = store.lemmas().await.unwrap();

    let lemma = lemmas
        .iter()
        .find(|lemma| lemma.name == "mock_repaired")
        .expect("the repaired proof is kept");

    assert!(lemma.code.contains("    rintro n rfl"));
    assert_eq!(store.node("rh").await.unwrap().unwrap().trust, Trust::Open);

    let requests = shared.lock().unwrap().requests.clone();

    assert_eq!(requests[2]["enable_thinking"], true);
    assert_eq!(requests[2]["max_tokens"], 512);

    let repair = requests[3]["messages"].to_string();

    assert!(
        repair.contains("missing_name") && repair.contains("Unknown identifier"),
        "{repair}"
    );

    assert!(repair.contains("mock_repaired") && repair.contains("hyps"));

    let first = requests[2]["messages"].to_string();

    assert!(
        first.contains("riemannZeta_one_sub") && first.contains("type"),
        "{first}"
    );

    shared.lock().unwrap().turns.extend([
        vec![Part::Call("plan", json!({"objective": "Test a nearby target", "prediction": "Past proofs are guidance only", "instrument": "formalize"}))],
        vec![Part::Call("formalize", json!({"statement": "theorem not_implied (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 1"}))],
        vec![Part::Call("proof_plan", json!({"strategy": "The checked example does not prove this conclusion", "candidates": [], "helpers": []}))],
        vec![Part::Call("conclude", json!({"summary": "Example recalled, new target not proved", "next": "Keep the verified conclusion"}))],
    ]);

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .unwrap()
        .unwrap();

    assert_eq!(store.lemmas().await.unwrap().len(), 1);

    let request = shared.lock().unwrap().requests[7].clone();

    let content = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["role"] == "user")
        .unwrap()["content"]
        .as_str()
        .unwrap();

    let context: Value = serde_json::from_str(content).unwrap();
    let examples = context["checked_examples"].as_array().unwrap();

    assert!(examples.iter().any(|example| example["statement"]
        .as_str()
        .unwrap()
        .contains("mock_repaired")
        && example["checked"] == true));

    assert!(examples.iter().all(|example| example["checked"] == true));
}

#[tokio::test]
async fn proof_helpers_are_checked_reused_and_replayed_in_order() {
    let bench_config = workbench::Config::from_env();

    if !workbench::Workbench::new(bench_config.clone(), vec![]).available() {
        return;
    }

    let statement = "theorem a_from_helper (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 0";
    let helper = "lemma z_helper_no_negative (s : ℂ) (h0 : 0 < s.re) : ∀ n : ℕ, s ≠ -n";
    let proof = "rintro n rfl\nhave : (0 : ℝ) ≤ n := n.cast_nonneg\nsimp at h0\nlinarith";
    let parent = "have h1' : s ≠ 1 := by\n  rintro rfl\n  simp at h1\nrw [riemannZeta_one_sub (z_helper_no_negative s h0) h1', hs, mul_zero]";

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: VecDeque::from([
            vec![Part::Call(
                "plan",
                json!({"objective": "Prove reflection via a bridge", "prediction": "The bridge suffices", "instrument": "formalize"}),
            )],
            vec![Part::Call(
                "formalize",
                json!({"statement": statement, "claim": "rh"}),
            )],
            vec![Part::Call(
                "proof_plan",
                json!({"strategy": "Prove the integer exclusion separately", "candidates": [parent], "helpers": [
                    {"statement": helper, "proof": proof}, {"statement": helper, "proof": proof}, {"statement": statement}
                ]}),
            )],
            vec![Part::Call(
                "conclude",
                json!({"summary": "Both checked", "next": "Reuse the bridge"}),
            )],
        ]),
        ..Default::default()
    }));

    let store = Store::connect("mem://", None).await.unwrap();
    let mut settings = config(serve(shared.clone()).await);

    settings.search_budget = 6;
    settings.sleep_every = 100;

    let mut agent = Agent::new(settings, store.clone(), Hub::new())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .unwrap()
        .unwrap();

    let lemmas = store.lemmas().await.unwrap();

    assert_eq!(
        lemmas
            .iter()
            .map(|lemma| lemma.name.as_str())
            .collect::<Vec<_>>(),
        ["z_helper_no_negative", "a_from_helper"]
    );

    assert_eq!(store.node("rh").await.unwrap().unwrap().trust, Trust::Open);

    let mut replay = workbench::Workbench::new(
        bench_config,
        lemmas.iter().map(|lemma| lemma.code.clone()).collect(),
    );

    let checked = replay.check("theorem after_restart (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 0 := a_from_helper s h0 h1 hs").await;

    assert!(checked.ok, "{checked:?}");

    assert_eq!(
        shared.lock().unwrap().requests.len(),
        4,
        "duplicate and cyclic helpers do not spawn extra model calls"
    );
}

#[tokio::test]
async fn proof_helpers_do_not_prove_a_false_parent() {
    if !workbench::Workbench::new(workbench::Config::from_env(), vec![]).available() {
        return;
    }

    let statement = "theorem false_parent : 2 + 2 = 5";

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: VecDeque::from([
            vec![Part::Call(
                "plan",
                json!({"objective": "Check the impossible target", "prediction": "It must fail", "instrument": "formalize"}),
            )],
            vec![Part::Call(
                "formalize",
                json!({"statement": statement, "claim": "false-parent"}),
            )],
            vec![Part::Call(
                "proof_plan",
                json!({"strategy": "Try a supporting lemma", "candidates": ["exact helper_only_true"], "helpers": [{"statement": "lemma helper_only_true : True", "proof": "trivial"}]}),
            )],
            vec![Part::Call(
                "proof_plan",
                json!({"strategy": "No valid proof", "candidates": [], "helpers": []}),
            )],
            vec![Part::Call(
                "conclude",
                json!({"summary": "The parent is still unproved", "next": "Use a true statement"}),
            )],
        ]),
        ..Default::default()
    }));

    let store = Store::connect("mem://", None).await.unwrap();

    let mut target = proofs::agent::memory::Node::new(
        "false-parent",
        proofs::agent::memory::Kind::Target,
        Trust::Open,
        "False target",
        statement,
    );

    target.lean = Some(statement.into());
    store.put_node(&target).await.unwrap();

    let mut settings = config(serve(shared).await);

    settings.search_budget = 3;
    settings.sleep_every = 100;

    let mut agent = Agent::new(settings, store.clone(), Hub::new())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .unwrap()
        .unwrap();

    let lemmas = store.lemmas().await.unwrap();

    assert_eq!(lemmas.len(), 1);
    assert_eq!(lemmas[0].name, "helper_only_true");

    assert_eq!(
        store.node("false-parent").await.unwrap().unwrap().trust,
        Trust::Open
    );

    assert!(store
        .turns(1)
        .await
        .unwrap()
        .iter()
        .flat_map(|turn| &turn.calls)
        .any(|call| call.tool == "formalize" && !call.ok));
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
    let dead = Router::new()
        .route(
            "/v1/chat/completions",
            post(|| async { (StatusCode::SERVICE_UNAVAILABLE, "down") }),
        )
        .route("/v1/models", get(|| async { "{\"data\": []}" }));

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

fn drain(events: &mut tokio::sync::broadcast::Receiver<Envelope>) -> Vec<Event> {
    let mut seen = Vec::new();

    while let Ok(envelope) = events.try_recv() {
        seen.push(envelope.event);
    }

    seen
}

async fn until(what: &str, mut ready: impl FnMut() -> bool) {
    for _ in 0..600 {
        if ready() {
            return;
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    panic!("timed out waiting for {what}");
}

#[tokio::test]
async fn a_gateway_restart_mid_turn_reconnects_without_trouble() {
    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: script(false),
        drop_first: true,
        models_down: 2,
        ..Default::default()
    }));

    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();
    let mut events = hub.subscribe();

    let mut agent = Agent::new(config(url), store.clone(), hub.clone())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .expect("the shift finishes")
        .expect("the shift succeeds");

    let seen = drain(&mut events);

    assert!(
        !seen.iter().any(|e| matches!(e, Event::Trouble { .. })),
        "a restart is not trouble"
    );

    assert!(seen.iter().any(|e| matches!(e, Event::Retry { turn: 0 })));

    assert!(seen.iter().any(|e| matches!(
        e,
        Event::Phase { phase: Phase::Rest, reason: Some(reason), .. } if reason.contains("reconnecting")
    )));

    let episode = store.episode(1).await.unwrap().expect("episode 1 stored");

    assert_eq!(episode.summary, "29 zeros below 100, none missing.");

    let turns = store.turns(1).await.unwrap();

    assert!(!turns[0].thought.contains("half a thou"));
    assert!(turns[0].thought.contains("Gram blocks"));
    assert_eq!(store.state().await.unwrap().unwrap().budget.failures, 0);
}

#[tokio::test]
async fn a_shutdown_mid_episode_keeps_the_record() {
    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: script(false),
        hang_after: Some(1),
        ..Default::default()
    }));

    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();

    let agent = Agent::new(config(url), store.clone(), hub.clone())
        .await
        .unwrap();

    let running = tokio::spawn(agent.run());

    until("the second request", || {
        shared.lock().unwrap().requests.len() >= 2
    })
    .await;

    hub.close();

    tokio::time::timeout(Duration::from_secs(10), running)
        .await
        .expect("the agent parks promptly")
        .unwrap();

    let episode = store.episode(1).await.unwrap().expect("episode 1 kept");

    assert_eq!(episode.summary, "Cut off by a restart after 1 action.");
    assert_eq!(episode.objective, "Locate every zero up to t = 100");
    assert_eq!(episode.turns, 1);

    let state = store.state().await.unwrap().unwrap();

    assert_eq!(state.episodes, 1);
    assert!(state.open_front.is_empty());
}

#[tokio::test]
async fn an_episode_a_hard_kill_cut_off_is_closed_on_the_next_shift() {
    let store = Store::connect("mem://", None).await.unwrap();

    store
        .save_state(&AgentState {
            awake_since: 1,
            open_front: "offline".into(),
            open_since: 5,
            ..Default::default()
        })
        .await
        .unwrap();

    store
        .put_turn(&Turn {
            episode: 1,
            index: 0,
            thought: "Aim near the closest pair.".into(),
            said: String::new(),
            calls: vec![Call {
                id: "c".into(),
                tool: "plan".into(),
                args: json!({"objective": "Search near t = 7005", "prediction": "No zeros"}),
                ok: true,
                summary: "Planned. Go.".into(),
                verdict: None,
                data: Value::Null,
            }],
            tokens: 10,
            at: 7,
        })
        .await
        .unwrap();

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: script(false),
        ..Default::default()
    }));

    let url = serve(shared.clone()).await;
    let hub = Hub::new();

    let mut agent = Agent::new(config(url), store.clone(), hub.clone())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .expect("the shift finishes")
        .expect("the shift succeeds");

    let cut = store
        .episode(1)
        .await
        .unwrap()
        .expect("the cut episode is closed");

    assert_eq!(cut.front, "offline");
    assert_eq!(cut.summary, "Cut off by a restart after 1 action.");
    assert_eq!(cut.objective, "Search near t = 7005");
    assert_eq!((cut.tokens, cut.started, cut.ended), (10, 5, 7));

    let next = store.episode(2).await.unwrap().expect("the new episode");

    assert_eq!(next.summary, "29 zeros below 100, none missing.");
    assert_eq!(store.turns(1).await.unwrap().len(), 1);
    assert_eq!(store.state().await.unwrap().unwrap().episodes, 2);
}

#[tokio::test]
async fn a_viewer_leaving_mid_episode_lets_it_finish_then_waits() {
    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: script(false),
        leave_after: 1,
        ..Default::default()
    }));

    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();

    shared.lock().unwrap().viewer = Some(Box::new(hub.subscribe()));

    let mut settings = config(url);

    settings.mode = proofs::agent::config::Mode::Watched;

    let agent = Agent::new(settings, store.clone(), hub.clone())
        .await
        .unwrap();

    let running = tokio::spawn(agent.run());
    let watched = store.clone();
    let mut letter = String::new();

    for _ in 0..600 {
        letter = watched.state().await.unwrap().unwrap_or_default().letter;

        if !letter.is_empty() {
            break;
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    assert_eq!(letter, "Climb, and watch the closest pairs.");
    tokio::time::sleep(Duration::from_millis(500)).await;

    let asked = shared.lock().unwrap().requests.len();

    hub.close();

    tokio::time::timeout(Duration::from_secs(10), running)
        .await
        .expect("the waiting agent parks")
        .unwrap();

    let episode = store.episode(1).await.unwrap().expect("episode 1 finished");

    assert_eq!(episode.summary, "29 zeros below 100, none missing.");
    assert_eq!(episode.turns, 5, "every scripted action ran");

    assert!(
        store.episode(2).await.unwrap().is_none(),
        "no viewer, no next episode"
    );

    assert_eq!(shared.lock().unwrap().requests.len(), asked);
}

#[tokio::test]
async fn a_call_written_while_thinking_still_runs() {
    let mut turns = script(false);

    turns[0] = vec![Part::Think(
        "Plan first.\n<tool_call>\n<function=plan>\n<parameter=objective>\nLocate every zero up to t = 100\n</parameter>\n<parameter=prediction>\nNone missing\n</parameter>\n<parameter=instrument>\nline\n</parameter>\n</function>\n</tool_call>\n",
    )];

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns,
        ..Default::default()
    }));

    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();

    let mut agent = Agent::new(config(url), store.clone(), Hub::new())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .expect("the shift finishes")
        .expect("the shift succeeds");

    let episode = store.episode(1).await.unwrap().unwrap();

    assert_eq!(episode.objective, "Locate every zero up to t = 100");

    let first = &store.turns(1).await.unwrap()[0];

    assert_eq!(first.thought.trim(), "Plan first.");
    assert_eq!(first.calls[0].tool, "plan");

    let requests = shared.lock().unwrap().requests.clone();

    assert!(!requests
        .iter()
        .any(|r| r.to_string().contains("No tool call arrived")));
}

#[tokio::test]
async fn a_thought_going_in_circles_is_stopped_and_named() {
    let mut turns = script(false);

    turns.push_front(
        (0..6)
            .map(|_| Part::Think("Let me try sigma_from=0.505 and sigma_to=0.6 again. "))
            .collect(),
    );

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns,
        ..Default::default()
    }));

    let url = serve(shared.clone()).await;
    let store = Store::connect("mem://", None).await.unwrap();

    let mut agent = Agent::new(config(url), store.clone(), Hub::new())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(120), agent.shift())
        .await
        .expect("the shift finishes")
        .expect("the shift succeeds");

    let requests = shared.lock().unwrap().requests.clone();

    let nudge = requests[1]["messages"]
        .as_array()
        .unwrap()
        .last()
        .unwrap()
        .to_string();

    assert!(nudge.contains("You were repeating yourself"), "{nudge}");

    let first = &store.turns(1).await.unwrap()[0];

    assert_eq!(first.thought.matches("Let me try").count(), 3);
    assert!(store.episode(1).await.unwrap().is_some());
}

fn quiet_episode() -> [Vec<Part>; 2] {
    [
        vec![Part::Call(
            "plan",
            json!({"move": "backwards", "objective": "Look", "prediction": "Nothing new", "instrument": "recall"}),
        )],
        vec![Part::Call(
            "conclude",
            json!({"summary": "Looked.", "next": "Look again."}),
        )],
    ]
}

#[tokio::test]
async fn a_rule_change_runs_blind_in_paired_episodes() {
    let rule = "Open every episode on the most-proving leaf of the tree.";
    let letter = || vec![Part::Call("letter", json!({"text": "Keep going."}))];
    let mut turns = VecDeque::new();

    turns.extend(quiet_episode());
    turns.push_back(letter());

    turns.push_back(vec![
        Part::Think("Plans wander; the tree says where to go."),
        Part::Call(
            "revise",
            json!({"change": "add", "text": rule, "because": "Episodes drifted away from the tree."}),
        ),
    ]);

    for _ in 0..2 {
        turns.extend(quiet_episode());
        turns.push_back(letter());
    }

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns,
        ..Default::default()
    }));

    let store = Store::connect("mem://", None).await.unwrap();
    let hub = Hub::new();
    let mut events = hub.subscribe();

    let mut agent = Agent::new(
        config(serve(shared.clone()).await),
        store.clone(),
        hub.clone(),
    )
    .await
    .unwrap();

    for _ in 0..3 {
        tokio::time::timeout(Duration::from_secs(120), agent.shift())
            .await
            .expect("the shift finishes")
            .expect("the shift succeeds");
    }

    let requests = shared.lock().unwrap().requests.clone();

    assert_eq!(
        requests.len(),
        10,
        "three episodes, three sleeps, one revision"
    );

    let revision = requests[3].to_string();

    assert!(revision.contains("How you revise") && revision.contains("revise"));
    assert_eq!(requests[3]["tools"].as_array().unwrap().len(), 1);

    assert!(
        !requests[4].to_string().contains(rule),
        "the old rules run first"
    );

    assert!(requests[7].to_string().contains(rule), "then the new rules");
    assert!(!requests[7].to_string().contains("on trial"), "blind");

    let second = store.episode(2).await.unwrap().unwrap();
    let third = store.episode(3).await.unwrap().unwrap();

    assert_eq!(second.front, third.front, "a pair shares its front");
    assert_eq!((second.rules, third.rules), (1, 2));
    assert_eq!(second.heuristic, "backwards");

    let state = store.state().await.unwrap().unwrap();

    assert_eq!((state.rules, state.challenger), (1, 2));
    assert!(state.half.is_none());

    let lineage = store.lineage().await.unwrap();

    let trial = lineage
        .iter()
        .find(|r| r.version == 2 && r.layer == proofs::agent::memory::Layer::Playbook)
        .unwrap();

    assert_eq!(trial.lines, vec![rule.to_string()]);
    assert_eq!(trial.pairs.len(), 1);

    assert_eq!(
        trial.change.as_ref().unwrap().because,
        "Episodes drifted away from the tree."
    );

    let seen = drain(&mut events);

    let wakes: Vec<u64> = seen
        .iter()
        .filter_map(|e| match e {
            Event::Wake { rules, .. } => Some(*rules),
            _ => None,
        })
        .collect();

    assert_eq!(wakes, vec![1, 1, 2]);
    assert!(seen.iter().any(|e| matches!(e, Event::Revise { .. })));

    assert!(seen
        .iter()
        .any(|e| matches!(e, Event::Outcome { tool, ok: true, .. } if tool == "revise")));
}

#[tokio::test]
async fn a_reduction_and_its_obligations_prove_the_mirror_by_composition() {
    if !workbench::Workbench::new(workbench::Config::from_env(), vec![]).available() {
        return;
    }

    let negatives = "∀ s : ℂ, 0 < s.re → ∀ n : ℕ, s ≠ -n";
    let pole = "∀ s : ℂ, s.re < 1 → s ≠ 1";

    let shared: Shared = Arc::new(Mutex::new(Script {
        turns: VecDeque::from([
            vec![Part::Call(
                "plan",
                json!({"move": "decompose", "objective": "Split the mirror into its side conditions", "prediction": "Two small lemmas suffice", "instrument": "reduce"}),
            )],
            vec![Part::Call(
                "reduce",
                json!({
                    "target": "mirror",
                    "from": [negatives, pole],
                    "titles": ["No negative integers right of 0", "Not the pole"],
                    "proof": "by\n  rw [riemannZeta_one_sub (ob1 s h0) (ob2 s h1), hs, mul_zero]",
                }),
            )],
            vec![Part::Call(
                "formalize",
                json!({
                    "statement": format!("theorem right_of_zero_not_negative : {negatives}"),
                    "proof": "by\n  rintro s h0 n rfl\n  have : (0 : ℝ) ≤ n := n.cast_nonneg\n  simp at h0\n  linarith",
                }),
            )],
            vec![Part::Call(
                "formalize",
                json!({
                    "statement": format!("theorem left_of_one_not_pole : {pole}"),
                    "proof": "by\n  rintro s h1 rfl\n  simp at h1",
                }),
            )],
            vec![Part::Call(
                "conclude",
                json!({"summary": "The mirror is proved.", "next": "Nothing left here."}),
            )],
        ]),
        ..Default::default()
    }));

    let store = Store::connect("mem://", None).await.unwrap();

    let arms = ["line", "offline", "spectra", "divisors", "mobius", "curves"]
        .iter()
        .map(|front| proofs::agent::memory::Arm {
            front: front.to_string(),
            pulls: 1,
            reward: 0.0,
        })
        .collect();

    store
        .save_state(&AgentState {
            awake_since: 1,
            arms,
            last_front: "line".into(),
            ..Default::default()
        })
        .await
        .unwrap();

    let mut settings = config(serve(shared.clone()).await);

    settings.sleep_every = 100;

    let mut agent = Agent::new(settings, store.clone(), Hub::new())
        .await
        .unwrap();

    tokio::time::timeout(Duration::from_secs(300), agent.shift())
        .await
        .expect("the shift finishes")
        .expect("the shift succeeds");

    let calls: Vec<Call> = store
        .turns(1)
        .await
        .unwrap()
        .into_iter()
        .flat_map(|turn| turn.calls)
        .collect();

    let summaries: Vec<&str> = calls.iter().map(|c| c.summary.as_str()).collect();

    assert!(calls.iter().all(|c| c.ok), "{summaries:#?}");

    let mirror = store.node("mirror").await.unwrap().unwrap();

    assert_eq!(mirror.trust, Trust::Verified, "{summaries:#?}");

    assert!(mirror.evidence.iter().any(|e| e
        .summary
        .starts_with("Proved by composing zero_mirror_from_e1_1")));

    let reductions = store.reductions().await.unwrap();

    assert_eq!(reductions.len(), 1);
    assert!(reductions[0].closed);

    let episode = store.episode(1).await.unwrap().unwrap();

    assert_eq!(episode.front, "lean");
    assert_eq!(episode.reduced, 1);
    assert_eq!(episode.heuristic, "decompose");

    assert!(store
        .lemmas()
        .await
        .unwrap()
        .iter()
        .any(|lemma| lemma.name == "zero_mirror"
            && lemma.code.contains("apply zero_mirror_from_e1_1")));

    let state = store.state().await.unwrap().unwrap();

    assert_eq!(state.reductions, 1);
}
