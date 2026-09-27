use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: Uuid,
    pub signaling_url: String,
    pub model_loaded: bool,
    pub sample_rate: u32,
    pub frame_ms: u16,
    pub status: SessionStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub connected_clients: usize,
    pub received_frames: u64,
    pub active_speakers: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientMessage {
    Offer {
        sdp: String,
    },
    Answer,
    IceCandidate {
        candidate: String,
    },
    AudioFrame {
        sample_rate: u32,
        channels: u8,
        samples: Vec<f32>,
    },
    Ping,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    Ready { session: SessionInfo },
    Answer { sdp: String },
    IceCandidate { candidate: String },
    TrackStarted { codec: String },
    Diarization { result: DiarizationResult },
    Error { message: String },
    Pong,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiarizationResult {
    pub processed_ms: u64,
    pub speakers: Vec<SpeakerSegment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerSegment {
    pub speaker: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub confidence: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_frame_fields_are_camel_case() {
        let message: ClientMessage = serde_json::from_str(
            r#"{"type":"audioFrame","sampleRate":16000,"channels":1,"samples":[0.5]}"#,
        )
        .unwrap();
        let ClientMessage::AudioFrame {
            sample_rate,
            channels,
            samples,
        } = message
        else {
            panic!("expected an audio frame");
        };
        assert_eq!((sample_rate, channels, samples), (16000, 1, vec![0.5]));
    }
}
