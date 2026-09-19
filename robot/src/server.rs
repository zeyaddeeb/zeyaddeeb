use futures_util::{SinkExt, StreamExt};
use robot::rl::{SacAsyncTrainer, TrainingBudget, Transition};
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

fn parse_setting<T>(name: &str, value: &str, min: T, max: T) -> anyhow::Result<T>
where
    T: std::str::FromStr + PartialOrd + std::fmt::Display,
{
    let parsed = value
        .parse::<T>()
        .map_err(|_| anyhow::anyhow!("invalid {name}: {value}"))?;
    anyhow::ensure!(
        parsed >= min && parsed <= max,
        "{name} must be between {min} and {max}"
    );
    Ok(parsed)
}

fn setting<T>(name: &str, default: &str, min: T, max: T) -> anyhow::Result<T>
where
    T: std::str::FromStr + PartialOrd + std::fmt::Display,
{
    let value = match std::env::var(name) {
        Ok(value) => value,
        Err(std::env::VarError::NotPresent) => default.to_owned(),
        Err(e) => return Err(anyhow::anyhow!("invalid {name}: {e}")),
    };
    parse_setting(name, &value, min, max)
}

#[allow(clippy::result_large_err)]
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
    let train_hz = setting("SAC_TRAIN_HZ", "8", 0.1, 1000.0)?;
    let train_duty = setting("SAC_TRAIN_DUTY_PERCENT", "50", 1u32, 100)?;
    let budget = TrainingBudget::new(train_hz, train_duty)?;
    println!("[SAC] Training budget: {train_hz} updates/s, {train_duty}% duty cycle");
    let trainer = Arc::new(SacAsyncTrainer::with_budget(budget));
    if std::env::var("SELF_TRAIN").map_or(true, |v| v != "0") {
        let max_steps_per_second = setting("SELF_TRAIN_HZ", "16", 0.1, 1000.0)?;
        let substeps = setting("SELF_TRAIN_SUBSTEPS", "12", 1u32, 64)?;
        println!(
            "[SAC] Self-training: {max_steps_per_second} steps/s, {substeps} physics substeps"
        );
        let trainer = trainer.clone();
        std::thread::spawn(move || {
            robot::robot::run_headless_with_substeps(trainer, Some(max_steps_per_second), substeps);
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

#[allow(clippy::result_large_err)]
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
    let mut last_request: Option<(u64, u64, u64, bool)> = None;
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
            observation.protocol_version == robot::rl::ENVIRONMENT_VERSION
                && observation.obs.len() == robot::rl::OBS_DIM
                && observation
                    .obs
                    .iter()
                    .all(|x| x.is_finite() && x.abs() <= 10000.0)
                && observation.reward.is_finite()
                && observation.reward.abs() <= 10000.0,
            "invalid observation"
        );
        if let Some((episode, request_id, step, done)) = last_request {
            anyhow::ensure!(observation.request_id > request_id, "out-of-order request");
            if observation.episode != episode || observation.step != step + 1 || done {
                previous = None;
                total_reward = 0.0;
            }
        }
        last_request = Some((
            observation.episode,
            observation.request_id,
            observation.step,
            observation.done,
        ));
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
        let action = tokio::task::spawn_blocking(move || {
            if trusted {
                worker.get_action(&obs)
            } else {
                worker.get_inference_action(&obs)
            }
        })
        .await?;
        let stats = trainer.get_stats();
        let response = ActionMsg {
            protocol_version: robot::rl::ENVIRONMENT_VERSION,
            episode: observation.episode,
            request_id: observation.request_id,
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
    fn invalid_rates_cannot_enable_an_unbounded_simulation() {
        for value in ["0", "-1", "NaN", "inf", "1001", "invalid"] {
            assert!(parse_setting("SELF_TRAIN_HZ", value, 0.1, 1000.0).is_err());
        }
        assert_eq!(
            parse_setting("SELF_TRAIN_HZ", "16", 0.1, 1000.0).unwrap(),
            16.0
        );
    }

    #[test]
    fn physics_substeps_must_be_positive_integers_within_bounds() {
        for value in ["0", "-1", "12.5", "65"] {
            assert!(parse_setting("SELF_TRAIN_SUBSTEPS", value, 1u32, 64).is_err());
        }
        for value in ["12", "24"] {
            assert!(parse_setting("SELF_TRAIN_SUBSTEPS", value, 1u32, 64).is_ok());
        }
    }

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
