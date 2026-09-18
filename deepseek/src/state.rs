use crate::{
    protocol::*,
    saga::{Operation, OperationState, Stop, Worker},
    train::{interrupted, Brain},
};
use dashmap::DashMap;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const TELEMETRY_BUFFER: usize = 256;
const CURVE_POINTS: usize = 2400;
const JOURNAL_ENTRIES: usize = 48;
const DREAMS: usize = 6;
const REMEMBERED_COMMANDS: usize = 256;
const STEP_INTERVAL: Duration = Duration::from_millis(100);
const PROBE_INTERVAL: Duration = Duration::from_millis(450);

#[derive(Clone)]
pub struct Limits {
    pub workers: usize,
    pub sessions: usize,
    pub idle: Duration,
    pub budget: Duration,
}

impl Limits {
    pub fn from_env() -> Self {
        let number = |key: &str, default: u64| {
            std::env::var(key)
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default)
        };
        Self {
            workers: number("DEEPSEEK_WORKERS", 2) as usize,
            sessions: number("DEEPSEEK_MAX_SESSIONS", 1000) as usize,
            idle: Duration::from_secs(number("DEEPSEEK_IDLE_SECONDS", 60)),
            budget: Duration::from_secs(number("DEEPSEEK_OPERATION_SECONDS", 300)),
        }
    }
}

#[derive(Default)]
struct Board {
    probe: Option<ProbeView>,
    curve: Vec<CurvePoint>,
    evaluations: Vec<EvaluationPoint>,
    dreams: VecDeque<DreamView>,
    rollout: Option<RolloutView>,
    distill: Option<DistillView>,
    journal: VecDeque<JournalEntry>,
    step: u64,
    revision: u64,
    phase_steps: PhaseSteps,
}

pub struct Session {
    pub id: Uuid,
    generation: AtomicU64,
    brain: Mutex<Brain>,
    info: ModelInfo,
    active: Mutex<Option<Arc<Operation>>>,
    board: Mutex<Board>,
    bus: broadcast::Sender<Envelope>,
    seq: AtomicU64,
    commands: Mutex<VecDeque<Uuid>>,
    token: CancellationToken,
    connections: AtomicUsize,
    idle_since: Mutex<Instant>,
    created: Instant,
    pending_focus: Mutex<Option<usize>>,
    pending_specimen: Mutex<Option<(String, String)>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Session {
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    /// Resolves once the session is closed, including at server shutdown.
    pub async fn closed(&self) {
        self.token.cancelled().await
    }

    fn publish(&self, event: ServerEvent) {
        let mut board = lock(&self.board);
        match &event {
            ServerEvent::Lifecycle { operation } => {
                let last = board.journal.back();
                if last.map(|e| (e.operation_id, e.state.as_str()))
                    != Some((operation.operation_id, operation.state.as_str()))
                {
                    board.journal.push_back(JournalEntry {
                        operation_id: operation.operation_id,
                        at_ms: self.created.elapsed().as_millis() as u64,
                        state: operation.state.clone(),
                        stage: operation.stage.clone(),
                    });
                    while board.journal.len() > JOURNAL_ENTRIES {
                        board.journal.pop_front();
                    }
                }
            }
            ServerEvent::Step(step) => {
                let first = step.step + 1 - step.losses.len() as u64;
                for (i, &loss) in step.losses.iter().enumerate() {
                    board.curve.push(CurvePoint {
                        step: first + i as u64,
                        phase: step.phase,
                        loss,
                    });
                }
                if board.curve.len() > CURVE_POINTS {
                    let mut keep = false;
                    board.curve.retain(|_| {
                        keep = !keep;
                        keep
                    });
                }
            }
            ServerEvent::Probe(probe) => {
                if let Some(dream) = &probe.dream {
                    board.dreams.push_back(dream.clone());
                    while board.dreams.len() > DREAMS {
                        board.dreams.pop_front();
                    }
                }
                board.probe = Some((**probe).clone());
            }
            ServerEvent::Rollout(rollout) => board.rollout = Some(rollout.clone()),
            ServerEvent::Distill(distill) => board.distill = Some(distill.clone()),
            _ => {}
        }
        let envelope = Envelope {
            v: PROTOCOL_VERSION,
            seq: self.seq.fetch_add(1, Ordering::SeqCst) + 1,
            generation: self.generation(),
            event,
        };
        let _ = self.bus.send(envelope);
    }

    fn error(&self, command_id: Option<Uuid>, code: &str, message: impl Into<String>) {
        self.publish(ServerEvent::Error {
            command_id,
            code: code.into(),
            message: message.into(),
        });
    }

    fn active(&self) -> Option<Arc<Operation>> {
        lock(&self.active)
            .clone()
            .filter(|op| !op.state().terminal())
    }
}

#[derive(Default)]
pub struct Stats {
    pub steps: AtomicU64,
    pub step_micros: AtomicU64,
    pub cancellations: AtomicU64,
    pub cancel_micros: AtomicU64,
    pub cancel_micros_max: AtomicU64,
    pub numerical_failures: AtomicU64,
    pub cleanup_failures: AtomicU64,
}

#[derive(Clone)]
pub struct AppState {
    sessions: Arc<DashMap<Uuid, Arc<Session>>>,
    permits: Arc<Semaphore>,
    pub limits: Limits,
    pub root: CancellationToken,
    pub stats: Arc<Stats>,
}

pub enum CreateError {
    Full,
    Failed(String),
}

impl AppState {
    pub fn new(limits: Limits) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            permits: Arc::new(Semaphore::new(limits.workers)),
            limits,
            root: CancellationToken::new(),
            stats: Arc::new(Stats::default()),
        }
    }

    pub fn session(&self, id: Uuid) -> Option<Arc<Session>> {
        self.sessions.get(&id).map(|s| s.clone())
    }

    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    fn workers(&self) -> WorkerView {
        WorkerView {
            capacity: self.limits.workers,
            busy: self.limits.workers - self.permits.available_permits(),
        }
    }

    pub async fn create_session(&self) -> Result<SessionView, CreateError> {
        if self.sessions.len() >= self.limits.sessions {
            return Err(CreateError::Full);
        }
        let id = Uuid::new_v4();
        let seed = id.as_u128() as u64;
        let brain = tokio::task::spawn_blocking(move || -> anyhow::Result<(Brain, ProbeView)> {
            let mut brain = Brain::new(seed)?;
            let probe = brain.probe()?;
            Ok((brain, probe))
        })
        .await
        .map_err(|e| CreateError::Failed(e.to_string()))?
        .map_err(|e| CreateError::Failed(e.to_string()))?;
        let (brain, probe) = brain;
        let session = Arc::new(Session {
            id,
            generation: AtomicU64::new(1),
            info: brain.info(),
            brain: Mutex::new(brain),
            active: Mutex::new(None),
            board: Mutex::new(Board {
                evaluations: vec![evaluation(&probe, Phase::Pretrain)],
                dreams: probe.dream.iter().cloned().collect(),
                probe: Some(probe),
                ..Board::default()
            }),
            bus: broadcast::channel(TELEMETRY_BUFFER).0,
            seq: AtomicU64::new(0),
            commands: Mutex::new(VecDeque::new()),
            token: self.root.child_token(),
            connections: AtomicUsize::new(0),
            idle_since: Mutex::new(Instant::now()),
            created: Instant::now(),
            pending_focus: Mutex::new(None),
            pending_specimen: Mutex::new(None),
        });
        self.sessions.insert(id, session.clone());
        tracing::info!(%id, sessions = self.sessions.len(), "session created");
        Ok(self.snapshot(&session))
    }

    pub fn snapshot(&self, session: &Session) -> SessionView {
        let operation = lock(&session.active).clone().map(|op| op.view());
        let board = lock(&session.board);
        SessionView {
            id: session.id,
            generation: session.generation(),
            model: session.info.clone(),
            step: board.step,
            revision: board.revision,
            phase_steps: board.phase_steps,
            operation,
            probe: board.probe.clone(),
            curve: board.curve.clone(),
            evaluations: board.evaluations.clone(),
            dreams: board.dreams.iter().cloned().collect(),
            rollout: board.rollout.clone(),
            distill: board.distill.clone(),
            journal: board.journal.iter().cloned().collect(),
            workers: self.workers(),
        }
    }

    pub fn subscribe(&self, session: &Arc<Session>) -> (Envelope, broadcast::Receiver<Envelope>) {
        let receiver = session.bus.subscribe();
        let snapshot = self.snapshot_envelope(session);
        (snapshot, receiver)
    }

    pub fn snapshot_envelope(&self, session: &Session) -> Envelope {
        let view = self.snapshot(session);
        Envelope {
            v: PROTOCOL_VERSION,
            seq: session.seq.load(Ordering::SeqCst),
            generation: view.generation,
            event: ServerEvent::Snapshot {
                session: Box::new(view),
            },
        }
    }

    pub fn connected(&self, session: &Session) {
        session.connections.fetch_add(1, Ordering::SeqCst);
        *lock(&session.idle_since) = Instant::now();
    }

    pub fn disconnected(&self, session: &Session) {
        if session.connections.fetch_sub(1, Ordering::SeqCst) == 1 {
            *lock(&session.idle_since) = Instant::now();
            if let Some(op) = session.active() {
                op.request_pause();
            }
        }
    }

    pub async fn dispatch(&self, session: Arc<Session>, command: ClientCommand) {
        *lock(&session.idle_since) = Instant::now();
        let (command_id, generation) = command.ids();
        {
            let mut seen = lock(&session.commands);
            if seen.contains(&command_id) {
                return;
            }
            seen.push_back(command_id);
            while seen.len() > REMEMBERED_COMMANDS {
                seen.pop_front();
            }
        }
        if generation != session.generation() {
            session.error(
                Some(command_id),
                "stale",
                "That command was for weights that have since been reset.",
            );
            return;
        }
        match command {
            ClientCommand::Start { phase, steps, .. } => {
                if phase == Phase::Generate {
                    return session.error(Some(command_id), "invalid", "Use ask to generate.");
                }
                let steps = steps.unwrap_or(phase.default_steps()).clamp(1, 2000);
                self.start(session, command_id, phase, steps);
            }
            ClientCommand::Ask { code, question, .. } => {
                if session.active().is_some() {
                    return session.error(
                        Some(command_id),
                        "busy",
                        "Stop the current run before asking.",
                    );
                }
                let prepared = lock(&session.brain).set_specimen("visitor", &code, &question);
                match prepared {
                    Ok(()) => self.start(session, command_id, Phase::Generate, 1),
                    Err(error) => session.error(Some(command_id), "unsupported", error.to_string()),
                }
            }
            ClientCommand::Show { code, question, .. } => {
                if let Err(error) = crate::train::check_snippet(&code, &question) {
                    return session.error(Some(command_id), "unsupported", error.to_string());
                }
                if session.active().map(|op| op.state()) == Some(OperationState::Running) {
                    *lock(&session.pending_specimen) = Some((code, question));
                } else {
                    let worker = session.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        let mut brain = lock(&worker.brain);
                        let shown = brain
                            .set_specimen("heldOut", &code, &question)
                            .and_then(|_| brain.probe());
                        match shown {
                            Ok(probe) => worker.publish(ServerEvent::Probe(Box::new(probe))),
                            Err(error) => {
                                worker.error(Some(command_id), "unsupported", error.to_string())
                            }
                        }
                    })
                    .await;
                }
            }
            ClientCommand::Pause { .. } => {
                if let Some(op) = session.active() {
                    op.request_pause();
                }
            }
            ClientCommand::Resume { .. } => {
                if let Some(op) = session.active() {
                    if op.requeue() {
                        self.run(session, op);
                    }
                }
            }
            ClientCommand::Cancel { operation_id, .. } => {
                if let Some(op) = session.active() {
                    if operation_id.map(|id| id == op.id).unwrap_or(true) {
                        self.cancel(&session, &op, "cancel requested");
                    }
                }
            }
            ClientCommand::Reset { .. } => self.reset(session, command_id).await,
            ClientCommand::Focus { position, .. } => {
                if session.active().map(|op| op.state()) == Some(OperationState::Running) {
                    *lock(&session.pending_focus) = Some(position);
                } else {
                    let worker = session.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        let mut brain = lock(&worker.brain);
                        brain.set_focus(position);
                        match brain.probe() {
                            Ok(probe) => worker.publish(ServerEvent::Probe(Box::new(probe))),
                            Err(error) => {
                                worker.error(Some(command_id), "probe", error.to_string())
                            }
                        }
                    })
                    .await;
                }
            }
        }
    }

    fn cancel(&self, session: &Arc<Session>, op: &Arc<Operation>, reason: &str) {
        if op.request_cancel(reason) {
            let (state, session, op) = (self.clone(), session.clone(), op.clone());
            tokio::task::spawn_blocking(move || state.finish_canceled(&session, &op, None));
        }
    }

    fn start(&self, session: Arc<Session>, command_id: Uuid, phase: Phase, steps: u32) {
        let mut active = lock(&session.active);
        if active.as_ref().is_some_and(|op| !op.state().terminal()) {
            drop(active);
            return session.error(
                Some(command_id),
                "busy",
                "This model is already doing something. Stop it first.",
            );
        }
        let retained = {
            let board = lock(&session.board);
            (board.step, board.revision)
        };
        let listener = session.clone();
        let op = Operation::new(
            command_id,
            phase,
            steps,
            &session.token,
            self.limits.budget,
            retained,
            Box::new(move |operation| listener.publish(ServerEvent::Lifecycle { operation })),
        );
        *active = Some(op.clone());
        drop(active);
        self.run(session, op);
    }

    fn run(&self, session: Arc<Session>, op: Arc<Operation>) {
        let state = self.clone();
        tokio::spawn(async move {
            let permit = tokio::select! {
                permit = state.permits.clone().acquire_owned() => permit.ok(),
                _ = op.cancel.cancelled() => None,
            };
            let Some(permit) = permit.filter(|_| op.begin()) else {
                op.request_cancel("cancel requested");
                if op.compensating("release the queued reservation") {
                    state.record_cancel(op.canceled());
                }
                return;
            };
            let worker = state.clone();
            let (session_w, op_w) = (session.clone(), op.clone());
            let joined = tokio::task::spawn_blocking(move || {
                worker.work(&session_w, &op_w, permit);
            })
            .await;
            if let Err(panic) = joined {
                state.stats.cleanup_failures.fetch_add(1, Ordering::Relaxed);
                lock(&session.brain).release_teacher();
                op.failed(format!("The worker stopped unexpectedly: {panic}"));
            }
        });
    }

    fn work(&self, session: &Arc<Session>, op: &Arc<Operation>, permit: OwnedSemaphorePermit) {
        let mut brain = lock(&session.brain);
        let setup = match op.phase {
            Phase::Rl if op.view().steps_done == 0 => brain.freeze_reference(),
            Phase::Distill => brain.begin_distillation(),
            _ => Ok(()),
        };
        if let Err(error) = setup {
            op.compensating("release buffers");
            drop(brain);
            drop(permit);
            return op.failed(error.to_string());
        }
        brain.dreaming = op.phase == Phase::Pretrain;
        let mut control = Worker { operation: op };
        let mut losses = Vec::new();
        let mut last_step_event = Instant::now();
        let mut last_probe = Instant::now();
        let mut latest: Option<(crate::train::StepReport, f32)> = None;
        let mut outcome: anyhow::Result<()> = Ok(());

        while !op.finished() {
            if let Some((code, question)) = lock(&session.pending_specimen).take() {
                let _ = brain.set_specimen("heldOut", &code, &question);
                last_probe = Instant::now() - PROBE_INTERVAL;
            }
            if let Some(position) = lock(&session.pending_focus).take() {
                brain.set_focus(position);
                last_probe = Instant::now() - PROBE_INTERVAL;
            }
            let started = Instant::now();
            let result = match op.phase {
                Phase::Pretrain | Phase::Sft => brain.language_step(op.phase, &mut control),
                Phase::Rl => {
                    brain
                        .reinforcement_step(op.id, &mut control)
                        .map(|(report, rollout)| {
                            session.publish(ServerEvent::Rollout(rollout));
                            report
                        })
                }
                Phase::Distill => brain.distillation_step(&mut control),
                Phase::Generate => brain
                    .generate(op.id, &mut control, &mut |token| {
                        session.publish(ServerEvent::Token(token))
                    })
                    .map(|_| crate::train::StepReport {
                        loss: 0.0,
                        grad_norm: 0.0,
                        clipped: false,
                        committed: false,
                        reading: Vec::new(),
                        auxiliary: AuxiliaryView::default(),
                    }),
            };
            let report = match result {
                Ok(report) => report,
                Err(error) => {
                    outcome = Err(error);
                    break;
                }
            };
            let elapsed = started.elapsed();
            self.stats.steps.fetch_add(1, Ordering::Relaxed);
            self.stats
                .step_micros
                .fetch_add(elapsed.as_micros() as u64, Ordering::Relaxed);
            op.advance();
            if report.committed || op.phase == Phase::Generate {
                losses.push(report.loss);
                latest = Some((report, elapsed.as_secs_f32() * 1000.0));
            }
            {
                let mut board = lock(&session.board);
                board.step = brain.step;
                board.revision = brain.revision;
                board.phase_steps = brain.phase_steps;
            }
            if op.phase != Phase::Generate && last_step_event.elapsed() >= STEP_INTERVAL {
                self.flush(session, op, &brain, &mut losses, &mut latest);
                last_step_event = Instant::now();
            }
            if last_probe.elapsed() >= PROBE_INTERVAL {
                self.probe(session, op, &mut brain, latest.as_ref().map(|l| l.0.loss));
                last_probe = Instant::now();
            }
        }

        if op.phase != Phase::Generate {
            self.flush(session, op, &brain, &mut losses, &mut latest);
        }
        let stop = match &outcome {
            Err(error) if interrupted(error) => Some(op.stop_reason()),
            _ => None,
        };
        if stop == Some(Stop::Pause) {
            self.probe(session, op, &mut brain, None);
            drop(brain);
            drop(permit);
            if op.paused() {
                return;
            }
            return self.finish_canceled(session, op, None);
        }
        self.stats.numerical_failures.fetch_add(
            std::mem::take(&mut brain.numerical_failures),
            Ordering::Relaxed,
        );
        match outcome {
            Err(error) if !interrupted(&error) => {
                op.compensating("drop unfinished work and release buffers");
                brain.release_teacher();
                self.probe(session, op, &mut brain, None);
                tracing::warn!(session = %session.id, %error, "operation failed");
                drop(brain);
                drop(permit);
                op.failed(error.to_string());
            }
            Err(_) => {
                drop(brain);
                self.finish_canceled(session, op, Some(permit));
            }
            Ok(()) => {
                op.compensating("release buffers");
                brain.release_teacher();
                self.probe(session, op, &mut brain, None);
                drop(brain);
                drop(permit);
                op.completed();
            }
        }
    }

    fn finish_canceled(
        &self,
        session: &Arc<Session>,
        op: &Arc<Operation>,
        permit: Option<OwnedSemaphorePermit>,
    ) {
        let what = match op.phase {
            Phase::Rl => "discard the incomplete rollout group",
            Phase::Distill => "release the teacher; keep the student's finished updates",
            Phase::Generate => "release decoding caches; keep the visible output",
            _ => "drop the unfinished graph and gradients",
        };
        if !op.compensating(what) {
            return;
        }
        let mut brain = lock(&session.brain);
        brain.release_teacher();
        self.probe(session, op, &mut brain, None);
        drop(brain);
        drop(permit);
        self.record_cancel(op.canceled());
    }

    fn record_cancel(&self, latency: Option<Duration>) {
        if let Some(latency) = latency {
            let micros = latency.as_micros() as u64;
            self.stats.cancellations.fetch_add(1, Ordering::Relaxed);
            self.stats
                .cancel_micros
                .fetch_add(micros, Ordering::Relaxed);
            self.stats
                .cancel_micros_max
                .fetch_max(micros, Ordering::Relaxed);
            tracing::info!(latency_ms = micros as f64 / 1000.0, "operation canceled");
        }
    }

    fn flush(
        &self,
        session: &Session,
        op: &Operation,
        brain: &Brain,
        losses: &mut Vec<f32>,
        latest: &mut Option<(crate::train::StepReport, f32)>,
    ) {
        let Some((report, step_ms)) = latest.take() else {
            return;
        };
        let step = match op.phase {
            Phase::Distill => brain.phase_steps.distill,
            _ => brain.step,
        };
        session.publish(ServerEvent::Step(StepView {
            operation_id: op.id,
            phase: op.phase,
            step,
            revision: brain.revision,
            phase_steps: brain.phase_steps,
            losses: std::mem::take(losses),
            grad_norm: report.grad_norm,
            clipped: report.clipped,
            learning_rate: op.phase.learning_rate(),
            step_ms,
            reading: report.reading,
            auxiliary: report.auxiliary,
        }));
        session.publish(ServerEvent::Lifecycle {
            operation: op.view(),
        });
    }

    fn probe(&self, session: &Session, op: &Operation, brain: &mut Brain, divergence: Option<f32>) {
        let current = lock(&session.board).probe.as_ref().is_some_and(|p| {
            p.revision == brain.revision
                && p.focus.position == brain.focus
                && p.line.code == brain.specimen.code
                && p.line.question == brain.specimen.question
        });
        let fresh = if current { None } else { Some(brain.probe()) };
        match fresh {
            Some(Ok(probe)) => {
                let mut board = lock(&session.board);
                let point = evaluation(&probe, op.phase);
                if board.evaluations.last().map(|e| e.step) != Some(point.step)
                    && op.phase != Phase::Distill
                {
                    board.evaluations.push(point);
                }
                drop(board);
                session.publish(ServerEvent::Probe(Box::new(probe)));
            }
            Some(Err(error)) => tracing::warn!(%error, "probe failed"),
            None => {}
        }
        if op.phase == Phase::Distill {
            let last = lock(&session.board).distill.as_ref().map(|d| d.divergence);
            if let Ok(view) = brain.distillation_view(op.id, divergence.or(last).unwrap_or(0.0)) {
                session.publish(ServerEvent::Distill(view));
            }
        }
    }

    async fn reset(&self, session: Arc<Session>, command_id: Uuid) {
        if let Some(op) = session.active() {
            self.cancel(&session, &op, "reset requested");
            if !wait_terminal(&op, Duration::from_secs(20)).await {
                return session.error(
                    Some(command_id),
                    "cleanup",
                    "The previous run has not finished cleaning up.",
                );
            }
        }
        let generation = session.generation() + 1;
        let seed = (session.id.as_u128() as u64) ^ generation.wrapping_mul(0x9e37_79b9_7f4a_7c15);
        let fresh = tokio::task::spawn_blocking(move || -> anyhow::Result<(Brain, ProbeView)> {
            let mut brain = Brain::new(seed)?;
            let probe = brain.probe()?;
            Ok((brain, probe))
        })
        .await;
        match fresh {
            Ok(Ok((brain, probe))) => {
                *lock(&session.brain) = brain;
                *lock(&session.active) = None;
                *lock(&session.board) = Board {
                    evaluations: vec![evaluation(&probe, Phase::Pretrain)],
                    dreams: probe.dream.iter().cloned().collect(),
                    probe: Some(probe),
                    ..Board::default()
                };
                session.generation.store(generation, Ordering::SeqCst);
                let _ = session.bus.send(self.snapshot_envelope(&session));
            }
            _ => session.error(
                Some(command_id),
                "reset",
                "Could not allocate fresh weights.",
            ),
        }
    }

    pub async fn close(&self, id: Uuid, reason: &str) {
        let Some(session) = self.session(id) else {
            return;
        };
        if let Some(op) = session.active() {
            self.cancel(&session, &op, reason);
            if !wait_terminal(&op, Duration::from_secs(20)).await {
                self.stats.cleanup_failures.fetch_add(1, Ordering::Relaxed);
                tracing::error!(%id, "cleanup did not finish; keeping the session until it does");
                return;
            }
        }
        session.token.cancel();
        self.sessions.remove(&id);
        tracing::info!(%id, reason, sessions = self.sessions.len(), "session closed");
    }

    pub async fn sweep(&self) {
        let expired: Vec<Uuid> = self
            .sessions
            .iter()
            .filter(|s| {
                let working = s
                    .active()
                    .is_some_and(|op| op.state() != OperationState::Paused);
                !working && lock(&s.idle_since).elapsed() > self.limits.idle
            })
            .map(|s| s.id)
            .collect();
        for id in expired {
            self.close(id, "session expired").await;
        }
    }

    pub async fn shutdown(&self) {
        let ids: Vec<Uuid> = self.sessions.iter().map(|s| s.id).collect();
        futures_util::future::join_all(
            ids.into_iter()
                .map(|id| self.close(id, "server shutting down")),
        )
        .await;
        self.root.cancel();
    }
}

fn evaluation(probe: &ProbeView, phase: Phase) -> EvaluationPoint {
    EvaluationPoint {
        step: probe.step,
        phase,
        held_out_loss: probe.held_out_loss,
        accuracy: probe.accuracy,
    }
}

async fn wait_terminal(op: &Operation, limit: Duration) -> bool {
    let deadline = Instant::now() + limit;
    while !op.state().terminal() {
        if Instant::now() > deadline {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    true
}
