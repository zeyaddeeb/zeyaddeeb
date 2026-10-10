use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

use dashmap::DashMap;
use tokio::sync::{mpsc, OwnedSemaphorePermit, Semaphore};
use uuid::Uuid;

use crate::{
    audio::{self, RATE},
    clients::{Admission, Clients},
    door::Door,
    house::House,
    network::Network,
    player::Cue,
    protocol::{Limits, SessionInfo},
    room::{Progress, Room},
    rtc::Call,
    spectrum::BANDS,
};

pub const LIMITS: Limits = Limits {
    take_seconds: 8.0,
    shortest_take_seconds: 1.2,
    batch: 12,
    generations: 36,
    runs: 6,
    bands: BANDS,
};

const SESSIONS: usize = 32;
const UNATTACHED_GRACE: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct AppState {
    pub sessions: Sessions,
    pub door: Arc<Door<Room>>,
    pub house: Arc<OnceLock<House>>,
    pub network: Arc<Network>,
    pub clients: Arc<Clients>,
    pub origins: Arc<Vec<String>>,
    pub turns: Arc<Semaphore>,
    pub waiting: Arc<AtomicUsize>,
    slots: Arc<Semaphore>,
}

pub struct Policy {
    pub parallel_runs: usize,
    pub sessions_per_client: usize,
    pub takes_per_client_hour: usize,
    pub origins: Vec<String>,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            parallel_runs: 1,
            sessions_per_client: 4,
            takes_per_client_hour: 12,
            origins: Vec::new(),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Turned {
    Full,
    Greedy,
}

pub type Sessions = Arc<DashMap<Uuid, Seat>>;
pub type Packets = Arc<Vec<Vec<u8>>>;

pub struct Seat {
    session: Arc<Session>,
    _slot: OwnedSemaphorePermit,
    _admission: Option<Admission>,
}

pub struct Session {
    created: Instant,
    pub who: Option<String>,
    pub offers: AtomicUsize,
    pub attached: AtomicBool,
    pub halted: AtomicBool,
    pub queued: AtomicBool,
    pub runs: AtomicUsize,
    pub stage: tokio::sync::Mutex<()>,
    pub microphone: Mutex<Microphone>,
    pub tape: Mutex<Vec<Packets>>,
    pub standing: Mutex<Option<Progress>>,
    pub cues: Mutex<Option<mpsc::UnboundedSender<Cue>>>,
    pub call: tokio::sync::Mutex<Option<Call>>,
}

pub struct Microphone {
    open: bool,
    rate: u32,
    samples: Vec<f32>,
}

impl Default for Microphone {
    fn default() -> Self {
        Self {
            open: false,
            rate: RATE,
            samples: Vec::new(),
        }
    }
}

impl Microphone {
    pub fn open(&mut self, rate: u32) {
        self.open = true;
        self.rate = rate;
        self.samples.clear();
    }

    pub fn hear(&mut self, samples: &[f32]) {
        if !self.open {
            return;
        }

        let longest = (LIMITS.take_seconds * self.rate as f32) as usize;
        let room = longest.saturating_sub(self.samples.len());

        self.samples
            .extend_from_slice(&samples[..samples.len().min(room)]);
    }

    pub fn close(&mut self) -> Vec<f32> {
        self.open = false;

        audio::resample(&std::mem::take(&mut self.samples), self.rate, RATE)
    }
}

impl AppState {
    pub fn new(door: Door<Room>, network: Network, policy: Policy) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            door: Arc::new(door),
            house: Arc::new(OnceLock::new()),
            network: Arc::new(network),
            clients: Arc::new(Clients::new(
                policy.sessions_per_client,
                policy.takes_per_client_hour,
            )),
            origins: Arc::new(policy.origins),
            turns: Arc::new(Semaphore::new(policy.parallel_runs.max(1))),
            waiting: Arc::new(AtomicUsize::new(0)),
            slots: Arc::new(Semaphore::new(SESSIONS)),
        }
    }

    pub fn create_session(&self, who: Option<&str>) -> Result<SessionInfo, Turned> {
        self.sweep(Instant::now());

        let admission = who
            .map(|who| self.clients.admit(who).ok_or(Turned::Greedy))
            .transpose()?;
        let slot = self
            .slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| Turned::Full)?;
        let id = Uuid::new_v4();

        self.sessions.insert(
            id,
            Seat {
                _slot: slot,
                _admission: admission,
                session: Arc::new(Session {
                    created: Instant::now(),
                    who: who.map(str::to_string),
                    offers: AtomicUsize::new(0),
                    attached: AtomicBool::new(false),
                    halted: AtomicBool::new(false),
                    queued: AtomicBool::new(false),
                    runs: AtomicUsize::new(0),
                    stage: tokio::sync::Mutex::default(),
                    microphone: Mutex::default(),
                    tape: Mutex::default(),
                    standing: Mutex::default(),
                    cues: Mutex::default(),
                    call: tokio::sync::Mutex::default(),
                }),
            },
        );

        Ok(self.session_info(id))
    }

    pub fn session_info(&self, id: Uuid) -> SessionInfo {
        SessionInfo {
            id,
            signaling_url: format!("/ws/{id}"),
            calls: self.network.calls(),
            limits: LIMITS,
        }
    }

    pub fn session(&self, id: Uuid) -> Option<Arc<Session>> {
        self.sessions.get(&id).map(|seat| seat.session.clone())
    }

    pub fn leave(&self, id: Uuid) -> Option<Arc<Session>> {
        self.sessions.remove(&id).map(|(_, seat)| seat.session)
    }

    pub fn sweep(&self, now: Instant) {
        self.sessions.retain(|_, seat| !seat.session.abandoned(now));
        self.clients.sweep(now);
    }
}

impl Session {
    pub fn listen_through(&self, cues: mpsc::UnboundedSender<Cue>) {
        if let Ok(mut current) = self.cues.lock() {
            *current = Some(cues);
        }
    }

    pub fn cue(&self, cue: Cue) {
        if let Ok(cues) = self.cues.lock() {
            if let Some(cues) = cues.as_ref() {
                let _ = cues.send(cue);
            }
        }
    }

    pub fn go_quiet(&self) {
        if let Ok(mut cues) = self.cues.lock() {
            *cues = None;
        }
    }

    fn abandoned(&self, now: Instant) -> bool {
        let attached = self.attached.load(std::sync::atomic::Ordering::Relaxed);

        !attached && now.saturating_duration_since(self.created) >= UNATTACHED_GRACE
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn closed() -> Door<Room> {
        Door::new(|| Err(anyhow::anyhow!("no models in tests")))
    }

    fn state(policy: Policy) -> AppState {
        AppState::new(
            closed(),
            Network::new(false, None, vec![], None, vec![]),
            policy,
        )
    }

    fn crowd() -> Policy {
        Policy {
            sessions_per_client: SESSIONS + 1,
            ..Policy::default()
        }
    }

    #[test]
    fn session_capacity_is_reclaimed_after_expiration() {
        let state = state(crowd());

        for _ in 0..SESSIONS {
            assert!(state.create_session(Some("a")).is_ok());
        }

        assert_eq!(state.create_session(Some("a")), Err(Turned::Full));

        state.sweep(Instant::now() + UNATTACHED_GRACE);

        assert!(state.sessions.is_empty());
        assert!(state.create_session(Some("a")).is_ok());
    }

    #[test]
    fn one_client_cannot_take_every_session() {
        let state = state(Policy::default());

        for _ in 0..4 {
            assert!(state.create_session(Some("a")).is_ok());
        }

        assert_eq!(state.create_session(Some("a")), Err(Turned::Greedy));
        assert!(state.create_session(Some("b")).is_ok());

        state.sweep(Instant::now() + UNATTACHED_GRACE);

        assert!(state.create_session(Some("a")).is_ok());
    }

    #[test]
    fn visitors_nobody_can_tell_apart_share_only_the_room() {
        let state = state(Policy {
            sessions_per_client: 1,
            ..Policy::default()
        });

        for _ in 0..SESSIONS {
            assert!(state.create_session(None).is_ok());
        }

        assert_eq!(state.create_session(None), Err(Turned::Full));
    }

    #[test]
    fn leaving_frees_the_seat_even_while_the_session_is_still_referenced() {
        let state = state(Policy {
            sessions_per_client: 1,
            ..Policy::default()
        });
        let id = state.create_session(Some("a")).unwrap().id;
        let lingering = state.session(id).unwrap();

        assert_eq!(state.create_session(Some("a")), Err(Turned::Greedy));
        assert!(state.leave(id).is_some());
        assert!(state.create_session(Some("a")).is_ok());

        drop(lingering);
    }

    #[test]
    fn attached_sessions_are_kept() {
        let state = state(Policy::default());
        let id = state.create_session(Some("a")).unwrap().id;

        state
            .session(id)
            .unwrap()
            .attached
            .store(true, std::sync::atomic::Ordering::Relaxed);
        state.sweep(Instant::now() + UNATTACHED_GRACE);

        assert!(state.session(id).is_some());
    }

    #[test]
    fn a_closed_microphone_keeps_nothing() {
        let mut microphone = Microphone::default();

        microphone.hear(&[0.1; 480]);

        assert!(microphone.close().is_empty());
    }

    #[test]
    fn a_take_stops_at_the_limit() {
        let mut microphone = Microphone::default();

        microphone.open(RATE);

        for _ in 0..20 {
            microphone.hear(&vec![0.1; RATE as usize]);
        }

        assert_eq!(
            microphone.close().len(),
            (LIMITS.take_seconds * RATE as f32) as usize
        );
    }

    #[test]
    fn a_take_at_another_rate_comes_back_at_the_working_rate() {
        let mut microphone = Microphone::default();

        microphone.open(48_000);
        microphone.hear(&vec![0.1; 48_000]);

        assert_eq!(microphone.close().len(), RATE as usize);
    }

    #[test]
    fn a_fast_microphone_is_still_held_to_the_time_limit() {
        let mut microphone = Microphone::default();

        microphone.open(48_000);

        for _ in 0..20 {
            microphone.hear(&vec![0.1; 48_000]);
        }

        assert_eq!(
            microphone.close().len(),
            (LIMITS.take_seconds * RATE as f32) as usize
        );
    }

    #[test]
    fn opening_again_starts_a_new_take() {
        let mut microphone = Microphone::default();

        microphone.open(RATE);
        microphone.hear(&[0.1; 480]);
        microphone.open(RATE);
        microphone.hear(&[0.2; 240]);

        assert_eq!(microphone.close(), vec![0.2; 240]);
    }
}
