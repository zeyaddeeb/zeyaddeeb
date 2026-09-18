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

    let joined = tokio::time::timeout(Duration::from_secs(5), stream.next()).await;
    if !matches!(joined, Ok(Some(Ok(Message::Text(ref text)))) if matches!(serde_json::from_str::<ClientMsg>(text), Ok(ClientMsg::Join)))
    {
        return;
    }
    let Some((room, peer, peers)) = state.join_room(&doc_id).await else {
        return;
    };
    let _guard = PeerGuard {
        room: room.clone(),
        peer,
    };
    let mut rx: broadcast::Receiver<String> = room.tx.subscribe();

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

    let init_json = json(&ServerMsg::Init {
        ops: &ops,
        peer,
        peers,
    });
    if !matches!(
        tokio::time::timeout(
            Duration::from_secs(5),
            sink.send(Message::Text(init_json.into()))
        )
        .await,
        Ok(Ok(()))
    ) {
        return;
    }
    let _ = room.tx.send(json(&ServerMsg::Presence { peers }));

    let mut outbound = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(json) => {
                    if !matches!(
                        tokio::time::timeout(
                            Duration::from_secs(5),
                            sink.send(Message::Text(json.into()))
                        )
                        .await,
                        Ok(Ok(()))
                    ) {
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
    let mut rate = (Instant::now(), 0u32);
    let lifetime = tokio::time::sleep(Duration::from_secs(3600));
    tokio::pin!(lifetime);

    loop {
        tokio::select! {
            _ = &mut lifetime => break,
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if rate.0.elapsed() >= Duration::from_secs(1) { rate = (Instant::now(), 0); }
                        rate.1 += 1;
                        if rate.1 > 120 { break; }
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
    if let CrdtOp::Insert(insert) = &op {
        if insert.value.chars().count() != 1 {
            return;
        }
    }
    let mut count = room.history.lock().await;
    if *count >= 4096 {
        let _ = room.tx.send(json(&ServerMsg::Error {
            message: "Document operation limit reached. Open a new document.".into(),
        }));
        return;
    }
    let seq = state.next_op_seq();
    if let Err(e) = db::append_op(&state.db, doc_id, seq, &op).await {
        error!("db write error: {e}");
        return;
    }
    *count += 1;
    let _ = room.tx.send(json(&ServerMsg::Op { op: &op }));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crdt::{CharId, InsertOp};

    #[tokio::test]
    async fn invalid_or_over_quota_operations_are_not_persisted() {
        let state = AppState::new(db::connect().await.unwrap());
        let (room, _, _) = state.join_room("quota").await.unwrap();
        let insert = |value: &str| {
            CrdtOp::Insert(InsertOp {
                id: CharId { site: 1, clock: 1 },
                parent: None,
                value: value.into(),
            })
        };
        persist_and_broadcast(insert("too long"), "quota", &state, &room).await;
        assert!(db::load_ops(&state.db, "quota").await.unwrap().is_empty());
        persist_and_broadcast(insert("a"), "quota", &state, &room).await;
        assert_eq!(db::load_ops(&state.db, "quota").await.unwrap().len(), 1);
        *room.history.lock().await = 4096;
        persist_and_broadcast(insert("b"), "quota", &state, &room).await;
        assert_eq!(db::load_ops(&state.db, "quota").await.unwrap().len(), 1);
        db::delete_ops(&state.db, "quota").await.unwrap();
        assert!(db::load_ops(&state.db, "quota").await.unwrap().is_empty());
    }
}
