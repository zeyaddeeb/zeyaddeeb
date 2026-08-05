use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{
    diarizer::AudioFrame,
    protocol::{ClientMessage, ServerMessage},
    rtc,
    state::AppState,
};

pub async fn handle(socket: WebSocket, session_id: Uuid, state: AppState, host: String) {
    if let Some(mut session) = state.sessions.get_mut(&session_id) {
        session.connected_clients += 1;
    } else {
        return;
    }

    let (mut sender, mut receiver) = socket.split();
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<ServerMessage>();

    if let Some(session) = state.session_info(session_id, &host) {
        let _ = send_json(&mut sender, &ServerMessage::Ready { session }).await;
    }

    loop {
        tokio::select! {
            event = event_rx.recv() => {
                let Some(event) = event else {
                    break;
                };
                if send_json(&mut sender, &event).await.is_err() {
                    break;
                }
            }
            message = receiver.next() => {
                let Some(Ok(message)) = message else {
                    break;
                };
                let Message::Text(text) = message else {
                    continue;
                };

                if let Some(response) = handle_client_message(&state, session_id, text.to_string(), event_tx.clone()).await {
                    if send_json(&mut sender, &response).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    if let Some(mut session) = state.sessions.get_mut(&session_id) {
        session.connected_clients = session.connected_clients.saturating_sub(1);
    }

    rtc::close_session(&state, session_id).await;
}

async fn handle_client_message(
    state: &AppState,
    session_id: Uuid,
    text: String,
    event_tx: mpsc::UnboundedSender<ServerMessage>,
) -> Option<ServerMessage> {
    match serde_json::from_str::<ClientMessage>(&text) {
        Ok(ClientMessage::Offer { sdp }) => {
            match rtc::accept_offer(session_id, state.clone(), sdp, event_tx).await {
                Ok(sdp) => Some(ServerMessage::Answer { sdp }),
                Err(error) => Some(ServerMessage::Error {
                    message: format!("failed to accept WebRTC offer: {error}"),
                }),
            }
        }
        Ok(ClientMessage::Answer) => Some(ServerMessage::Error {
            message: "backend is the WebRTC answerer; send an offer from the browser".to_string(),
        }),
        Ok(ClientMessage::IceCandidate { candidate }) => {
            match rtc::add_ice_candidate(session_id, state, candidate).await {
                Ok(()) => None,
                Err(error) => Some(ServerMessage::Error {
                    message: format!("failed to add ICE candidate: {error}"),
                }),
            }
        }
        Ok(ClientMessage::AudioFrame {
            sample_rate,
            channels,
            samples,
        }) => analyze_frame(state, session_id, sample_rate, channels, samples),
        Ok(ClientMessage::Ping) => Some(ServerMessage::Pong),
        Err(error) => Some(ServerMessage::Error {
            message: format!("invalid message: {error}"),
        }),
    }
}

fn analyze_frame(
    state: &AppState,
    session_id: Uuid,
    sample_rate: u32,
    channels: u8,
    samples: Vec<f32>,
) -> Option<ServerMessage> {
    let processed_ms = state
        .sessions
        .get(&session_id)
        .map(|session| session.processed_ms)
        .unwrap_or_default();

    match state.diarizer.analyze(
        processed_ms,
        AudioFrame {
            sample_rate,
            channels,
            samples,
        },
    ) {
        Ok(result) => {
            if let Some(mut session) = state.sessions.get_mut(&session_id) {
                session.received_frames += 1;
                session.processed_ms = result.processed_ms;
                session.active_speakers = result.speakers.len();
            }
            Some(ServerMessage::Diarization { result })
        }
        Err(error) => Some(ServerMessage::Error {
            message: format!("analysis failed: {error}"),
        }),
    }
}

async fn send_json(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: &ServerMessage,
) -> Result<(), axum::Error> {
    sender
        .send(Message::Text(
            serde_json::to_string(message)
                .unwrap_or_else(|_| "{}".to_string())
                .into(),
        ))
        .await
}
