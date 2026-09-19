use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Instant;

use super::buffer::Transition;
use super::config::MIN_REPLAY_SIZE;
use super::sac_agent::{SACAgent, TrainingProgress, SAC_CHECKPOINT_DIR};
use super::training_budget::TrainingBudget;

#[derive(Clone, Default)]
pub struct TrainStats {
    pub buffer_len: usize,
    pub train_steps_done: usize,
    pub avg_reward: f32,
    pub recent_reward: f32,
    pub episodes_completed: usize,
    pub curriculum_stage: usize,
}

pub struct SacAsyncTrainer {
    transition_tx: SyncSender<Transition>,
    #[allow(dead_code)]
    train_requested: Arc<Mutex<usize>>,
    train_steps: Arc<AtomicUsize>,
    buffer_len: Arc<AtomicUsize>,
    episodes: AtomicUsize,
    curriculum_stage: AtomicUsize,
    recent_rewards: Mutex<VecDeque<f32>>,
    _handle: JoinHandle<()>,
    pub agent: Arc<Mutex<SACAgent>>,
}

impl Default for SacAsyncTrainer {
    fn default() -> Self {
        Self::new()
    }
}

impl SacAsyncTrainer {
    pub fn new() -> Self {
        Self::start(None)
    }

    pub fn with_budget(budget: TrainingBudget) -> Self {
        Self::start(Some(budget))
    }

    fn start(budget: Option<TrainingBudget>) -> Self {
        let (transition_tx, transition_rx) = sync_channel::<Transition>(256);
        let train_requested = Arc::new(Mutex::new(0usize));
        let train_steps = Arc::new(AtomicUsize::new(0));
        let buffer_len = Arc::new(AtomicUsize::new(0));
        let train_steps_clone = Arc::clone(&train_steps);
        let buffer_len_clone = Arc::clone(&buffer_len);

        let agent = Arc::new(Mutex::new(
            SACAgent::new_or_load(SAC_CHECKPOINT_DIR).expect("Failed to create SAC agent"),
        ));

        let mut progress = TrainingProgress::default();
        if let Ok(a) = agent.lock() {
            buffer_len.store(a.replay_buffer.len(), Ordering::Relaxed);
            progress = a.progress.clone();
            train_steps.store(a.train_steps, Ordering::Relaxed);
        }

        let agent_clone = Arc::clone(&agent);

        let handle = thread::spawn(move || {
            training_worker(
                transition_rx,
                agent_clone,
                train_steps_clone,
                buffer_len_clone,
                budget,
            );
        });

        Self {
            transition_tx,
            train_requested,
            train_steps,
            buffer_len,
            episodes: AtomicUsize::new(progress.episodes),
            curriculum_stage: AtomicUsize::new(progress.curriculum_stage),
            recent_rewards: Mutex::new(VecDeque::new()),
            _handle: handle,
            agent,
        }
    }

    fn is_valid(t: &Transition) -> bool {
        t.state.len() == super::config::OBS_DIM
            && t.next_state.len() == super::config::OBS_DIM
            && t.action.len() == super::config::ACT_DIM
            && t.reward.is_finite()
            && t.reward.abs() <= 10000.0
            && t.state
                .iter()
                .chain(&t.next_state)
                .chain(&t.action)
                .all(|x| x.is_finite() && x.abs() <= 10000.0)
    }

    pub fn add_transition(&self, t: Transition) {
        if Self::is_valid(&t) {
            let _ = self.transition_tx.try_send(t);
        }
    }

    pub fn add_transition_blocking(&self, t: Transition) {
        if Self::is_valid(&t) {
            let _ = self.transition_tx.send(t);
        }
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

    pub fn progress(&self) -> TrainingProgress {
        self.agent.lock().unwrap().progress.clone()
    }

    pub fn set_progress(&self, progress: TrainingProgress) {
        self.curriculum_stage
            .store(progress.curriculum_stage, Ordering::Relaxed);
        self.episodes.store(progress.episodes, Ordering::Relaxed);
        self.agent.lock().unwrap().progress = progress;
    }

    pub fn get_inference_action(&self, obs: &[f32]) -> Vec<f32> {
        let mut agent = self.agent.lock().unwrap();
        let training = agent.is_training;
        agent.is_training = false;
        let result = agent.get_action(obs);
        agent.is_training = training;
        result.unwrap_or_else(|_| vec![0.0; super::config::ACT_DIM])
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

    pub fn needs_random_warmup(&self) -> bool {
        self.train_steps.load(Ordering::Relaxed) == 0
            && self.buffer_len.load(Ordering::Relaxed) < MIN_REPLAY_SIZE
    }

    pub fn record_episode(&self, reward: f32, curriculum_stage: usize) {
        self.episodes.fetch_add(1, Ordering::Relaxed);
        self.curriculum_stage
            .store(curriculum_stage, Ordering::Relaxed);
        let mut recent = self
            .recent_rewards
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        recent.push_back(reward);
        if recent.len() > 100 {
            recent.pop_front();
        }
    }

    pub fn get_stats(&self) -> TrainStats {
        let recent = self
            .recent_rewards
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        TrainStats {
            buffer_len: self.buffer_len.load(Ordering::Relaxed),
            train_steps_done: self.train_steps.load(Ordering::Relaxed),
            avg_reward: recent.iter().sum::<f32>() / recent.len().max(1) as f32,
            recent_reward: recent.iter().rev().take(10).sum::<f32>()
                / recent.len().clamp(1, 10) as f32,
            episodes_completed: self.episodes.load(Ordering::Relaxed),
            curriculum_stage: self.curriculum_stage.load(Ordering::Relaxed),
        }
    }
}

fn training_worker(
    transition_rx: Receiver<Transition>,
    agent: Arc<Mutex<SACAgent>>,
    train_steps: Arc<AtomicUsize>,
    buffer_len_counter: Arc<AtomicUsize>,
    budget: Option<TrainingBudget>,
) {
    println!("[SAC Training Worker] Started");
    let mut last_checkpoint_step = train_steps.load(Ordering::Relaxed);
    let mut training_attempted = false;
    const CHECKPOINT_INTERVAL: usize = 5000;
    const MAX_PENDING_UPDATES: usize = 512;
    const DRAIN_LIMIT: usize = 64;
    let mut pending_updates: usize = 0;

    loop {
        let mut incoming = Vec::new();
        if pending_updates == 0 {
            match transition_rx.recv() {
                Ok(t) => incoming.push(t),
                Err(_) => return,
            }
        }
        // Apply backpressure instead of dropping updates when training falls behind.
        while incoming.len() < DRAIN_LIMIT.min(MAX_PENDING_UPDATES - pending_updates) {
            match transition_rx.try_recv() {
                Ok(t) => incoming.push(t),
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }

        let buffer_len = {
            let Ok(mut agent) = agent.lock() else { return };
            pending_updates += incoming.len();
            for t in incoming {
                agent.replay_buffer.push(t);
            }
            agent.replay_buffer.len()
        };
        buffer_len_counter.store(buffer_len, Ordering::Relaxed);

        if buffer_len < MIN_REPLAY_SIZE {
            pending_updates = 0;
            continue;
        }

        if !training_attempted {
            println!(
                "[SAC] Buffer ready ({} >= {}), starting training...",
                buffer_len, MIN_REPLAY_SIZE
            );
            training_attempted = true;
        }

        let work_started = Instant::now();
        {
            let Ok(mut agent) = agent.lock() else { return };
            match agent.train_step() {
                Ok(()) => {
                    pending_updates -= 1;
                    let steps = train_steps.fetch_add(1, Ordering::Relaxed) + 1;

                    if steps.is_multiple_of(1000) {
                        println!(
                            "[SAC] Train step {} | Buffer: {} | Alpha: {:.4}",
                            steps,
                            buffer_len,
                            agent.get_alpha()
                        );
                    }

                    if steps >= last_checkpoint_step + CHECKPOINT_INTERVAL {
                        last_checkpoint_step = steps;
                        if let Err(e) = agent.save_checkpoint(SAC_CHECKPOINT_DIR) {
                            eprintln!("[SAC] Auto-checkpoint failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[SAC] Train step error: {}", e);
                    pending_updates = 0;
                }
            }
        }
        if let Some(budget) = budget {
            thread::sleep(budget.rest_after(work_started.elapsed()));
        }
    }
}
