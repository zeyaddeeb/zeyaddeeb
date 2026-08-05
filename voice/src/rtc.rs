use std::sync::Arc;

use async_trait::async_trait;
use dashmap::DashMap;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};
use uuid::Uuid;
use webrtc::{
    media_stream::track_remote::{TrackRemote, TrackRemoteEvent},
    peer_connection::{
        register_default_interceptors, MediaEngine, PeerConnection, PeerConnectionBuilder,
        PeerConnectionEventHandler, RTCConfigurationBuilder, RTCIceCandidateInit, RTCIceServer,
        RTCPeerConnectionIceEvent, RTCPeerConnectionState, RTCSessionDescription, Registry,
    },
};

use crate::{protocol::ServerMessage, state::AppState};

pub type PeerConnections = Arc<DashMap<Uuid, Arc<dyn PeerConnection>>>;

const DEFAULT_STUN_URL: &str = "stun:stun.l.google.com:19302";
const DEFAULT_UDP_ADDR: &str = "0.0.0.0:0";

const RTP_LOG_INTERVAL: u64 = 500;

pub async fn accept_offer(
    session_id: Uuid,
    state: AppState,
    sdp: String,
    events: mpsc::UnboundedSender<ServerMessage>,
) -> anyhow::Result<String> {
    let peer = create_peer_connection(session_id, state.clone(), events).await?;

    if let Some(previous) = state.peers.insert(session_id, peer.clone()) {
        info!("session {session_id} renegotiated; closing previous peer connection");
        let _ = previous.close().await;
    }

    let negotiate = async {
        let offer = RTCSessionDescription::offer(sdp)?;
        peer.set_remote_description(offer).await?;
        let answer = peer.create_answer(None).await?;
        peer.set_local_description(answer.clone()).await?;
        anyhow::Ok(answer.sdp)
    };

    match negotiate.await {
        Ok(sdp) => Ok(sdp),
        Err(error) => {
            close_session(&state, session_id).await;
            Err(error)
        }
    }
}

pub async fn add_ice_candidate(
    session_id: Uuid,
    state: &AppState,
    candidate: String,
) -> anyhow::Result<()> {
    let peer = {
        let Some(entry) = state.peers.get(&session_id) else {
            anyhow::bail!("peer connection has not been created for session {session_id}");
        };
        entry.value().clone()
    };

    peer.add_ice_candidate(RTCIceCandidateInit {
        candidate,
        sdp_mid: None,
        sdp_mline_index: None,
        username_fragment: None,
        url: None,
    })
    .await?;

    Ok(())
}

pub async fn close_session(state: &AppState, session_id: Uuid) {
    if let Some((_, peer)) = state.peers.remove(&session_id) {
        if let Err(error) = peer.close().await {
            warn!("session {session_id} failed to close peer connection: {error}");
        }
    }
}

async fn create_peer_connection(
    session_id: Uuid,
    state: AppState,
    events: mpsc::UnboundedSender<ServerMessage>,
) -> anyhow::Result<Arc<dyn PeerConnection>> {
    let mut media_engine = MediaEngine::default();
    media_engine.register_default_codecs()?;

    let registry = register_default_interceptors(Registry::new(), &mut media_engine)?;

    let configuration = RTCConfigurationBuilder::new()
        .with_ice_servers(ice_servers())
        .build();

    let handler = Arc::new(SessionHandler {
        session_id,
        state,
        events,
    });

    let peer = PeerConnectionBuilder::new()
        .with_configuration(configuration)
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_handler(handler)
        .with_udp_addrs(vec![udp_addr()])
        .build()
        .await?;

    Ok(Arc::new(peer))
}

fn ice_servers() -> Vec<RTCIceServer> {
    let urls: Vec<String> = std::env::var("DIARIZATION_STUN_URLS")
        .unwrap_or_else(|_| DEFAULT_STUN_URL.to_string())
        .split(',')
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
        .collect();

    if urls.is_empty() {
        return Vec::new();
    }

    vec![RTCIceServer {
        urls,
        ..Default::default()
    }]
}

fn udp_addr() -> String {
    std::env::var("DIARIZATION_RTC_UDP_ADDR").unwrap_or_else(|_| DEFAULT_UDP_ADDR.to_string())
}

#[derive(Clone)]
struct SessionHandler {
    session_id: Uuid,
    state: AppState,
    events: mpsc::UnboundedSender<ServerMessage>,
}

#[async_trait]
impl PeerConnectionEventHandler for SessionHandler {
    async fn on_ice_candidate(&self, event: RTCPeerConnectionIceEvent) {
        match event.candidate.to_json() {
            Ok(candidate) => {
                let _ = self.events.send(ServerMessage::IceCandidate {
                    candidate: candidate.candidate,
                });
            }
            Err(error) => warn!("failed to serialize ICE candidate: {error}"),
        }
    }

    async fn on_connection_state_change(&self, connection_state: RTCPeerConnectionState) {
        let session_id = self.session_id;
        debug!("session {session_id} peer connection state: {connection_state}");

        if matches!(
            connection_state,
            RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
        ) && self.state.peers.remove(&session_id).is_some()
        {
            info!("session {session_id} peer connection {connection_state}; released");
        }
    }

    async fn on_track(&self, track: Arc<dyn TrackRemote>) {
        let session_id = self.session_id;

        let Some(ssrc) = track.ssrcs().await.first().copied() else {
            warn!("session {session_id} received a track with no SSRC; ignoring");
            return;
        };
        let Some(codec) = track.codec(ssrc).await else {
            warn!("session {session_id} received a track with no negotiated codec; ignoring");
            return;
        };

        let mime_type = codec.mime_type.clone();
        if !mime_type.to_ascii_lowercase().starts_with("audio/") {
            debug!("session {session_id} ignoring non-audio track: {mime_type}");
            return;
        }

        let _ = self.events.send(ServerMessage::TrackStarted {
            codec: mime_type.clone(),
        });
        info!("session {session_id} received WebRTC audio track: {mime_type}");

        let state = self.state.clone();
        tokio::spawn(async move {
            let mut packets = 0u64;

            while let Some(event) = track.poll().await {
                match event {
                    TrackRemoteEvent::OnRtpPacket(packet) => {
                        packets += 1;
                        if let Some(mut session) = state.sessions.get_mut(&session_id) {
                            session.received_frames += 1;
                        }

                        if packets % RTP_LOG_INTERVAL == 1 {
                            warn!(
                                "session {session_id} received {packets} RTP packets ({} bytes latest); Opus decode to PCM is required before ONNX diarization",
                                packet.payload.len()
                            );
                        }
                    }
                    TrackRemoteEvent::OnEnded => break,
                    TrackRemoteEvent::OnError => {
                        warn!("session {session_id} audio track reported an error");
                        break;
                    }
                    _ => {}
                }
            }

            info!("session {session_id} audio track ended after {packets} RTP packets");
        });
    }
}
