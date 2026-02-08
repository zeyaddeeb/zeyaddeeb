use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::buffer::Transition;
use super::config::BATCH_SIZE;
use super::sac_agent::{SACAgent, SAC_CHECKPOINT_DIR};

#[derive(Clone, Default)]
pub struct TrainStats {
    pub buffer_len: usize,
    pub train_steps_done: usize,
}

pub struct SacAsyncTrainer {
    transition_tx: Sender<Transition>,
    train_requested: Arc<Mutex<usize>>,
    #[allow(dead_code)]
    stats: Arc<Mutex<TrainStats>>,
    _handle: JoinHandle<()>,
    pub agent: Arc<Mutex<SACAgent>>,
}

impl SacAsyncTrainer {
    pub fn new() -> Self {
        let (transition_tx, transition_rx) = channel::<Transition>();
        let train_requested = Arc::new(Mutex::new(0usize));
        let train_requested_clone = Arc::clone(&train_requested);
        let stats = Arc::new(Mutex::new(TrainStats::default()));
        let stats_clone = Arc::clone(&stats);

        let agent = Arc::new(Mutex::new(
            SACAgent::new_or_load(SAC_CHECKPOINT_DIR).expect("Failed to create SAC agent"),
        ));
        let agent_clone = Arc::clone(&agent);

        let handle = thread::spawn(move || {
            training_worker(
                transition_rx,
                train_requested_clone,
                agent_clone,
                stats_clone,
            );
        });

        Self {
            transition_tx,
            train_requested,
            stats,
            _handle: handle,
            agent,
        }
    }

    pub fn add_transition(&self, t: Transition) {
        let _ = self.transition_tx.send(t);
    }

    pub fn request_train_steps(&self, n: usize) {
        if let Ok(mut count) = self.train_requested.try_lock() {
            *count = (*count).saturating_add(n);
        }
    }

    pub fn get_action(&self, obs: &[f32]) -> Vec<f32> {
        if let Ok(mut agent) = self.agent.try_lock() {
            agent.get_action(obs).unwrap_or_else(|_| vec![0.0; 14])
        } else {
            vec![0.0; 14]
        }
    }

    pub fn save_checkpoint(&self) {
        match self.agent.lock() {
            Ok(agent) => {
                if let Err(e) = agent.save_checkpoint(SAC_CHECKPOINT_DIR) {
                    eprintln!("[SAC Checkpoint] Failed to save: {}", e);
                } else {
                    println!("[SAC Checkpoint] Saved to {}", SAC_CHECKPOINT_DIR);
                }
            }
            Err(e) => eprintln!("[SAC Checkpoint] Lock poisoned: {}", e),
        }
    }

    pub fn get_stats(&self) -> TrainStats {
        self.stats.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

fn training_worker(
    transition_rx: Receiver<Transition>,
    train_requested: Arc<Mutex<usize>>,
    agent: Arc<Mutex<SACAgent>>,
    stats: Arc<Mutex<TrainStats>>,
) {
    loop {
        let mut transitions_added = 0;
        loop {
            match transition_rx.try_recv() {
                Ok(t) => {
                    if let Ok(mut agent) = agent.lock() {
                        agent.replay_buffer.push(t);
                        transitions_added += 1;
                    }
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }

        if transitions_added > 0 {
            if let Ok(agent) = agent.try_lock() {
                if let Ok(mut s) = stats.lock() {
                    s.buffer_len = agent.replay_buffer.len();
                }
            }
        }

        let steps_to_train = {
            if let Ok(mut count) = train_requested.try_lock() {
                let n = (*count).min(1);
                *count = count.saturating_sub(n);
                n
            } else {
                0
            }
        };

        if steps_to_train > 0 {
            if let Ok(mut agent) = agent.lock() {
                if agent.replay_buffer.len() >= BATCH_SIZE {
                    if agent.train_step().is_ok() {
                        if let Ok(mut s) = stats.try_lock() {
                            s.train_steps_done += 1;
                        }
                    }
                }
            }
        }

        thread::sleep(Duration::from_micros(100));
    }
}
