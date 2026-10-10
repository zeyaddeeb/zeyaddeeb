use std::{
    sync::{atomic::Ordering, Arc},
    time::{Duration, Instant},
};

use anyhow::anyhow;
use async_trait::async_trait;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{
    audio::{self, RATE},
    codec::Decoder,
    player::{self, Cue, Sink},
    protocol::{ClientMessage, Ending, ServerMessage},
    rtc,
    run::{self, Start},
    state::{AppState, Session, LIMITS},
};

const IDLE: Duration = Duration::from_secs(60);
const MESSAGES_PER_SECOND: u32 = 30;
const OFFERS: usize = 6;
const FRAMES_AHEAD: usize = 64;
const RATES: std::ops::RangeInclusive<u32> = 8_000..=96_000;

pub async fn handle(socket: WebSocket, session_id: Uuid, state: AppState) -> bool {
    let Some(session) = state.session(session_id) else {
        return false;
    };

    if session.attached.swap(true, Ordering::AcqRel) {
        return false;
    }

    let (mut sender, mut receiver) = socket.split();
    let (events, mut outbox) = mpsc::channel::<ServerMessage>(64);
    let mut sound = wire(&state, &session, &events);
    let ready = ServerMessage::Ready {
        session: state.session_info(session_id),
    };
    let mut budget = (Instant::now(), 0u32);

    if send_json(&mut sender, &ready).await.is_ok() {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(IDLE) => break,
                event = outbox.recv() => {
                    let Some(event) = event else {
                        break;
                    };

                    announce(&session, &event);

                    if send_json(&mut sender, &event).await.is_err() {
                        break;
                    }
                }
                frame = next(&mut sound) => {
                    let Some(frame) = frame else {
                        break;
                    };

                    if sender.send(Message::Binary(frame.into())).await.is_err() {
                        break;
                    }
                }
                message = receiver.next() => {
                    let Some(Ok(message)) = message else {
                        break;
                    };

                    if over_budget(&mut budget) {
                        break;
                    }

                    let reply = match message {
                        Message::Text(text) => answer(&state, &session, &text, &events).await,
                        Message::Binary(bytes) if sound.is_some() => {
                            overhear(&session, &bytes);

                            None
                        }
                        _ => None,
                    };

                    if let Some(reply) = reply {
                        if send_json(&mut sender, &reply).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }

    true
}

struct Wire {
    decoder: Decoder,
    frames: mpsc::Sender<Vec<u8>>,
    heard: Vec<f32>,
}

#[async_trait]
impl Sink for Wire {
    fn ready(&self) -> bool {
        true
    }

    async fn send(&mut self, packet: &[u8]) -> anyhow::Result<()> {
        self.heard.clear();
        self.decoder.decode(packet, &mut self.heard)?;

        self.frames
            .send(audio::to_bytes(&self.heard))
            .await
            .map_err(|_| anyhow!("the listener left"))
    }

    async fn rest(&mut self) -> anyhow::Result<()> {
        Ok(())
    }
}

fn wire(
    state: &AppState,
    session: &Session,
    events: &mpsc::Sender<ServerMessage>,
) -> Option<mpsc::Receiver<Vec<u8>>> {
    if state.network.calls() {
        return None;
    }

    let (frames, sound) = mpsc::channel(FRAMES_AHEAD);
    let wire = Wire {
        decoder: Decoder::new().ok()?,
        frames,
        heard: Vec::new(),
    };

    session.listen_through(player::start(wire, events.clone()));

    Some(sound)
}

async fn next(sound: &mut Option<mpsc::Receiver<Vec<u8>>>) -> Option<Vec<u8>> {
    match sound {
        Some(frames) => frames.recv().await,
        None => std::future::pending().await,
    }
}

fn overhear(session: &Session, bytes: &[u8]) {
    let Some(samples) = audio::from_bytes(bytes) else {
        return;
    };

    if let Ok(mut microphone) = session.microphone.lock() {
        microphone.hear(&samples);
    }
}

fn over_budget(budget: &mut (Instant, u32)) -> bool {
    if budget.0.elapsed() >= Duration::from_secs(1) {
        *budget = (Instant::now(), 0);
    }

    budget.1 += 1;

    budget.1 > MESSAGES_PER_SECOND
}

pub async fn hang_up(session: &Session) {
    session.halted.store(true, Ordering::Relaxed);
    session.go_quiet();

    if let Some(call) = session.call.lock().await.take() {
        call.close().await;
    }

    session.attached.store(false, Ordering::Release);
}

fn announce(session: &Session, event: &ServerMessage) {
    if let ServerMessage::Generation { generation } = event {
        play(session, generation.index);
    }
}

async fn answer(
    state: &AppState,
    session: &Arc<Session>,
    text: &str,
    events: &mpsc::Sender<ServerMessage>,
) -> Option<ServerMessage> {
    let message = match serde_json::from_str::<ClientMessage>(text) {
        Ok(message) => message,
        Err(error) => return Some(refusal(anyhow!("invalid message: {error}"))),
    };

    match message {
        ClientMessage::Offer { sdp } => Some(offer(state, session, sdp, events).await),
        ClientMessage::IceCandidate { candidate } => match session.call.lock().await.as_ref() {
            Some(call) => call.add_ice_candidate(candidate).await.err().map(refusal),
            None => Some(refusal(anyhow!("send an offer before candidates"))),
        },
        ClientMessage::Listen { rate } => Some(listen(session, rate.unwrap_or(RATE))),
        ClientMessage::Begin { line } => {
            let samples = session
                .microphone
                .lock()
                .map(|mut microphone| microphone.close())
                .unwrap_or_default();

            start(state, session, Start::Take { samples, line }, events)
        }
        ClientMessage::More => start(state, session, Start::More, events),
        ClientMessage::House => Some(house(state, session).await),
        ClientMessage::Play { generation, onward } => {
            session.cue(Cue::Hush);

            let last = if onward {
                tape_length(session)
            } else {
                generation + 1
            };

            for index in generation..last {
                play(session, index);
            }

            None
        }
        ClientMessage::Hush => {
            session.cue(Cue::Hush);

            None
        }
        ClientMessage::Stop => {
            session.halted.store(true, Ordering::Relaxed);
            session.cue(Cue::Hush);

            None
        }
        ClientMessage::Ping => Some(ServerMessage::Pong),
    }
}

async fn offer(
    state: &AppState,
    session: &Arc<Session>,
    sdp: String,
    events: &mpsc::Sender<ServerMessage>,
) -> ServerMessage {
    if !state.network.calls() {
        return refusal(anyhow!(
            "this room carries sound over the socket, not a call"
        ));
    }

    if session.offers.fetch_add(1, Ordering::Relaxed) >= OFFERS {
        return refusal(anyhow!(
            "too many calls for one visit; reload to start over"
        ));
    }

    rtc::accept_offer(session.clone(), &state.network, sdp, events.clone())
        .await
        .map_or_else(refusal, |sdp| ServerMessage::Answer { sdp })
}

fn refusal(error: anyhow::Error) -> ServerMessage {
    ServerMessage::Error {
        message: error.to_string(),
    }
}

fn listen(session: &Session, rate: u32) -> ServerMessage {
    if !RATES.contains(&rate) {
        return refusal(anyhow!("that microphone rate is not supported"));
    }

    session.halted.store(true, Ordering::Relaxed);
    session.cue(Cue::Hush);

    match session.microphone.lock() {
        Ok(mut microphone) => {
            microphone.open(rate);

            ServerMessage::Listening
        }
        Err(_) => refusal(anyhow!("the microphone was lost")),
    }
}

fn play(session: &Session, generation: usize) {
    let packets = session
        .tape
        .lock()
        .ok()
        .and_then(|tape| tape.get(generation).cloned());

    if let Some(packets) = packets {
        session.cue(Cue::Play {
            generation,
            packets,
        });
    }
}

fn tape_length(session: &Session) -> usize {
    session.tape.lock().map_or(0, |tape| tape.len())
}

async fn house(state: &AppState, session: &Session) -> ServerMessage {
    let Some(house) = state.house.get() else {
        return refusal(anyhow!(
            "the recorded run is still being made; try again in a minute"
        ));
    };

    session.halted.store(true, Ordering::Relaxed);
    session.cue(Cue::Hush);

    let _stage = session.stage.lock().await;

    if let Ok(mut standing) = session.standing.lock() {
        *standing = None;
    }

    if let Ok(mut tape) = session.tape.lock() {
        *tape = house.tape.clone();
    }

    ServerMessage::House {
        generations: house.generations.clone(),
    }
}

fn start(
    state: &AppState,
    session: &Arc<Session>,
    start: Start,
    events: &mpsc::Sender<ServerMessage>,
) -> Option<ServerMessage> {
    let fresh = matches!(start, Start::Take { .. });

    if fresh && session.runs.load(Ordering::Relaxed) >= LIMITS.runs {
        return Some(refusal(anyhow!(
            "that is enough runs for one visit; reload to start over"
        )));
    }

    if session.queued.swap(true, Ordering::AcqRel) {
        return Some(refusal(anyhow!("one run at a time")));
    }

    let spent = fresh
        && session
            .who
            .as_deref()
            .is_some_and(|who| !state.clients.take(who, Instant::now()));

    if spent {
        session.queued.store(false, Ordering::Release);

        return Some(refusal(anyhow!(
            "that is enough for one hour; the recorded run is still here"
        )));
    }

    let (state, session, events) = (state.clone(), session.clone(), events.clone());

    tokio::spawn(async move {
        let _stage = session.stage.lock().await;

        session.queued.store(false, Ordering::Release);
        session.halted.store(false, Ordering::Relaxed);

        if fresh {
            session.runs.fetch_add(1, Ordering::Relaxed);

            let _ = events.send(ServerMessage::Began).await;
        }

        let outcome = conduct(&state, &session, start, &events).await;
        let _ = events
            .send(outcome.map_or_else(refusal, |reason| ServerMessage::Finished { reason }))
            .await;
    });

    None
}

async fn conduct(
    state: &AppState,
    session: &Arc<Session>,
    start: Start,
    events: &mpsc::Sender<ServerMessage>,
) -> anyhow::Result<Ending> {
    let room = state.door.open().await?;
    let _turn = match state.turns.clone().try_acquire_owned() {
        Ok(turn) => turn,
        Err(_) => {
            let ahead = state.waiting.fetch_add(1, Ordering::Relaxed) + 1;
            let _ = events.send(ServerMessage::Waiting { ahead }).await;
            let turn = state.turns.clone().acquire_owned().await;

            state.waiting.fetch_sub(1, Ordering::Relaxed);

            turn?
        }
    };

    let (session, events) = (session.clone(), events.clone());

    let ending =
        tokio::task::spawn_blocking(move || run::perform(&room, &session, start, &events)).await?;

    state.door.touch();

    ending
}

async fn send_json(
    sender: &mut SplitSink<WebSocket, Message>,
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
