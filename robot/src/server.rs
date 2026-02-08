use futures_util::{SinkExt, StreamExt};
use robot::rl::{SacAsyncTrainer, Transition};
use robot::robot::{ActionMsg, ObservationMsg};
use serde_json::json;
use std::env;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let bind_addr = env::var("WS_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:9001".to_string());
    let listener = TcpListener::bind(&bind_addr).await?;
    println!("[WS] Listening on {}", bind_addr);

    let trainer = Arc::new(SacAsyncTrainer::new());

    while let Ok((stream, addr)) = listener.accept().await {
        println!("[WS] Client connected: {}", addr);
        let trainer = Arc::clone(&trainer);
        tokio::spawn(async move {
            if let Err(err) = handle_connection(stream, trainer).await {
                eprintln!("[WS] Connection error: {}", err);
            }
        });
    }

    Ok(())
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    trainer: Arc<SacAsyncTrainer>,
) -> anyhow::Result<()> {
    let mut ws = accept_async(stream).await?;
    let mut last_obs: Option<Vec<f32>> = None;
    let mut last_action: Option<Vec<f32>> = None;

    while let Some(msg) = ws.next().await {
        let msg = msg?;
        if !msg.is_text() {
            continue;
        }
        let text = msg.into_text()?;
        let obs_msg: ObservationMsg = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => {
                let err = json!({"error": "invalid_observation"}).to_string();
                let _ = ws.send(Message::Text(err.into())).await;
                continue;
            }
        };

        if let (Some(prev_obs), Some(prev_action)) = (last_obs.take(), last_action.take()) {
            let transition = Transition {
                state: prev_obs,
                action: prev_action,
                reward: obs_msg.reward,
                next_state: obs_msg.obs.clone(),
                done: obs_msg.done,
            };
            trainer.add_transition(transition);
            trainer.request_train_steps(1);
        }

        let action = trainer.get_action(&obs_msg.obs);
        let action_msg = ActionMsg {
            action: action.clone(),
        };
        let action_text = serde_json::to_string(&action_msg)?;
        ws.send(Message::Text(action_text.into())).await?;

        if obs_msg.done {
            last_obs = None;
            last_action = None;
        } else {
            last_obs = Some(obs_msg.obs);
            last_action = Some(action);
        }
    }

    Ok(())
}
