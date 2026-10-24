use crate::cups::{
    gateway::{Gateway, Stop},
    prompt::{prompt, valid, ANSWER, WAIT},
    task::CUPS,
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, Semaphore};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub const MORE: usize = 400;
pub const WAITS: usize = 3;
pub const FORGES: usize = 8;
const LINE_LIMIT: usize = 96;
const RUNS: usize = 6;
const IDLE: Duration = Duration::from_secs(600);
const LIFE: Duration = Duration::from_secs(1800);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Queued,
    Thinking,
    Finished,
    Answered,
    Spent,
    Failed,
}

impl Phase {
    fn active(self) -> bool {
        matches!(self, Phase::Queued | Phase::Thinking)
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Probe {
    pub at: usize,
    pub p: [f32; CUPS],
}

#[derive(Clone, Debug, Serialize)]
pub struct Meter {
    pub phase: Phase,
    pub ahead: u64,
    pub spent: usize,
    pub budget: usize,
    pub waits: usize,
    pub forges: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum Event {
    Snapshot {
        text: String,
        probes: Vec<Probe>,
        meter: Meter,
    },
    Text {
        s: String,
    },
    Cut {
        len: usize,
    },
    Probe(Probe),
    Meter(Meter),
}

#[derive(Clone, Debug, Serialize)]
pub struct Envelope {
    pub seq: u64,
    #[serde(flatten)]
    pub event: Event,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "lowercase")]
pub enum Action {
    Answer,
    Wait,
    Forge { at: usize, cup: usize },
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    Off,
    Busy,
    Invalid,
}

struct Trace {
    text: String,
    probes: Vec<Probe>,
    phase: Phase,
    ahead: u64,
    spent: usize,
    budget: usize,
    waits: usize,
    forges: usize,
    seq: u64,
}

pub struct Run {
    pub id: Uuid,
    token: Uuid,
    base: String,
    trace: Mutex<Trace>,
    events: broadcast::Sender<Envelope>,
    cancel: Mutex<CancellationToken>,
    pending: Mutex<Vec<Action>>,
    driving: AtomicBool,
    touched: Mutex<Instant>,
    born: Instant,
}

pub fn budget(swaps: usize) -> usize {
    (900 + 80 * swaps).clamp(1200, 4000)
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn units(s: &str) -> usize {
    s.encode_utf16().count()
}

fn byte_at(s: &str, unit: usize) -> Option<usize> {
    let mut seen = 0;

    for (byte, c) in s.char_indices() {
        if seen == unit {
            return Some(byte);
        }

        seen += c.len_utf16();
    }

    (seen == unit).then_some(s.len())
}

impl Trace {
    fn meter(&self) -> Meter {
        Meter {
            phase: self.phase,
            ahead: self.ahead,
            spent: self.spent,
            budget: self.budget,
            waits: self.waits,
            forges: self.forges,
        }
    }
}

impl Run {
    fn new(start: usize, swaps: &[usize]) -> Self {
        let (events, _) = broadcast::channel(1024);

        Self {
            id: Uuid::new_v4(),
            token: Uuid::new_v4(),
            base: prompt(start, swaps),
            trace: Mutex::new(Trace {
                text: String::new(),
                probes: Vec::new(),
                phase: Phase::Queued,
                ahead: 0,
                spent: 0,
                budget: budget(swaps.len()),
                waits: 0,
                forges: 0,
                seq: 0,
            }),
            events,
            cancel: Mutex::new(CancellationToken::new()),
            pending: Mutex::new(Vec::new()),
            driving: AtomicBool::new(false),
            touched: Mutex::new(Instant::now()),
            born: Instant::now(),
        }
    }

    pub fn token(&self) -> String {
        self.token.to_string()
    }

    pub fn authorized(&self, token: &str) -> bool {
        Uuid::parse_str(token).is_ok_and(|t| t == self.token)
    }

    pub fn touch(&self) {
        *lock(&self.touched) = Instant::now();
    }

    pub fn phase(&self) -> Phase {
        lock(&self.trace).phase
    }

    fn publish(&self, trace: &mut Trace, event: Event) {
        trace.seq += 1;

        let _ = self.events.send(Envelope {
            seq: trace.seq,
            event,
        });
    }

    pub fn snapshot(&self) -> Envelope {
        let trace = lock(&self.trace);

        Envelope {
            seq: trace.seq,
            event: Event::Snapshot {
                text: trace.text.clone(),
                probes: trace.probes.clone(),
                meter: trace.meter(),
            },
        }
    }

    pub fn subscribe(&self) -> (Envelope, broadcast::Receiver<Envelope>) {
        let receiver = self.events.subscribe();

        (self.snapshot(), receiver)
    }

    fn append(&self, s: &str) {
        let mut trace = lock(&self.trace);

        trace.text.push_str(s);
        self.publish(&mut trace, Event::Text { s: s.to_string() });
    }

    fn set(&self, change: impl FnOnce(&mut Trace)) {
        let mut trace = lock(&self.trace);

        change(&mut trace);

        let meter = trace.meter();

        self.publish(&mut trace, Event::Meter(meter));
    }

    fn text(&self) -> String {
        lock(&self.trace).text.clone()
    }

    fn line_was_empty(&self) -> bool {
        let trace = lock(&self.trace);

        trace.text.ends_with("\n\n") || trace.text == "\n"
    }

    fn record(&self, p: [f32; CUPS]) {
        let mut trace = lock(&self.trace);
        let at = units(&trace.text);

        trace.probes.retain(|probe| probe.at < at);

        let probe = Probe { at, p };

        trace.probes.push(probe.clone());
        self.publish(&mut trace, Event::Probe(probe));
    }

    fn forge(&self, at: usize, cup: usize) -> bool {
        let mut trace = lock(&self.trace);
        let Some(byte) = byte_at(&trace.text, at) else {
            return false;
        };
        let current = trace.text[byte..].chars().next();

        if trace.forges >= FORGES
            || cup == 0
            || cup > CUPS
            || !current.is_some_and(|c| ('1'..='5').contains(&c))
        {
            return false;
        }

        trace.text.truncate(byte);
        trace.text.push_str(&cup.to_string());
        trace.probes.retain(|probe| probe.at <= at);
        trace.forges += 1;
        self.publish(&mut trace, Event::Cut { len: at });
        self.publish(&mut trace, Event::Text { s: cup.to_string() });

        true
    }

    fn renew(&self) -> CancellationToken {
        let fresh = CancellationToken::new();

        *lock(&self.cancel) = fresh.clone();

        fresh
    }

    fn interrupt(&self) {
        lock(&self.cancel).cancel();
    }

    fn take(&self) -> Vec<Action> {
        std::mem::take(&mut *lock(&self.pending))
    }
}

pub struct Desk {
    gateway: Option<Gateway>,
    runs: DashMap<Uuid, Arc<Run>>,
    slot: Arc<Semaphore>,
    tickets: AtomicU64,
    served: AtomicU64,
}

impl Desk {
    pub fn new(gateway: Option<Gateway>) -> Arc<Self> {
        Arc::new(Self {
            gateway,
            runs: DashMap::new(),
            slot: Arc::new(Semaphore::new(1)),
            tickets: AtomicU64::new(0),
            served: AtomicU64::new(0),
        })
    }

    pub fn live(&self) -> bool {
        self.gateway.is_some()
    }

    pub fn busy(&self) -> bool {
        self.runs.iter().filter(|r| r.phase().active()).count() >= RUNS
    }

    pub fn open(self: &Arc<Self>, start: usize, swaps: &[usize]) -> Result<Arc<Run>, Refusal> {
        if !valid(start, swaps) {
            return Err(Refusal::Invalid);
        }

        if self.gateway.is_none() {
            return Err(Refusal::Off);
        }

        if self.busy() {
            return Err(Refusal::Busy);
        }

        let run = Arc::new(Run::new(start, swaps));

        self.runs.insert(run.id, run.clone());
        self.spawn(run.clone());

        Ok(run)
    }

    pub fn find(&self, id: Uuid, token: &str) -> Option<Arc<Run>> {
        self.runs
            .get(&id)
            .map(|r| r.clone())
            .filter(|run| run.authorized(token))
    }

    pub fn close(&self, id: Uuid) {
        if let Some((_, run)) = self.runs.remove(&id) {
            run.interrupt();
            run.set(|t| {
                if t.phase.active() {
                    t.phase = Phase::Answered;
                }
            });
        }
    }

    pub fn act(self: &Arc<Self>, run: &Arc<Run>, action: Action) -> bool {
        let phase = run.phase();
        let allowed = {
            let trace = lock(&run.trace);

            match action {
                Action::Answer => phase.active(),
                Action::Wait => {
                    trace.waits < WAITS
                        && matches!(phase, Phase::Finished | Phase::Spent | Phase::Answered)
                }
                Action::Forge { .. } => trace.forges < FORGES && phase != Phase::Failed,
            }
        };

        if !allowed {
            return false;
        }

        run.touch();
        lock(&run.pending).push(action);
        run.interrupt();

        if !run.driving.load(Ordering::SeqCst) {
            if action == Action::Answer {
                return true;
            }

            if self.busy() {
                lock(&run.pending).clear();
                return false;
            }

            run.set(|t| t.phase = Phase::Queued);
            self.spawn(run.clone());
        }

        true
    }

    pub fn sweep(&self) {
        let stale: Vec<Uuid> = self
            .runs
            .iter()
            .filter(|r| r.born.elapsed() > LIFE || lock(&r.touched).elapsed() > IDLE)
            .map(|r| r.id)
            .collect();

        for id in stale {
            self.close(id);
        }
    }

    fn spawn(self: &Arc<Self>, run: Arc<Run>) {
        if run.driving.swap(true, Ordering::SeqCst) {
            return;
        }

        let desk = self.clone();

        tokio::spawn(async move {
            desk.drive(&run).await;
            run.driving.store(false, Ordering::SeqCst);
        });
    }

    async fn queue(&self, run: &Run) -> Option<tokio::sync::OwnedSemaphorePermit> {
        let ticket = self.tickets.fetch_add(1, Ordering::SeqCst);
        let acquire = self.slot.clone().acquire_owned();

        tokio::pin!(acquire);

        let mut tick = tokio::time::interval(Duration::from_secs(1));

        loop {
            tokio::select! {
                permit = &mut acquire => {
                    self.served.fetch_add(1, Ordering::SeqCst);
                    return permit.ok();
                }
                _ = tick.tick() => {
                    if !self.runs.contains_key(&run.id) {
                        self.served.fetch_add(1, Ordering::SeqCst);
                        return None;
                    }

                    let ahead = ticket.saturating_sub(self.served.load(Ordering::SeqCst));

                    run.set(|t| t.ahead = ahead);
                }
            }
        }
    }

    async fn probe(&self, gateway: &Gateway, run: &Run) -> bool {
        match gateway
            .probe(&format!("{}{}{ANSWER}", run.base, run.text()))
            .await
        {
            Ok(p) => {
                run.record(p);
                true
            }
            Err(error) => {
                tracing::warn!(%error, "cups probe failed");
                false
            }
        }
    }

    async fn drive(&self, run: &Arc<Run>) {
        let Some(gateway) = self.gateway.clone() else {
            return;
        };
        let Some(_permit) = self.queue(run).await else {
            return;
        };

        run.set(|t| {
            t.phase = Phase::Thinking;
            t.ahead = 0;
        });

        loop {
            for action in run.take() {
                match action {
                    Action::Answer => {
                        self.probe(&gateway, run).await;
                        run.set(|t| t.phase = Phase::Answered);
                        return;
                    }
                    Action::Wait => {
                        run.append(WAIT);
                        run.set(|t| {
                            t.waits += 1;
                            t.budget = t.spent.max(t.budget) + MORE;
                        });
                    }
                    Action::Forge { at, cup } => {
                        if run.forge(at, cup) {
                            self.probe(&gateway, run).await;
                        }
                    }
                }
            }

            if !self.runs.contains_key(&run.id) {
                return;
            }

            let (spent, budget) = {
                let t = lock(&run.trace);

                (t.spent, t.budget)
            };

            if spent >= budget {
                self.probe(&gateway, run).await;
                run.set(|t| t.phase = Phase::Spent);
                return;
            }

            let cancel = run.renew();

            if !lock(&run.pending).is_empty() {
                continue;
            }

            let prompt = format!("{}{}", run.base, run.text());
            let chunk = gateway
                .think(&prompt, LINE_LIMIT.min(budget - spent), &cancel, |s| {
                    run.append(s)
                })
                .await;

            match chunk {
                Ok(None) => continue,
                Ok(Some(chunk)) => {
                    run.set(|t| t.spent += chunk.tokens.max(1));

                    match chunk.stop {
                        Stop::Line => {
                            run.append("\n");

                            if !run.line_was_empty() {
                                self.probe(&gateway, run).await;
                            }
                        }
                        Stop::Limit => {
                            self.probe(&gateway, run).await;
                        }
                        Stop::Closed | Stop::End => {
                            self.probe(&gateway, run).await;
                            run.set(|t| t.phase = Phase::Finished);
                            return;
                        }
                    }
                }
                Err(error) => {
                    tracing::warn!(%error, "cups thinking failed");
                    run.set(|t| t.phase = Phase::Failed);
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_count_utf16_units_like_the_page() {
        let s = "ball → cup 3";

        assert_eq!(units(s), 12);
        assert_eq!(byte_at(s, 11), Some(s.len() - 1));
        assert_eq!(byte_at(s, 12), Some(s.len()));
        assert_eq!(byte_at(s, 13), None);
    }

    #[test]
    fn a_forgery_only_replaces_a_cup_digit() {
        let run = Run::new(0, &[0]);

        run.append("Swap 1 and 2: ball at 2.\nSo");

        assert!(!run.forge(0, 3));
        assert!(!run.forge(21, 4));
        assert!(!run.forge(22, 9));
        assert!(run.forge(22, 4));
        assert_eq!(run.text(), "Swap 1 and 2: ball at 4");
    }

    #[test]
    fn longer_shuffles_get_more_room_to_think() {
        assert_eq!(budget(1), 1200);
        assert_eq!(budget(10), 1700);
        assert_eq!(budget(60), 4000);
    }

    #[test]
    fn the_desk_refuses_without_a_gateway_or_a_real_shuffle() {
        let desk = Desk::new(None);

        assert_eq!(desk.open(0, &[1]).err(), Some(Refusal::Off));
        assert_eq!(desk.open(7, &[1]).err(), Some(Refusal::Invalid));
    }
}
