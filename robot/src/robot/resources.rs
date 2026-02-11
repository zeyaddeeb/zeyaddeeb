use bevy::prelude::*;
use serde::{Deserialize, Serialize};
#[cfg(feature = "native")]
use std::sync::mpsc::Sender;
#[cfg(feature = "native")]
use std::sync::Mutex;

#[cfg(feature = "native")]
use crate::rl::{AsyncTrainer, SacAsyncTrainer};

#[cfg(feature = "native")]
#[derive(PartialEq, Clone, Copy, Debug)]
pub enum TrainingPhase {
    Training,
    Showcasing,
}

#[derive(PartialEq, Clone, Copy, Debug, Default)]
pub enum CurriculumStage {
    #[default]
    Standing,
    ApproachBall,
    Shooting,
}

impl CurriculumStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            CurriculumStage::Standing => "Standing",
            CurriculumStage::ApproachBall => "Approach Ball",
            CurriculumStage::Shooting => "Shooting",
        }
    }
}

#[derive(Resource)]
pub struct RobotEntities {
    pub torso: Entity,
    pub right_shoulder: Entity,
    pub right_upper_arm: Entity,
    pub right_elbow: Entity,
    pub right_forearm: Entity,
    pub right_wrist: Entity,
    pub right_hand: Entity,
    pub left_shoulder: Entity,
    pub left_upper_arm: Entity,
    pub left_elbow: Entity,
    pub left_forearm: Entity,
    pub left_wrist: Entity,
    pub left_hand: Entity,
    pub right_hip: Entity,
    pub right_thigh: Entity,
    pub right_knee: Entity,
    pub right_shin: Entity,
    pub right_ankle: Entity,
    pub right_foot: Entity,
    pub left_hip: Entity,
    pub left_thigh: Entity,
    pub left_knee: Entity,
    pub left_shin: Entity,
    pub left_ankle: Entity,
    pub left_foot: Entity,
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
    pub best_episode_reward: f32,
    pub baskets_made: usize,
    pub ball_released: bool,
    pub phase: TrainingPhase,
    pub curriculum_stage: CurriculumStage,
    pub stage_episodes: usize,
    pub stage_success_streak: usize,
    pub cooldown: usize,
    pub needs_reset: bool,
    pub use_external_control: bool,
    pub prev_obs: Option<Vec<f32>>,
    pub prev_action: Option<Vec<f32>>,
    pub ball_entity: Option<Entity>,
    pub prev_torso_pos: Option<Vec3>,
    pub prev_left_foot_pos: Option<Vec3>,
    pub prev_right_foot_pos: Option<Vec3>,
}

#[cfg(feature = "wasm")]
#[derive(Resource)]
pub struct SimulationState {
    pub episode: usize,
    pub step: usize,
    pub episode_reward: f32,
    pub episode_reward_ema: f32,
    pub episode_reward_ema_initialized: bool,
    pub best_episode_reward: f32,
    pub baskets_made: usize,
    pub ball_released: bool,
    pub ball_entity: Option<Entity>,
    pub curriculum_stage: CurriculumStage,
    pub stage_episodes: usize,
    pub stage_success_streak: usize,
    pub cooldown: usize,
    pub needs_reset: bool,
    pub prev_obs: Option<Vec<f32>>,
    pub prev_action: Option<Vec<f32>>,
    pub prev_torso_pos: Option<Vec3>,
    pub prev_left_foot_pos: Option<Vec3>,
    pub prev_right_foot_pos: Option<Vec3>,
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
