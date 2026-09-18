use futures_util::{SinkExt, StreamExt};
use robot::rl::{SacAsyncTrainer, Transition};
use robot::robot::{ActionMsg, ObservationMsg, TrainStatsMsg};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    io::AsyncWriteExt,
    net::{TcpListener, TcpStream},
    sync::Semaphore,
    time::timeout,
};
use tokio_tungstenite::{
    accept_hdr_async_with_config,
    tungstenite::{
        handshake::server::{ErrorResponse, Request, Response},
        protocol::WebSocketConfig,
        Message,
    },
};

use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

fn can_train(request: &Request, credential: Option<&str>) -> Result<bool, ErrorResponse> {
    let Some(header) = request.headers().get("authorization") else {
        return Ok(false);
    };
    let supplied = header.to_str().ok().and_then(|v| v.strip_prefix("Bearer "));
    if let (Some(expected), Some(supplied)) = (credential, supplied) {
        if bool::from(Sha256::digest(expected).ct_eq(&Sha256::digest(supplied))) {
            return Ok(true);
        }
    }
    Err(Response::builder()
        .status(401)
        .body(Some("unauthorized".into()))
        .unwrap())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let addr = std::env::var("WS_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:9001".into());
    let listener = TcpListener::bind(addr).await?;
    let connections = Arc::new(Semaphore::new(32));
    let credential = std::env::var("ROBOT_TRAINING_TOKEN").ok();
    anyhow::ensure!(
        credential.as_ref().is_none_or(|token| token.len() >= 32),
        "ROBOT_TRAINING_TOKEN must be at least 32 characters"
    );
    let credential = Arc::new(credential);
    let trainer = Arc::new(SacAsyncTrainer::new());
    if std::env::var("SELF_TRAIN").map_or(true, |v| v != "0") {
        let max_steps_per_second = std::env::var("SELF_TRAIN_HZ")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(64.0);
        let trainer = trainer.clone();
        std::thread::spawn(move || {
            robot::robot::run_headless(trainer, Some(max_steps_per_second));
        });
    }
    loop {
        let (stream, _) = listener.accept().await?;
        let Ok(permit) = connections.clone().try_acquire_owned() else {
            continue;
        };
        let trainer = trainer.clone();
        let credential = credential.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let _ = timeout(
                Duration::from_secs(1800),
                handle_connection(stream, trainer, credential),
            )
            .await;
        });
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    trainer: Arc<SacAsyncTrainer>,
    credential: Arc<Option<String>>,
) -> anyhow::Result<()> {
    let mut peek = [0u8; 512];
    let n = timeout(Duration::from_secs(5), stream.peek(&mut peek)).await??;
    let request = String::from_utf8_lossy(&peek[..n]);
    if request.starts_with("GET /health") || request.starts_with("HEAD /health") {
        timeout(
            Duration::from_secs(5),
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"),
        )
        .await??;
        return Ok(());
    }
    let mut trusted = false;
    let config = WebSocketConfig::default()
        .max_message_size(Some(8192))
        .max_frame_size(Some(8192));
    let mut ws = timeout(
        Duration::from_secs(5),
        accept_hdr_async_with_config(
            stream,
            |request: &Request, response: Response| {
                trusted = can_train(request, credential.as_deref())?;
                Ok(response)
            },
            Some(config),
        ),
    )
    .await??;

    let mut previous: Option<(Vec<f32>, Vec<f32>)> = None;
    let mut total_reward = 0.0f32;
    let mut rate = (Instant::now(), 0u32);
    while let Some(message) = timeout(Duration::from_secs(60), ws.next()).await? {
        let message = message?;
        if !message.is_text() {
            continue;
        }
        if rate.0.elapsed() >= Duration::from_secs(1) {
            rate = (Instant::now(), 0);
        }
        rate.1 += 1;
        if rate.1 > 120 {
            break;
        }
        let observation: ObservationMsg = serde_json::from_str(&message.into_text()?)?;
        anyhow::ensure!(
            observation.obs.len() == robot::rl::OBS_DIM
                && observation
                    .obs
                    .iter()
                    .all(|x| x.is_finite() && x.abs() <= 10000.0)
                && observation.reward.is_finite()
                && observation.reward.abs() <= 10000.0,
            "invalid observation"
        );
        if trusted {
            total_reward = (total_reward + observation.reward).clamp(-1e9, 1e9);
            if observation.done {
                trainer.record_episode(total_reward, trainer.get_stats().curriculum_stage);
                total_reward = 0.0;
            }
            if let Some((state, action)) = previous.take() {
                trainer.add_transition(Transition {
                    state,
                    action,
                    reward: observation.reward,
                    next_state: observation.obs.clone(),
                    done: observation.done && !observation.truncated,
                });
            }
        }
        let worker = trainer.clone();
        let obs = observation.obs.clone();
        let action = tokio::task::spawn_blocking(move || worker.get_action(&obs)).await?;
        let stats = trainer.get_stats();
        let response = ActionMsg {
            action: action.clone(),
            stats: Some(TrainStatsMsg {
                buffer_size: stats.buffer_len,
                train_steps: stats.train_steps_done,
                episodes: stats.episodes_completed,
                avg_reward: stats.avg_reward,
                recent_reward: stats.recent_reward,
                curriculum_stage: Some(stats.curriculum_stage),
            }),
        };
        timeout(
            Duration::from_secs(5),
            ws.send(Message::Text(serde_json::to_string(&response)?.into())),
        )
        .await??;
        if trusted && !observation.done {
            previous = Some((observation.obs, action));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_authenticated_connections_can_train() {
        let token = "a-test-training-credential-at-least-32-bytes";
        let public = Request::builder().body(()).unwrap();
        assert!(!can_train(&public, Some(token)).unwrap());
        let authenticated = Request::builder()
            .header("authorization", format!("Bearer {token}"))
            .body(())
            .unwrap();
        assert!(can_train(&authenticated, Some(token)).unwrap());
        assert!(can_train(&authenticated, None).is_err());
        assert!(can_train(
            &authenticated,
            Some("different-training-credential-32-bytes")
        )
        .is_err());
    }
}
