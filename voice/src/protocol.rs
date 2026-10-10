use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::line::Line;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: Uuid,
    pub signaling_url: String,
    pub calls: bool,
    pub limits: Limits,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub take_seconds: f32,
    pub shortest_take_seconds: f32,
    pub batch: usize,
    pub generations: usize,
    pub runs: usize,
    pub bands: usize,
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
    IceCandidate {
        candidate: String,
    },
    Listen {
        #[serde(default)]
        rate: Option<u32>,
    },
    Begin {
        line: Line,
    },
    More,
    House,
    Play {
        generation: usize,
        #[serde(default)]
        onward: bool,
    },
    Hush,
    Stop,
    Ping,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ServerMessage {
    Ready { session: SessionInfo },
    Answer { sdp: String },
    IceCandidate { candidate: String },
    Listening,
    Waiting { ahead: usize },
    Began,
    House { generations: Vec<Generation> },
    Generation { generation: Generation },
    Playing { generation: usize },
    Played { generation: usize },
    Finished { reason: Ending },
    Error { message: String },
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generation {
    pub index: usize,
    pub text: String,
    pub likeness: f32,
    pub seconds: f32,
    pub spectrum: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Ending {
    Batch,
    Limit,
    Silence,
    Stopped,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_messages_are_camel_case() {
        let begin: ClientMessage =
            serde_json::from_str(r#"{"type":"begin","line":"patchy"}"#).unwrap();
        let play: ClientMessage =
            serde_json::from_str(r#"{"type":"play","generation":3}"#).unwrap();
        let candidate: ClientMessage =
            serde_json::from_str(r#"{"type":"iceCandidate","candidate":"c"}"#).unwrap();

        assert!(matches!(begin, ClientMessage::Begin { line: Line::Patchy }));
        assert!(matches!(
            play,
            ClientMessage::Play {
                generation: 3,
                onward: false
            }
        ));
        assert!(matches!(candidate, ClientMessage::IceCandidate { .. }));
    }

    #[test]
    fn a_generation_serializes_for_the_page() {
        let message = ServerMessage::Generation {
            generation: Generation {
                index: 2,
                text: "and so on".into(),
                likeness: 0.5,
                seconds: 1.5,
                spectrum: vec![0, 255],
            },
        };

        assert_eq!(
            serde_json::to_string(&message).unwrap(),
            r#"{"type":"generation","generation":{"index":2,"text":"and so on","likeness":0.5,"seconds":1.5,"spectrum":[0,255]}}"#
        );
    }

    #[test]
    fn listening_may_name_the_microphone_rate() {
        let plain: ClientMessage = serde_json::from_str(r#"{"type":"listen"}"#).unwrap();
        let fast: ClientMessage =
            serde_json::from_str(r#"{"type":"listen","rate":48000}"#).unwrap();

        assert!(matches!(plain, ClientMessage::Listen { rate: None }));
        assert!(matches!(fast, ClientMessage::Listen { rate: Some(48_000) }));
    }

    #[test]
    fn unknown_lines_are_rejected() {
        assert!(
            serde_json::from_str::<ClientMessage>(r#"{"type":"begin","line":"gale"}"#).is_err()
        );
    }
}
