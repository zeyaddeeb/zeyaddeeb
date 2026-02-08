use futures_util::{SinkExt, StreamExt};
use robot::rl::{SacAsyncTrainer, Transition};
use robot::robot::{ActionMsg, ObservationMsg, TrainStatsMsg};
use serde_json::json;
use std::env;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

/// Track reward statistics across episodes
struct RewardTracker {
    episode_rewards: Vec<f32>,
    current_episode_reward: f32,
    episodes_completed: AtomicUsize,
}

impl RewardTracker {
    fn new() -> Self {
        Self {
            episode_rewards: Vec::new(),
            current_episode_reward: 0.0,
            episodes_completed: AtomicUsize::new(0),
        }
    }

    fn add_reward(&mut self, reward: f32) {
        self.current_episode_reward += reward;
    }

    fn end_episode(&mut self) {
        self.episode_rewards.push(self.current_episode_reward);
        self.episodes_completed.fetch_add(1, Ordering::Relaxed);
        self.current_episode_reward = 0.0;
    }

    fn get_stats(&self) -> (usize, f32, f32) {
        let count = self.episode_rewards.len();
        if count == 0 {
            return (0, 0.0, 0.0);
        }
        let avg = self.episode_rewards.iter().sum::<f32>() / count as f32;
        let recent_count = count.min(10);
        let recent_avg: f32 = self.episode_rewards[count - recent_count..]
            .iter()
            .sum::<f32>()
            / recent_count as f32;
        (count, avg, recent_avg)
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let bind_addr = env::var("WS_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:9001".to_string());
    let listener = TcpListener::bind(&bind_addr).await?;
    println!("[WS] Listening on {}", bind_addr);
    println!("[WS] Training runs continuously in the background");

    let trainer = Arc::new(SacAsyncTrainer::new());
    let reward_tracker = Arc::new(Mutex::new(RewardTracker::new()));

    {
        let trainer = Arc::clone(&trainer);
        let reward_tracker = Arc::clone(&reward_tracker);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
            loop {
                interval.tick().await;
                let stats = trainer.get_stats();
                let (ep_count, avg_reward, recent_avg) = reward_tracker.lock().await.get_stats();
                println!(
                    "[SAC] Buffer: {} | Steps: {} | Episodes: {} | Avg reward: {:.2} | Recent(10): {:.2}",
                    stats.buffer_len, stats.train_steps_done, ep_count, avg_reward, recent_avg
                );
            }
        });
    }

    while let Ok((stream, addr)) = listener.accept().await {
        println!("[WS] Client connected: {}", addr);
        let trainer = Arc::clone(&trainer);
        let reward_tracker = Arc::clone(&reward_tracker);
        tokio::spawn(async move {
            if let Err(err) = handle_connection(stream, trainer, reward_tracker).await {
                eprintln!("[WS] Connection error: {}", err);
            }
        });
    }

    Ok(())
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    trainer: Arc<SacAsyncTrainer>,
    reward_tracker: Arc<Mutex<RewardTracker>>,
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

        // Track reward for statistics
        {
            let mut tracker = reward_tracker.lock().await;
            tracker.add_reward(obs_msg.reward);
            if obs_msg.done {
                tracker.end_episode();
            }
        }

        if let (Some(prev_obs), Some(prev_action)) = (last_obs.take(), last_action.take()) {
            let transition = Transition {
                state: prev_obs,
                action: prev_action,
                reward: obs_msg.reward,
                next_state: obs_msg.obs.clone(),
                done: obs_msg.done,
            };
            trainer.add_transition(transition);
        }

        let action = trainer.get_action(&obs_msg.obs);

        let sac_stats = trainer.get_stats();
        let (ep_count, avg_reward, recent_avg) = reward_tracker.lock().await.get_stats();
        let stats_msg = TrainStatsMsg {
            buffer_size: sac_stats.buffer_len,
            train_steps: sac_stats.train_steps_done,
            episodes: ep_count,
            avg_reward,
            recent_reward: recent_avg,
        };

        let action_msg = ActionMsg {
            action: action.clone(),
            stats: Some(stats_msg),
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
