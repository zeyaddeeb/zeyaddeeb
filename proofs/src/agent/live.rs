use super::memory::{AgentState, Episode, Link, Node, Verdict};
use serde::Serialize;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

const BACKLOG: usize = 800;
const DELTA_CHARS: usize = 16_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Work,
    Sleep,
    Rest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Channel {
    Think,
    Say,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Arm {
    pub front: String,
    pub pulls: u64,
    pub mean: f64,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStep {
    pub id: u32,
    pub parent: Option<u32>,
    pub tactic: String,
    pub source: &'static str,
    pub ok: bool,
    pub goals: usize,
    pub goal: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Event {
    Wake {
        episode: u64,
        front: String,
        arms: Vec<Arm>,
    },
    Sleep {
        after: u64,
    },
    Phase {
        phase: Phase,
        seconds: Option<u64>,
        reason: Option<String>,
    },
    Retry {
        turn: u32,
    },
    Delta {
        turn: u32,
        channel: Channel,
        text: String,
    },
    Call {
        turn: u32,
        id: String,
        tool: String,
        args: Value,
    },
    Outcome {
        turn: u32,
        id: String,
        tool: String,
        ok: bool,
        summary: String,
        verdict: Option<Verdict>,
        data: Value,
    },
    Node {
        node: Node,
    },
    Link {
        link: Link,
    },
    Search {
        step: SearchStep,
    },
    Concluded {
        episode: Episode,
    },
    Stats {
        state: AgentState,
    },
    Trouble {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub seq: u64,
    pub at: i64,
    #[serde(flatten)]
    pub event: Event,
}

struct Inner {
    seq: u64,
    backlog: Vec<Envelope>,
    stats: Option<Envelope>,
}

pub struct Hub {
    sender: broadcast::Sender<Envelope>,
    inner: Mutex<Inner>,
}

impl Hub {
    pub fn new() -> Arc<Self> {
        let (sender, _) = broadcast::channel(1024);
        Arc::new(Hub {
            sender,
            inner: Mutex::new(Inner {
                seq: 0,
                backlog: Vec::new(),
                stats: None,
            }),
        })
    }

    pub fn emit(&self, event: Event) {
        let envelope = {
            let mut inner = self.inner.lock().expect("hub lock");
            inner.seq += 1;
            let envelope = Envelope {
                seq: inner.seq,
                at: super::now(),
                event,
            };
            inner.keep(&envelope);
            envelope
        };
        let _ = self.sender.send(envelope);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Envelope> {
        self.sender.subscribe()
    }

    pub fn watchers(&self) -> usize {
        self.sender.receiver_count()
    }

    pub fn backlog(&self) -> Vec<Envelope> {
        let inner = self.inner.lock().expect("hub lock");
        inner.stats.iter().chain(&inner.backlog).cloned().collect()
    }
}

impl Inner {
    fn keep(&mut self, envelope: &Envelope) {
        match &envelope.event {
            Event::Stats { .. } => self.stats = Some(envelope.clone()),
            Event::Wake { .. } | Event::Sleep { .. } => self.backlog = vec![envelope.clone()],
            Event::Retry { turn } => {
                self.backlog.retain(
                    |kept| !matches!(&kept.event, Event::Delta { turn: t, .. } if t == turn),
                );
                self.backlog.push(envelope.clone());
            }
            Event::Delta {
                turn,
                channel,
                text,
            } => {
                if let Some(Envelope {
                    event:
                        Event::Delta {
                            turn: last_turn,
                            channel: last_channel,
                            text: last_text,
                        },
                    seq,
                    at,
                }) = self.backlog.last_mut()
                {
                    if last_turn == turn && last_channel == channel {
                        if last_text.len() < DELTA_CHARS {
                            last_text.push_str(text);
                        }
                        *seq = envelope.seq;
                        *at = envelope.at;
                        return;
                    }
                }
                self.backlog.push(envelope.clone());
            }
            _ => self.backlog.push(envelope.clone()),
        }
        if self.backlog.len() > BACKLOG {
            self.backlog.drain(1..self.backlog.len() - BACKLOG + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn delta(turn: u32, channel: Channel, text: &str) -> Event {
        Event::Delta {
            turn,
            channel,
            text: text.into(),
        }
    }

    #[test]
    fn deltas_merge_into_one_entry_per_turn_and_channel() {
        let hub = Hub::new();
        hub.emit(Event::Wake {
            episode: 1,
            front: "line".into(),
            arms: Vec::new(),
        });
        hub.emit(delta(0, Channel::Think, "The zeros "));
        hub.emit(delta(0, Channel::Think, "repel."));
        hub.emit(delta(0, Channel::Say, "Plan:"));
        hub.emit(delta(1, Channel::Think, "Next."));
        let backlog = hub.backlog();
        assert_eq!(backlog.len(), 4);
        match &backlog[1].event {
            Event::Delta { text, .. } => assert_eq!(text, "The zeros repel."),
            other => panic!("{other:?}"),
        }
        assert_eq!(backlog[1].seq, 3);
    }

    #[test]
    fn a_new_episode_clears_the_backlog_but_keeps_stats() {
        let hub = Hub::new();
        hub.emit(Event::Stats {
            state: AgentState::default(),
        });
        hub.emit(delta(0, Channel::Think, "old"));
        hub.emit(Event::Wake {
            episode: 2,
            front: "divisors".into(),
            arms: Vec::new(),
        });
        let backlog = hub.backlog();
        assert_eq!(backlog.len(), 2);
        assert!(matches!(backlog[0].event, Event::Stats { .. }));
        assert!(matches!(backlog[1].event, Event::Wake { .. }));
    }

    #[test]
    fn a_retry_retracts_the_turn_it_names() {
        let hub = Hub::new();
        hub.emit(delta(0, Channel::Think, "kept"));
        hub.emit(delta(1, Channel::Think, "half a tho"));
        hub.emit(Event::Retry { turn: 1 });
        let backlog = hub.backlog();
        assert_eq!(backlog.len(), 2);
        assert!(matches!(backlog[1].event, Event::Retry { turn: 1 }));
    }

    #[test]
    fn events_serialize_with_a_type_tag() {
        let envelope = Envelope {
            seq: 7,
            at: 1,
            event: delta(2, Channel::Say, "hi"),
        };
        let json = serde_json::to_value(&envelope).unwrap();
        assert_eq!(json["type"], "delta");
        assert_eq!(json["channel"], "say");
        assert_eq!(json["seq"], 7);
    }
}
