use deepseek_lab::{
    protocol::{ClientCommand, Envelope, Phase, ServerEvent},
    state::{AppState, Limits, Session},
};
use std::{sync::Arc, time::Duration};
use tokio::sync::broadcast::Receiver;
use uuid::Uuid;

fn limits(workers: usize) -> Limits {
    Limits {
        workers,
        sessions: 8,
        idle: Duration::from_secs(600),
        budget: Duration::from_secs(120),
    }
}

async fn open(state: &AppState) -> (Arc<Session>, Receiver<Envelope>) {
    let view = state.create_session().await.ok().expect("session");
    let session = state.session(view.id).expect("stored");
    let (_, receiver) = state.subscribe(&session);
    (session, receiver)
}

async fn until<T>(
    receiver: &mut Receiver<Envelope>,
    mut pick: impl FnMut(&ServerEvent) -> Option<T>,
) -> T {
    tokio::time::timeout(Duration::from_secs(60), async {
        loop {
            let envelope = receiver.recv().await.expect("event stream");
            if let Some(found) = pick(&envelope.event) {
                return found;
            }
        }
    })
    .await
    .expect("timed out waiting for an event")
}

fn lifecycle(state: &'static str) -> impl FnMut(&ServerEvent) -> Option<(u64, u32)> {
    move |event| match event {
        ServerEvent::Lifecycle { operation } if operation.state == state => {
            Some((operation.retained_step, operation.steps_done))
        }
        _ => None,
    }
}

fn first_step(event: &ServerEvent) -> Option<u64> {
    match event {
        ServerEvent::Step(step) => Some(step.step),
        _ => None,
    }
}

fn start(generation: u64, phase: Phase, steps: u32) -> ClientCommand {
    ClientCommand::Start {
        command_id: Uuid::new_v4(),
        generation,
        phase,
        steps: Some(steps),
    }
}

fn cancel(generation: u64) -> ClientCommand {
    ClientCommand::Cancel {
        command_id: Uuid::new_v4(),
        generation,
        operation_id: None,
    }
}

fn states(state: &AppState, session: &Session) -> Vec<String> {
    state
        .snapshot(session)
        .journal
        .into_iter()
        .map(|entry| entry.state)
        .collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cancel_keeps_what_was_committed_in_every_phase() {
    let state = AppState::new(limits(2));
    let (session, mut events) = open(&state).await;
    for phase in [Phase::Pretrain, Phase::Sft, Phase::Rl, Phase::Distill] {
        state.dispatch(session.clone(), start(1, phase, 500)).await;
        until(&mut events, first_step).await;
        for _ in 0..3 {
            state.dispatch(session.clone(), cancel(1)).await;
        }
        let (retained, _) = until(&mut events, lifecycle("canceled")).await;
        let snapshot = state.snapshot(&session);
        if phase == Phase::Distill {
            assert_eq!(
                retained, snapshot.phase_steps.distill,
                "student updates survive"
            );
        } else {
            assert_eq!(retained, snapshot.step, "{phase:?} published what it kept");
        }
        assert_eq!(snapshot.workers.busy, 0, "{phase:?} released its worker");
        let journal = states(&state, &session);
        let tail = &journal[journal.len() - 3..];
        assert_eq!(tail, ["cancelRequested", "compensating", "canceled"]);
        assert_eq!(
            journal.iter().filter(|s| *s == "canceled").count(),
            phase_index(phase)
        );
    }
}

fn phase_index(phase: Phase) -> usize {
    match phase {
        Phase::Pretrain => 1,
        Phase::Sft => 2,
        Phase::Rl => 3,
        _ => 4,
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn pause_releases_the_worker_and_resume_finishes_the_same_operation() {
    let state = AppState::new(limits(1));
    let (session, mut events) = open(&state).await;
    state
        .dispatch(session.clone(), start(1, Phase::Pretrain, 40))
        .await;
    until(&mut events, first_step).await;
    state
        .dispatch(
            session.clone(),
            ClientCommand::Pause {
                command_id: Uuid::new_v4(),
                generation: 1,
            },
        )
        .await;
    let (kept, done) = until(&mut events, lifecycle("paused")).await;
    assert_eq!(kept, done as u64);
    tokio::time::sleep(Duration::from_millis(250)).await;
    let snapshot = state.snapshot(&session);
    assert_eq!(snapshot.step, kept, "nothing trains while paused");
    assert_eq!(snapshot.workers.busy, 0, "a paused model holds no worker");

    state
        .dispatch(
            session.clone(),
            ClientCommand::Resume {
                command_id: Uuid::new_v4(),
                generation: 1,
            },
        )
        .await;
    let (kept, done) = until(&mut events, lifecycle("completed")).await;
    assert_eq!((kept, done), (40, 40));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_queued_operation_cancels_without_touching_anyone() {
    let state = AppState::new(limits(1));
    let (first, mut first_events) = open(&state).await;
    let (second, mut second_events) = open(&state).await;
    state
        .dispatch(first.clone(), start(1, Phase::Pretrain, 400))
        .await;
    until(&mut first_events, first_step).await;
    state
        .dispatch(second.clone(), start(1, Phase::Pretrain, 400))
        .await;
    until(&mut second_events, lifecycle("queued")).await;
    assert_eq!(state.snapshot(&second).workers.busy, 1);

    state.dispatch(second.clone(), cancel(1)).await;
    let (kept, done) = until(&mut second_events, lifecycle("canceled")).await;
    assert_eq!((kept, done), (0, 0));
    assert_eq!(
        state.snapshot(&second).revision,
        0,
        "isolated from the other session"
    );

    state.dispatch(first.clone(), cancel(1)).await;
    until(&mut first_events, lifecycle("canceled")).await;
    assert_eq!(state.snapshot(&first).workers.busy, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn retries_are_deduplicated_and_reset_rejects_the_old_generation() {
    let state = AppState::new(limits(2));
    let (session, mut events) = open(&state).await;
    let command = start(1, Phase::Pretrain, 5);
    state.dispatch(session.clone(), command.clone()).await;
    state.dispatch(session.clone(), command).await;
    until(&mut events, lifecycle("completed")).await;
    assert_eq!(
        states(&state, &session)
            .iter()
            .filter(|s| *s == "queued")
            .count(),
        1
    );
    assert_eq!(state.snapshot(&session).step, 5);

    state
        .dispatch(session.clone(), start(1, Phase::Pretrain, 500))
        .await;
    until(&mut events, first_step).await;
    state
        .dispatch(
            session.clone(),
            ClientCommand::Reset {
                command_id: Uuid::new_v4(),
                generation: 1,
            },
        )
        .await;
    let fresh = until(&mut events, |event| match event {
        ServerEvent::Snapshot { session } => Some(session.clone()),
        _ => None,
    })
    .await;
    assert_eq!((fresh.generation, fresh.step, fresh.revision), (2, 0, 0));
    assert!(fresh.curve.is_empty() && fresh.operation.is_none());
    assert_eq!(fresh.workers.busy, 0);

    state
        .dispatch(session.clone(), start(1, Phase::Pretrain, 5))
        .await;
    let code = until(&mut events, |event| match event {
        ServerEvent::Error { code, .. } => Some(code.clone()),
        _ => None,
    })
    .await;
    assert_eq!(code, "stale");
    assert_eq!(
        state.snapshot(&session).step,
        0,
        "the stale command trained nothing"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn answering_never_moves_the_weights_and_bad_input_never_runs() {
    let state = AppState::new(limits(2));
    let (session, mut events) = open(&state).await;
    state
        .dispatch(session.clone(), start(1, Phase::Pretrain, 8))
        .await;
    until(&mut events, lifecycle("completed")).await;
    let before = state.snapshot(&session);

    let ask = |code: &str| ClientCommand::Ask {
        command_id: Uuid::new_v4(),
        generation: 1,
        code: code.into(),
        question: "value of y ?".into(),
    };
    state
        .dispatch(session.clone(), ask("let mut y = 4; y = 7;"))
        .await;
    let truth = until(&mut events, |event| match event {
        ServerEvent::Token(token) if token.done => Some(token.truth.clone()),
        _ => None,
    })
    .await;
    assert_eq!(
        truth.as_deref(),
        Some("7"),
        "the evaluator, not the model, says what is true"
    );
    until(&mut events, lifecycle("completed")).await;
    let after = state.snapshot(&session);
    assert_eq!((after.step, after.revision), (before.step, before.revision));

    state
        .dispatch(session.clone(), ask("std::process::exit(0)"))
        .await;
    let code = until(&mut events, |event| match event {
        ServerEvent::Error { code, .. } => Some(code.clone()),
        _ => None,
    })
    .await;
    assert_eq!(code, "unsupported");
    assert_eq!(
        state.snapshot(&session).probe.unwrap().line.code,
        "let mut y = 4; y = 7;"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn idle_cleanup_keeps_connected_readers() {
    let state = AppState::new(Limits {
        idle: Duration::ZERO,
        ..limits(1)
    });
    let (session, _) = open(&state).await;
    assert!(state.connected(&session));
    assert!(state.connected(&session));

    state.sweep().await;
    assert!(
        state.session(session.id).is_some(),
        "reading is not abandonment"
    );

    state.disconnected(&session);
    state.sweep().await;
    assert!(
        state.session(session.id).is_some(),
        "another reader is still connected"
    );

    state.disconnected(&session);
    state.sweep().await;
    assert!(
        state.session(session.id).is_none(),
        "disconnected idle sessions still expire"
    );
    state.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn losing_the_last_reader_pauses_and_closing_cleans_up() {
    let state = AppState::new(limits(1));
    let (session, mut events) = open(&state).await;
    state.connected(&session);
    state
        .dispatch(session.clone(), start(1, Phase::Pretrain, 400))
        .await;
    until(&mut events, first_step).await;
    state.disconnected(&session);
    until(&mut events, lifecycle("paused")).await;

    state.close(session.id, "session deleted").await;
    assert!(state.session(session.id).is_none());
    assert_eq!(state.session_count(), 0);

    let (other, mut other_events) = open(&state).await;
    state
        .dispatch(other.clone(), start(1, Phase::Pretrain, 400))
        .await;
    until(&mut other_events, first_step).await;
    state.shutdown().await;
    assert_eq!(state.session_count(), 0);
    assert!(state.root.is_cancelled());
}
