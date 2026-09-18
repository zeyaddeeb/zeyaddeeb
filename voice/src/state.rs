use dashmap::DashMap;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use uuid::Uuid;

use crate::{
    diarizer::CandleDiarizer,
    protocol::{SessionInfo, SessionStatus},
};

#[derive(Clone)]
pub struct AppState {
    pub sessions: Sessions,
    pub diarizer: CandleDiarizer,
    pub peers: crate::rtc::PeerConnections,
    slots: Arc<Semaphore>,
}

pub type Sessions = std::sync::Arc<DashMap<Uuid, SessionState>>;

#[derive(Debug)]
pub struct SessionState {
    _slot: OwnedSemaphorePermit,
    pub created: Instant,
    pub connected_clients: usize,
    pub received_frames: u64,
    pub processed_ms: u64,
    pub active_speakers: usize,
}

impl AppState {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            sessions: std::sync::Arc::new(DashMap::new()),
            diarizer: CandleDiarizer::from_env()?,
            peers: std::sync::Arc::new(DashMap::new()),
            slots: Arc::new(Semaphore::new(32)),
        })
    }

    pub fn create_session(&self, host: &str) -> Option<SessionInfo> {
        self.sessions.retain(|_, session| {
            session.connected_clients > 0 || session.created.elapsed() < Duration::from_secs(60)
        });
        let slot = self.slots.clone().try_acquire_owned().ok()?;
        let id = Uuid::new_v4();
        self.sessions.insert(
            id,
            SessionState {
                _slot: slot,
                created: Instant::now(),
                connected_clients: 0,
                received_frames: 0,
                processed_ms: 0,
                active_speakers: 0,
            },
        );

        self.session_info(id, host)
    }

    pub fn session_info(&self, id: Uuid, host: &str) -> Option<SessionInfo> {
        let session = self.sessions.get(&id)?;
        Some(SessionInfo {
            id,
            signaling_url: format!("ws://{host}/ws/{id}"),
            model_loaded: self.diarizer.model_loaded(),
            sample_rate: 16_000,
            frame_ms: 320,
            status: SessionStatus {
                connected_clients: session.connected_clients,
                received_frames: session.received_frames,
                active_speakers: session.active_speakers,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_capacity_is_reclaimed_after_expiration() {
        let state = AppState::new().unwrap();
        for _ in 0..32 {
            assert!(state.create_session("localhost").is_some());
        }
        assert!(state.create_session("localhost").is_none());
        for mut session in state.sessions.iter_mut() {
            session.created = Instant::now() - Duration::from_secs(61);
        }
        assert!(state.create_session("localhost").is_some());
        assert_eq!(state.sessions.len(), 1);
    }
}
