use std::sync::{atomic::Ordering, Arc};

use anyhow::anyhow;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{
    audio::{self, RATE},
    codec::{frames, Encoder},
    line::Line,
    protocol::{Ending, ServerMessage},
    room::{Progress, Room, Turn},
    state::{Packets, Session, LIMITS},
};

const PLAYBACK_BITS: i32 = 32_000;
const PLAYBACK_LOSS: f32 = 0.05;
const ONE_VOICE: f32 = 0.55;
const ONE_VOICE_SECONDS: usize = 3;

pub enum Start {
    Take { samples: Vec<f32>, line: Line },
    More,
}

pub fn perform(
    room: &Room,
    session: &Session,
    start: Start,
    events: &mpsc::Sender<ServerMessage>,
) -> anyhow::Result<Ending> {
    let mut progress = match start {
        Start::Take { samples, line } => first(room, session, &samples, line, events)?,
        Start::More => session
            .standing
            .lock()
            .map_err(|_| anyhow!("the run was lost"))?
            .take()
            .ok_or_else(|| anyhow!("there is nothing to continue"))?,
    };

    let ending = repeat(room, session, &mut progress, events)?;

    *session
        .standing
        .lock()
        .map_err(|_| anyhow!("the run was lost"))? = Some(progress);

    Ok(ending)
}

fn first(
    room: &Room,
    session: &Session,
    take: &[f32],
    line: Line,
    events: &mpsc::Sender<ServerMessage>,
) -> anyhow::Result<Progress> {
    let spoken = audio::trim(take, RATE);

    if (spoken.len() as f32) < LIMITS.shortest_take_seconds * RATE as f32 {
        return Err(anyhow!("that was too short to learn a voice from"));
    }

    if spoken.len() >= ONE_VOICE_SECONDS * RATE as usize {
        let (opening, closing) = spoken.split_at(spoken.len() / 2);

        if room.alike(opening, closing)? < ONE_VOICE {
            return Err(anyhow!(
                "that sounded like more than one voice; try again with one"
            ));
        }
    }

    let (turn, progress) = room.begin(spoken, line, Uuid::new_v4().as_u128() as u64)?;

    session
        .tape
        .lock()
        .map_err(|_| anyhow!("the tape was lost"))?
        .clear();

    publish(session, turn, events)?;

    Ok(progress)
}

fn repeat(
    room: &Room,
    session: &Session,
    progress: &mut Progress,
    events: &mpsc::Sender<ServerMessage>,
) -> anyhow::Result<Ending> {
    for _ in 0..LIMITS.batch {
        if session.halted.load(Ordering::Relaxed) {
            return Ok(Ending::Stopped);
        }

        if progress.index() >= LIMITS.generations {
            return Ok(Ending::Limit);
        }

        let Some(turn) = room.advance(progress)? else {
            return Ok(Ending::Silence);
        };

        publish(session, turn, events)?;
    }

    Ok(Ending::Batch)
}

fn publish(
    session: &Session,
    turn: Turn,
    events: &mpsc::Sender<ServerMessage>,
) -> anyhow::Result<()> {
    let packets = tape(&turn.recording.samples)?;

    session
        .tape
        .lock()
        .map_err(|_| anyhow!("the tape was lost"))?
        .push(packets);

    events
        .blocking_send(ServerMessage::Generation {
            generation: turn.generation,
        })
        .map_err(|_| anyhow!("the listener left"))
}

pub fn tape(samples: &[f32]) -> anyhow::Result<Packets> {
    let mut encoder = Encoder::new(PLAYBACK_BITS, PLAYBACK_LOSS)?;

    Ok(Arc::new(
        frames(samples)
            .map(|frame| encoder.encode(&frame))
            .collect::<anyhow::Result<_>>()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::{Decoder, FRAME};

    #[test]
    fn a_tape_plays_back_at_full_length() {
        let samples: Vec<f32> = (0..RATE as usize)
            .map(|n| (std::f32::consts::TAU * 220.0 * n as f32 / RATE as f32).sin() * 0.3)
            .collect();
        let packets = tape(&samples).unwrap();
        let arrivals: Vec<_> = packets.iter().cloned().map(Some).collect();
        let heard = Decoder::new().unwrap().receive(&arrivals).unwrap();

        assert_eq!(packets.len(), RATE as usize / FRAME);
        assert_eq!(heard.len(), samples.len());
    }
}
