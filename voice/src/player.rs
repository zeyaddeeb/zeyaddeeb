use std::{collections::VecDeque, time::Duration};

use async_trait::async_trait;
use tokio::sync::mpsc;
use tracing::debug;

use crate::{codec::FRAME_MS, protocol::ServerMessage, state::Packets};

pub enum Cue {
    Play { generation: usize, packets: Packets },
    Hush,
}

#[async_trait]
pub trait Sink: Send + 'static {
    fn ready(&self) -> bool;

    async fn send(&mut self, packet: &[u8]) -> anyhow::Result<()>;

    async fn rest(&mut self) -> anyhow::Result<()>;
}

struct Playing {
    generation: usize,
    packets: Packets,
    next: usize,
}

pub fn start(sink: impl Sink, events: mpsc::Sender<ServerMessage>) -> mpsc::UnboundedSender<Cue> {
    let (cues, queue) = mpsc::unbounded_channel();

    tokio::spawn(play(sink, queue, events));

    cues
}

async fn play(
    mut sink: impl Sink,
    mut queue: mpsc::UnboundedReceiver<Cue>,
    events: mpsc::Sender<ServerMessage>,
) {
    let mut pace = tokio::time::interval(Duration::from_millis(FRAME_MS));
    let mut waiting: VecDeque<Playing> = VecDeque::new();

    loop {
        pace.tick().await;

        if !hear(&mut queue, &mut waiting) {
            return;
        }

        if !sink.ready() {
            continue;
        }

        let sent = match advance(&mut waiting, &events) {
            Some(packet) => sink.send(&packet).await,
            None => sink.rest().await,
        };

        if let Err(error) = sent {
            debug!("nothing was sent: {error}");
        }
    }
}

fn hear(queue: &mut mpsc::UnboundedReceiver<Cue>, waiting: &mut VecDeque<Playing>) -> bool {
    loop {
        match queue.try_recv() {
            Ok(Cue::Play {
                generation,
                packets,
            }) => waiting.push_back(Playing {
                generation,
                packets,
                next: 0,
            }),
            Ok(Cue::Hush) => waiting.clear(),
            Err(mpsc::error::TryRecvError::Empty) => return true,
            Err(mpsc::error::TryRecvError::Disconnected) => return false,
        }
    }
}

fn advance(
    waiting: &mut VecDeque<Playing>,
    events: &mpsc::Sender<ServerMessage>,
) -> Option<Vec<u8>> {
    let playing = waiting.front_mut()?;
    let generation = playing.generation;

    if playing.next == 0 {
        let _ = events.try_send(ServerMessage::Playing { generation });
    }

    let packet = playing.packets.get(playing.next).cloned();

    playing.next += 1;

    if playing.next >= playing.packets.len() {
        let _ = events.try_send(ServerMessage::Played { generation });

        waiting.pop_front();
    }

    packet
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone, Default)]
    struct Recorder {
        sent: Arc<Mutex<Vec<Vec<u8>>>>,
        rests: Arc<Mutex<usize>>,
        deaf: bool,
    }

    #[async_trait]
    impl Sink for Recorder {
        fn ready(&self) -> bool {
            !self.deaf
        }

        async fn send(&mut self, packet: &[u8]) -> anyhow::Result<()> {
            self.sent.lock().unwrap().push(packet.to_vec());

            Ok(())
        }

        async fn rest(&mut self) -> anyhow::Result<()> {
            *self.rests.lock().unwrap() += 1;

            Ok(())
        }
    }

    fn tape(marks: &[u8]) -> Packets {
        Arc::new(marks.iter().map(|mark| vec![*mark]).collect())
    }

    fn cue(generation: usize, marks: &[u8]) -> Cue {
        Cue::Play {
            generation,
            packets: tape(marks),
        }
    }

    async fn settle() {
        tokio::time::sleep(Duration::from_millis(FRAME_MS * 12)).await;
    }

    fn told(events: &mut mpsc::Receiver<ServerMessage>) -> Vec<String> {
        std::iter::from_fn(|| events.try_recv().ok())
            .filter_map(|event| match event {
                ServerMessage::Playing { generation } => Some(format!("playing {generation}")),
                ServerMessage::Played { generation } => Some(format!("played {generation}")),
                _ => None,
            })
            .collect()
    }

    #[tokio::test(start_paused = true)]
    async fn cues_play_in_order_and_say_so() {
        let recorder = Recorder::default();
        let (events, mut heard) = mpsc::channel(32);
        let cues = start(recorder.clone(), events);

        cues.send(cue(0, &[1, 2])).ok();
        cues.send(cue(1, &[3])).ok();
        settle().await;

        assert_eq!(
            *recorder.sent.lock().unwrap(),
            vec![vec![1], vec![2], vec![3]]
        );
        assert_eq!(
            told(&mut heard),
            ["playing 0", "played 0", "playing 1", "played 1"]
        );
        assert!(*recorder.rests.lock().unwrap() > 0);
    }

    #[tokio::test(start_paused = true)]
    async fn a_hush_drops_what_was_waiting() {
        let recorder = Recorder::default();
        let (events, _heard) = mpsc::channel(32);
        let cues = start(recorder.clone(), events);

        cues.send(cue(0, &[1, 2, 3])).ok();
        cues.send(Cue::Hush).ok();
        cues.send(cue(1, &[9])).ok();
        settle().await;

        assert_eq!(*recorder.sent.lock().unwrap(), vec![vec![9]]);
    }

    #[tokio::test(start_paused = true)]
    async fn nothing_is_sent_until_the_sink_is_ready() {
        let recorder = Recorder {
            deaf: true,
            ..Recorder::default()
        };
        let (events, mut heard) = mpsc::channel(32);
        let cues = start(recorder.clone(), events);

        cues.send(cue(0, &[1])).ok();
        settle().await;

        assert!(recorder.sent.lock().unwrap().is_empty());
        assert!(told(&mut heard).is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn dropping_the_cues_ends_the_player() {
        let recorder = Recorder::default();
        let (events, _heard) = mpsc::channel(32);
        let cues = start(recorder.clone(), events);

        drop(cues);
        settle().await;

        let rests = *recorder.rests.lock().unwrap();

        settle().await;

        assert_eq!(*recorder.rests.lock().unwrap(), rests);
    }
}
