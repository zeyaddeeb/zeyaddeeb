use bevy::prelude::*;
use serde::{Deserialize, Serialize};
#[cfg(feature = "native")]
use std::sync::mpsc::Sender;
#[cfg(feature = "native")]
use std::sync::Mutex;
#[cfg(feature = "native")]
use std::time::{Duration, Instant};

#[cfg(feature = "native")]
use crate::rl::{AsyncTrainer, SacAsyncTrainer};

#[cfg(feature = "native")]
pub const CHECKPOINT_INTERVAL: Duration = Duration::from_secs(60);

#[derive(PartialEq, Clone, Copy, Debug)]
pub enum TrainingPhase {
    Training,
    Showcasing,
}

#[cfg(feature = "native")]
#[derive(Resource)]
pub struct CheckpointTimer {
    pub last_save: Instant,
}

#[cfg(feature = "native")]
impl Default for CheckpointTimer {
    fn default() -> Self {
        Self {
            last_save: Instant::now(),
        }
    }
}

#[derive(Resource)]
#[allow(dead_code)]
pub struct RobotEntities {
    pub torso: Entity,
    pub upper_arm: Entity,
    pub forearm: Entity,
    pub hand: Entity,
    pub left_hand: Entity,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct RewardScales {
    pub stand: f32,
    pub walk: f32,
    pub throw: f32,
    pub energy: f32,
    pub slip: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Skill {
    Stand,
    Walk,
    Throw,
}

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub struct SkillPolicy {
    pub weights: [f32; 3],
    pub baseline: f32,
    pub temperature: f32,
    pub alpha: f32,
    pub last_probs: [f32; 3],
    pub last_skill: Option<Skill>,
}

impl Default for SkillPolicy {
    fn default() -> Self {
        Self {
            weights: [0.4, 0.3, 0.3],
            baseline: 0.0,
            temperature: 0.7,
            alpha: 0.05,
            last_probs: [1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0],
            last_skill: None,
        }
    }
}

#[cfg(feature = "native")]
#[derive(Resource)]
pub struct TrainingState {
    pub trainer: AsyncTrainer,
    pub sac_trainer: SacAsyncTrainer,
    pub episode: usize,
    pub step: usize,
    pub episode_reward: f32,
    pub episode_reward_ema: f32,
    pub episode_reward_ema_initialized: bool,
    pub ball_released: bool,
    pub phase: TrainingPhase,
    pub cooldown: usize,

    pub use_external_control: bool,

    pub prev_obs: Option<Vec<f32>>,

    pub prev_action: Option<Vec<f32>>,

    pub ball_entity: Option<Entity>,

    pub grip_joints: Vec<Entity>,

    pub reward_scales: RewardScales,

    pub prev_torso_pos: Option<Vec3>,
    pub prev_left_foot_pos: Option<Vec3>,
    pub prev_right_foot_pos: Option<Vec3>,

    pub prev_skill: Option<Skill>,

    pub current_skill: Skill,
    pub skill_step: usize,
    pub skill_reward_accum: f32,
    pub skill_policy: SkillPolicy,
    pub skill_counts: [usize; 3],
}

#[cfg(feature = "wasm")]
#[derive(Resource)]
pub struct SimulationState {
    pub step: usize,
    pub ball_released: bool,
    pub ball_entity: Option<Entity>,
    pub grip_joints: Vec<Entity>,
    pub last_action: Vec<f32>,
    pub needs_reset: bool,
    pub episode_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ObservationMsg {
    pub obs: Vec<f32>,
    pub reward: f32,
    pub done: bool,
    pub step: u64,
    pub ball_released: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActionMsg {
    pub action: Vec<f32>,
    #[serde(default)]
    pub stats: Option<TrainStatsMsg>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct TrainStatsMsg {
    pub buffer_size: usize,
    pub train_steps: usize,
    pub episodes: usize,
    pub avg_reward: f32,
    pub recent_reward: f32,
}

#[cfg(feature = "native")]
#[derive(Resource)]
pub struct ZenohBridge {
    pub obs_tx: Sender<ObservationMsg>,
    pub action_rx: Mutex<std::sync::mpsc::Receiver<ActionMsg>>,
    pub last_action: Vec<f32>,
    pub last_action_at: f32,
}
