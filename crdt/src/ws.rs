use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tracing::{error, warn};

use crate::{
    crdt::{ClientMsg, CrdtOp, ServerMsg},
    db,
    state::AppState,
};

pub async fn handle(socket: WebSocket, doc_id: String, state: AppState) {
    let (mut sink, mut stream) = socket.split();

    let joined = loop {
        match stream.next().await {
            Some(Ok(Message::Text(text))) => match serde_json::from_str::<ClientMsg>(&text) {
                Ok(ClientMsg::Join) => break true,
                Ok(_) => {
                    warn!("expected join, got op — ignoring");
                }
                Err(e) => {
                    warn!("bad message before join: {e}");
                }
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
            let msg = serde_json::to_string(&ServerMsg::Error {
                message: "failed to load document".into(),
            })
            .unwrap_or_default();
            let _ = sink.send(Message::Text(msg.into())).await;
            return;
        }
    };

    let init_json = serde_json::to_string(&ServerMsg::Init { ops: &ops }).unwrap_or_default();
    if sink.send(Message::Text(init_json.into())).await.is_err() {
        return;
    }

    let room = state.room_for(&doc_id);
    let mut rx: broadcast::Receiver<String> = room.tx.subscribe();

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

    loop {
        tokio::select! {
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_client_op(&text, &doc_id, &state, &room.tx).await;
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

async fn handle_client_op(
    text: &str,
    doc_id: &str,
    state: &AppState,
    tx: &broadcast::Sender<String>,
) {
    let op: CrdtOp = match serde_json::from_str::<ClientMsg>(text) {
        Ok(ClientMsg::Op { op }) => op,
        Ok(ClientMsg::Join) => return,
        Err(e) => {
            warn!("invalid op from client: {e}");
            return;
        }
    };

    if let Err(e) = db::append_op(&state.db, doc_id, &op).await {
        error!("db write error: {e}");
        return;
    }

    let broadcast_json =
        serde_json::to_string(&ServerMsg::Op { op: &op }).unwrap_or_default();
    let _ = tx.send(broadcast_json);
}
