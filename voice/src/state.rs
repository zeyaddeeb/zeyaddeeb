use dashmap::DashMap;
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
}

pub type Sessions = std::sync::Arc<DashMap<Uuid, SessionState>>;

#[derive(Debug, Clone)]
pub struct SessionState {
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
        })
    }

    pub fn create_session(&self, host: &str) -> SessionInfo {
        let id = Uuid::new_v4();
        self.sessions.insert(
            id,
            SessionState {
                connected_clients: 0,
                received_frames: 0,
                processed_ms: 0,
                active_speakers: 0,
            },
        );

        self.session_info(id, host)
            .expect("session was just inserted")
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
