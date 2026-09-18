use crate::{
    model::Interrupted,
    protocol::{OperationView, Phase},
    train::Control,
};
use anyhow::Result;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperationState {
    Queued,
    Running,
    Paused,
    CancelRequested,
    Compensating,
    Completed,
    Canceled,
    Failed,
}

impl OperationState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Paused => "paused",
            Self::CancelRequested => "cancelRequested",
            Self::Compensating => "compensating",
            Self::Completed => "completed",
            Self::Canceled => "canceled",
            Self::Failed => "failed",
        }
    }

    pub fn terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Canceled | Self::Failed)
    }

    fn may_become(self, next: Self) -> bool {
        use OperationState::*;
        matches!(
            (self, next),
            (Queued, Running | CancelRequested)
                | (Running, Paused | CancelRequested | Compensating | Completed)
                | (Paused, Queued | CancelRequested)
                | (CancelRequested, Compensating)
                | (Compensating, Canceled | Failed | Completed)
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stop {
    Cancel,
    Pause,
}

struct Inner {
    state: OperationState,
    stage: String,
    steps_done: u32,
    retained_step: u64,
    retained_revision: u64,
    error: Option<String>,
    pause_requested: bool,
    cancel_requested_at: Option<Instant>,
    running_since: Option<Instant>,
    running_for: Duration,
}

type Listener = Box<dyn Fn(OperationView) + Send + Sync>;

pub struct Operation {
    pub id: Uuid,
    pub command_id: Uuid,
    pub phase: Phase,
    pub steps_total: u32,
    pub cancel: CancellationToken,
    budget: Duration,
    inner: Mutex<Inner>,
    listener: Listener,
}

impl Operation {
    pub fn new(
        command_id: Uuid,
        phase: Phase,
        steps_total: u32,
        parent: &CancellationToken,
        budget: Duration,
        retained: (u64, u64),
        listener: Listener,
    ) -> Arc<Self> {
        let operation = Arc::new(Self {
            id: Uuid::new_v4(),
            command_id,
            phase,
            steps_total,
            cancel: parent.child_token(),
            budget,
            inner: Mutex::new(Inner {
                state: OperationState::Queued,
                stage: "reserve a worker".into(),
                steps_done: 0,
                retained_step: retained.0,
                retained_revision: retained.1,
                error: None,
                pause_requested: false,
                cancel_requested_at: None,
                running_since: None,
                running_for: Duration::ZERO,
            }),
            listener,
        });
        operation.announce();
        operation
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn state(&self) -> OperationState {
        self.lock().state
    }

    pub fn view(&self) -> OperationView {
        self.view_of(&self.lock())
    }

    fn view_of(&self, inner: &Inner) -> OperationView {
        OperationView {
            operation_id: self.id,
            command_id: self.command_id,
            phase: self.phase,
            state: inner.state.as_str().into(),
            stage: inner.stage.clone(),
            progress: inner.steps_done as f32 / self.steps_total.max(1) as f32,
            steps_done: inner.steps_done,
            steps_total: self.steps_total,
            retained_step: inner.retained_step,
            retained_revision: inner.retained_revision,
            error: inner.error.clone(),
        }
    }

    fn announce(&self) {
        let inner = self.lock();
        (self.listener)(self.view_of(&inner));
    }

    fn transition(&self, next: OperationState, stage: &str) -> bool {
        let mut inner = self.lock();
        if !inner.state.may_become(next) {
            return false;
        }
        if next == OperationState::Running {
            inner.running_since = Some(Instant::now());
        } else if let Some(since) = inner.running_since.take() {
            inner.running_for += since.elapsed();
        }
        inner.state = next;
        inner.stage = stage.into();
        (self.listener)(self.view_of(&inner));
        true
    }

    pub fn begin(&self) -> bool {
        {
            let mut inner = self.lock();
            inner.pause_requested = false;
        }
        self.transition(OperationState::Running, "forward")
    }

    pub fn request_cancel(&self, reason: &str) -> bool {
        {
            let mut inner = self.lock();
            if inner.state.terminal()
                || matches!(
                    inner.state,
                    OperationState::CancelRequested | OperationState::Compensating
                )
            {
                return false;
            }
            let unattended = inner.state == OperationState::Paused;
            inner.state = OperationState::CancelRequested;
            inner.stage = reason.into();
            inner.cancel_requested_at = Some(Instant::now());
            if let Some(since) = inner.running_since.take() {
                inner.running_for += since.elapsed();
            }
            self.cancel.cancel();
            (self.listener)(self.view_of(&inner));
            unattended
        }
    }

    pub fn request_pause(&self) -> bool {
        let mut inner = self.lock();
        let running = inner.state == OperationState::Running;
        inner.pause_requested |= running;
        running
    }

    pub fn requeue(&self) -> bool {
        self.transition(OperationState::Queued, "reserve a worker")
    }

    pub fn paused(&self) -> bool {
        self.transition(OperationState::Paused, "paused at a safe boundary")
    }

    pub fn compensating(&self, what: &str) -> bool {
        self.transition(OperationState::Compensating, what)
    }

    pub fn completed(&self) -> bool {
        self.transition(OperationState::Completed, "cleanup complete")
    }

    pub fn canceled(&self) -> Option<Duration> {
        let requested = self.lock().cancel_requested_at;
        self.transition(OperationState::Canceled, "cleanup complete")
            .then(|| requested.map(|at| at.elapsed()))
            .flatten()
    }

    pub fn failed(&self, error: String) {
        let mut inner = self.lock();
        if inner.state.terminal() {
            return;
        }
        inner.running_since = None;
        inner.state = OperationState::Failed;
        inner.stage = "cleanup complete".into();
        inner.error = Some(error);
        (self.listener)(self.view_of(&inner));
    }

    pub fn advance(&self) {
        self.lock().steps_done += 1;
    }

    pub fn finished(&self) -> bool {
        self.lock().steps_done >= self.steps_total
    }

    pub fn stop_reason(&self) -> Stop {
        let inner = self.lock();
        if self.cancel.is_cancelled() || inner.state == OperationState::CancelRequested {
            Stop::Cancel
        } else {
            Stop::Pause
        }
    }
}

pub struct Worker<'a> {
    pub operation: &'a Operation,
}

impl Control for Worker<'_> {
    fn check(&mut self, stage: &str) -> Result<()> {
        let operation = self.operation;
        let mut inner = operation.lock();
        if let Some(since) = inner.running_since {
            if inner.running_for + since.elapsed() > operation.budget
                && !operation.cancel.is_cancelled()
            {
                inner.state = OperationState::CancelRequested;
                inner.stage = "time budget spent".into();
                inner.cancel_requested_at = Some(Instant::now());
                inner.running_for += since.elapsed();
                inner.running_since = None;
                operation.cancel.cancel();
                (operation.listener)(operation.view_of(&inner));
            }
        }
        if operation.cancel.is_cancelled() || inner.pause_requested {
            return Err(Interrupted.into());
        }
        if inner.stage != stage {
            inner.stage.clear();
            inner.stage.push_str(stage);
        }
        Ok(())
    }

    fn commit(&mut self, apply: &mut dyn FnMut() -> Result<(u64, u64)>) -> Result<bool> {
        let operation = self.operation;
        let mut inner = operation.lock();
        if operation.cancel.is_cancelled() {
            return Ok(false);
        }
        inner.stage = "optimizer commit".into();
        (inner.retained_step, inner.retained_revision) = apply()?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn operation(budget: Duration) -> (Arc<Operation>, Arc<Mutex<Vec<String>>>) {
        let journal = Arc::new(Mutex::new(Vec::new()));
        let sink = journal.clone();
        let operation = Operation::new(
            Uuid::new_v4(),
            Phase::Pretrain,
            4,
            &CancellationToken::new(),
            budget,
            (0, 0),
            Box::new(move |view| sink.lock().unwrap().push(view.state)),
        );
        (operation, journal)
    }

    #[test]
    fn a_full_run_walks_the_happy_path() {
        let (op, journal) = operation(Duration::from_secs(60));
        assert!(op.begin());
        assert!(op.request_pause());
        let mut worker = Worker { operation: &op };
        assert!(worker.check("forward").is_err());
        assert_eq!(op.stop_reason(), Stop::Pause);
        assert!(op.paused());
        assert!(op.requeue() && op.begin());
        assert!(worker.check("forward").is_ok());
        assert!(op.compensating("release buffers") && op.completed());
        assert!(
            !op.begin() && !op.requeue(),
            "terminal states cannot resume"
        );
        assert_eq!(
            *journal.lock().unwrap(),
            [
                "queued",
                "running",
                "paused",
                "queued",
                "running",
                "compensating",
                "completed"
            ]
        );
    }

    #[test]
    fn cancellation_is_idempotent_and_ordered() {
        let (op, journal) = operation(Duration::from_secs(60));
        op.begin();
        assert!(!op.request_cancel("cancel requested"), "a worker holds it");
        assert!(!op.request_cancel("cancel requested"));
        let mut worker = Worker { operation: &op };
        assert!(worker.check("backward").is_err());
        assert_eq!(op.stop_reason(), Stop::Cancel);
        assert!(!worker.commit(&mut || panic!("must not publish")).unwrap());
        assert!(!op.completed(), "cancel requested cannot complete");
        assert!(op.compensating("drop unfinished graph"));
        assert!(op.canceled().is_some());
        assert!(op.canceled().is_none());
        assert_eq!(
            *journal.lock().unwrap(),
            [
                "queued",
                "running",
                "cancelRequested",
                "compensating",
                "canceled"
            ]
        );
    }

    #[test]
    fn cancel_while_queued_or_paused() {
        let (op, _) = operation(Duration::from_secs(60));
        assert!(!op.request_cancel("cancel requested"));
        assert!(!op.begin(), "the queue lost the race");
        assert!(op.compensating("release reservation") && op.canceled().is_some());

        let (op, _) = operation(Duration::from_secs(60));
        op.begin();
        op.request_pause();
        op.paused();
        assert!(
            op.request_cancel("cancel requested"),
            "nobody holds a paused operation"
        );
    }

    #[test]
    fn a_committed_update_survives_a_late_cancel() {
        let (op, _) = operation(Duration::from_secs(60));
        op.begin();
        let applied = AtomicUsize::new(0);
        let mut worker = Worker { operation: &op };
        assert!(worker
            .commit(&mut || {
                applied.fetch_add(1, Ordering::SeqCst);
                Ok((11, 11))
            })
            .unwrap());
        op.request_cancel("cancel requested");
        assert!(!worker.commit(&mut || panic!("must not publish")).unwrap());
        let view = op.view();
        assert_eq!((view.retained_step, view.retained_revision), (11, 11));
        assert_eq!(applied.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn commit_and_cancel_never_interleave() {
        for _ in 0..200 {
            let (op, _) = operation(Duration::from_secs(60));
            op.begin();
            let canceller = op.clone();
            let thread = std::thread::spawn(move || canceller.request_cancel("cancel requested"));
            let mut worker = Worker { operation: &op };
            let mut published = 0;
            while worker
                .commit(&mut || Ok((published + 1, published + 1)))
                .unwrap()
            {
                published += 1;
            }
            thread.join().unwrap();
            assert_eq!(op.view().retained_revision, published);
        }
    }

    #[test]
    fn a_spent_budget_cancels_through_the_same_path() {
        let (op, _) = operation(Duration::ZERO);
        op.begin();
        std::thread::sleep(Duration::from_millis(2));
        let mut worker = Worker { operation: &op };
        assert!(worker.check("forward").is_err());
        assert_eq!(op.state(), OperationState::CancelRequested);
        assert_eq!(op.stop_reason(), Stop::Cancel);
    }
}
