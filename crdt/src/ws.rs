use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tracing::{error, warn};

use crate::{
    crdt::{ClientMsg, CrdtOp, ServerMsg},
    db,
    state::{AppState, Room},
};

const CURSOR_MIN_INTERVAL: Duration = Duration::from_millis(50);

struct PeerGuard {
    room: Room,
    peer: u32,
}

impl Drop for PeerGuard {
    fn drop(&mut self) {
        let peers = self.room.leave();
        let _ = self
            .room
            .tx
            .send(json(&ServerMsg::Leave { peer: self.peer }));
        let _ = self.room.tx.send(json(&ServerMsg::Presence { peers }));
    }
}

fn json(msg: &ServerMsg<'_>) -> String {
    serde_json::to_string(msg).unwrap_or_default()
}

pub async fn handle(socket: WebSocket, doc_id: String, state: AppState) {
    let (mut sink, mut stream) = socket.split();

    let joined = loop {
        match stream.next().await {
            Some(Ok(Message::Text(text))) => match serde_json::from_str::<ClientMsg>(&text) {
                Ok(ClientMsg::Join) => break true,
                Ok(_) => warn!("expected join, got another message — ignoring"),
                Err(e) => warn!("bad message before join: {e}"),
            },
            Some(Ok(Message::Close(_))) | None => break false,
            _ => {}
        }
    };

    if !joined {
        return;
    }

    let ops = match db::load_ops(&state.db, &doc_id).await {
        Ok(ops) => ops,
        Err(e) => {
            error!("db error loading ops for {doc_id}: {e}");
            let msg = json(&ServerMsg::Error {
                message: "failed to load document".into(),
            });
            let _ = sink.send(Message::Text(msg.into())).await;
            return;
        }
    };

    let room = state.room_for(&doc_id);
    let mut rx: broadcast::Receiver<String> = room.tx.subscribe();
    let (peer, peers) = room.join();
    let _guard = PeerGuard {
        room: room.clone(),
        peer,
    };

    let init_json = json(&ServerMsg::Init {
        ops: &ops,
        peer,
        peers,
    });
    if sink.send(Message::Text(init_json.into())).await.is_err() {
        return;
    }
    let _ = room.tx.send(json(&ServerMsg::Presence { peers }));

    let mut outbound = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(json) => {
                    if sink.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Closed) => break,
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    warn!("broadcast lagged by {n} messages");
                }
            }
        }
    });

    let mut last_cursor = Instant::now() - CURSOR_MIN_INTERVAL;

    loop {
        tokio::select! {
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_client_msg(&text, &doc_id, &state, &room, peer, &mut last_cursor).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        warn!("ws read error: {e}");
                        break;
                    }
                    _ => {}
                }
            }
            _ = &mut outbound => break,
        }
    }

    outbound.abort();
}

async fn handle_client_msg(
    text: &str,
    doc_id: &str,
    state: &AppState,
    room: &Room,
    peer: u32,
    last_cursor: &mut Instant,
) {
    let msg = match serde_json::from_str::<ClientMsg>(text) {
        Ok(msg) => msg,
        Err(e) => {
            warn!("invalid message from client: {e}");
            return;
        }
    };

    match msg {
        ClientMsg::Join => {}
        ClientMsg::Cursor { x, y } => {
            let now = Instant::now();
            if now.duration_since(*last_cursor) < CURSOR_MIN_INTERVAL {
                return;
            }
            if !(x.is_finite() && y.is_finite()) {
                return;
            }
            *last_cursor = now;
            let _ = room.tx.send(json(&ServerMsg::Cursor {
                peer,
                x: x.clamp(0.0, 1.0),
                y: y.clamp(0.0, 1.0),
            }));
        }
        ClientMsg::Op { op } => persist_and_broadcast(op, doc_id, state, room).await,
    }
}

async fn persist_and_broadcast(op: CrdtOp, doc_id: &str, state: &AppState, room: &Room) {
    let seq = state.next_op_seq();
    if let Err(e) = db::append_op(&state.db, doc_id, seq, &op).await {
        error!("db write error: {e}");
        return;
    }
    let _ = room.tx.send(json(&ServerMsg::Op { op: &op }));
}
