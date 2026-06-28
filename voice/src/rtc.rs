use std::{future::Future, pin::Pin, sync::Arc};

use dashmap::DashMap;
use tokio::sync::mpsc;
use tracing::{info, warn};
use uuid::Uuid;
use webrtc::{
    api::{
        interceptor_registry::register_default_interceptors, media_engine::MediaEngine, APIBuilder,
    },
    ice_transport::ice_candidate::RTCIceCandidateInit,
    interceptor::registry::Registry,
    peer_connection::{
        configuration::RTCConfiguration, sdp::session_description::RTCSessionDescription,
        RTCPeerConnection,
    },
};

use crate::{protocol::ServerMessage, state::AppState};

pub type PeerConnections = Arc<DashMap<Uuid, Arc<RTCPeerConnection>>>;

pub async fn accept_offer(
    session_id: Uuid,
    state: AppState,
    sdp: String,
    events: mpsc::UnboundedSender<ServerMessage>,
) -> anyhow::Result<String> {
    let peer = create_peer_connection(session_id, state.clone(), events).await?;
    let offer = RTCSessionDescription::offer(sdp)?;

    peer.set_remote_description(offer).await?;
    let answer = peer.create_answer(None).await?;
    peer.set_local_description(answer.clone()).await?;

    state.peers.insert(session_id, peer);

    Ok(answer.sdp)
}

pub async fn add_ice_candidate(
    session_id: Uuid,
    state: &AppState,
    candidate: String,
) -> anyhow::Result<()> {
    let Some(peer) = state.peers.get(&session_id) else {
        anyhow::bail!("peer connection has not been created for session {session_id}");
    };

    peer.add_ice_candidate(RTCIceCandidateInit {
        candidate,
        sdp_mid: None,
        sdp_mline_index: None,
        username_fragment: None,
    })
    .await?;

    Ok(())
}

async fn create_peer_connection(
    session_id: Uuid,
    state: AppState,
    events: mpsc::UnboundedSender<ServerMessage>,
) -> anyhow::Result<Arc<RTCPeerConnection>> {
    let mut media_engine = MediaEngine::default();
    media_engine.register_default_codecs()?;

    let registry = register_default_interceptors(Registry::new(), &mut media_engine)?;
    let api = APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build();

    let peer = Arc::new(api.new_peer_connection(RTCConfiguration::default()).await?);

    let ice_events = events.clone();
    peer.on_ice_candidate(Box::new(move |candidate| {
        let ice_events = ice_events.clone();
        Box::pin(async move {
            let Some(candidate) = candidate else {
                return;
            };

            match candidate.to_json() {
                Ok(candidate) => {
                    let _ = ice_events.send(ServerMessage::IceCandidate {
                        candidate: candidate.candidate,
                    });
                }
                Err(error) => warn!("failed to serialize ICE candidate: {error}"),
            }
        })
    }));

    peer.on_track(Box::new(move |track, _receiver, _transceiver| {
		let state = state.clone();
		let events = events.clone();
		Box::pin(async move {
			let codec = track.codec();
			let mime_type = codec.capability.mime_type.clone();
			if !mime_type.to_ascii_lowercase().starts_with("audio/") {
				return;
			}

			let _ = events.send(ServerMessage::TrackStarted {
				codec: mime_type.clone(),
			});
			info!("session {session_id} received WebRTC audio track: {mime_type}");

			while let Ok((packet, _attributes)) = track.read_rtp().await {
				if let Some(mut session) = state.sessions.get_mut(&session_id) {
					session.received_frames += 1;
				}

				warn!(
					"session {session_id} received RTP payload of {} bytes; Opus decode to PCM is required before ONNX diarization",
					packet.payload.len()
				);
			}
		}) as Pin<Box<dyn Future<Output = ()> + Send + 'static>>
	}));

    Ok(peer)
}
