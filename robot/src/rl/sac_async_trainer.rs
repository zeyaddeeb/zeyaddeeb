use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::buffer::Transition;
use super::config::MIN_REPLAY_SIZE;
use super::sac_agent::{SACAgent, SAC_CHECKPOINT_DIR};

#[derive(Clone, Default)]
pub struct TrainStats {
    pub buffer_len: usize,
    pub train_steps_done: usize,
    pub avg_reward: f32,
    pub avg_q_value: f32,
    pub episodes_completed: usize,
    pub curriculum_stage: usize,
}

pub struct SacAsyncTrainer {
    transition_tx: Sender<Transition>,
    #[allow(dead_code)]
    train_requested: Arc<Mutex<usize>>,
    train_steps: Arc<AtomicUsize>,
    buffer_len: Arc<AtomicUsize>,
    _handle: JoinHandle<()>,
    pub agent: Arc<Mutex<SACAgent>>,
}

impl SacAsyncTrainer {
    pub fn new() -> Self {
        let (transition_tx, transition_rx) = channel::<Transition>();
        let train_requested = Arc::new(Mutex::new(0usize));
        let train_steps = Arc::new(AtomicUsize::new(0));
        let buffer_len = Arc::new(AtomicUsize::new(0));
        let train_steps_clone = Arc::clone(&train_steps);
        let buffer_len_clone = Arc::clone(&buffer_len);

        let agent = Arc::new(Mutex::new(
            SACAgent::new_or_load(SAC_CHECKPOINT_DIR).expect("Failed to create SAC agent"),
        ));

        if let Ok(a) = agent.lock() {
            buffer_len.store(a.replay_buffer.len(), Ordering::Relaxed);
        }

        let agent_clone = Arc::clone(&agent);

        let handle = thread::spawn(move || {
            training_worker(
                transition_rx,
                agent_clone,
                train_steps_clone,
                buffer_len_clone,
            );
        });

        Self {
            transition_tx,
            train_requested,
            train_steps,
            buffer_len,
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
        match self.agent.lock() {
            Ok(mut agent) => agent.get_action(obs).unwrap_or_else(|_| vec![0.0; 14]),
            Err(_e) => {
                vec![0.0; 14]
            }
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
        TrainStats {
            buffer_len: self.buffer_len.load(Ordering::Relaxed),
            train_steps_done: self.train_steps.load(Ordering::Relaxed),
            ..Default::default()
        }
    }
}

fn training_worker(
    transition_rx: Receiver<Transition>,
    agent: Arc<Mutex<SACAgent>>,
    train_steps: Arc<AtomicUsize>,
    buffer_len_counter: Arc<AtomicUsize>,
) {
    println!("[SAC Training Worker] Started");
    let mut last_checkpoint_step = 0usize;
    let mut training_attempted = false;
    const CHECKPOINT_INTERVAL: usize = 1000;
    let mut pending_updates: usize = 0;

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

        pending_updates = pending_updates.saturating_add(transitions_added);

        if transitions_added > 0 {
            if let Ok(agent) = agent.try_lock() {
                buffer_len_counter.store(agent.replay_buffer.len(), Ordering::Relaxed);
            }
        }

        if pending_updates == 0 {
            thread::sleep(Duration::from_millis(5));
            continue;
        }

        if let Ok(mut agent) = agent.try_lock() {
            let buffer_len = agent.replay_buffer.len();
            buffer_len_counter.store(buffer_len, Ordering::Relaxed);

            if buffer_len >= MIN_REPLAY_SIZE {
                if !training_attempted {
                    println!(
                        "[SAC] Buffer ready ({} >= {}), starting training...",
                        buffer_len, MIN_REPLAY_SIZE
                    );
                    training_attempted = true;
                }

                // Do at most `pending_updates` gradient steps, then yield the lock
                let steps_this_batch = pending_updates.min(4);
                for _ in 0..steps_this_batch {
                    match agent.train_step() {
                        Ok(()) => {
                            let steps = train_steps.fetch_add(1, Ordering::Relaxed) + 1;

                            if steps % 100 == 0 {
                                println!("[SAC] Train step {} | Buffer: {}", steps, buffer_len);
                            }

                            if steps >= last_checkpoint_step + CHECKPOINT_INTERVAL {
                                last_checkpoint_step = steps;
                                if let Err(e) = agent.save_checkpoint(SAC_CHECKPOINT_DIR) {
                                    eprintln!("[SAC] Auto-checkpoint failed: {}", e);
                                } else {
                                    println!(
                                        "[SAC] Auto-checkpoint at step {}",
                                        last_checkpoint_step
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[SAC] Train step error: {}", e);
                            break;
                        }
                    }
                }
                pending_updates = pending_updates.saturating_sub(steps_this_batch);
            }
            drop(agent);
        }

        thread::sleep(Duration::from_millis(2));
    }
}
