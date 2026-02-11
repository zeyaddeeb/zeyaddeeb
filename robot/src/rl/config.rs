#[cfg(feature = "native")]
pub const GAMMA: f64 = 0.99;

#[cfg(feature = "native")]
pub const TAU: f64 = 0.005;

#[cfg(feature = "native")]
pub const ACTOR_LR: f64 = 1e-4;

#[cfg(feature = "native")]
pub const CRITIC_LR: f64 = 1e-3;

#[cfg(feature = "native")]
pub const SAC_POLICY_LR: f64 = 3e-4;

#[cfg(feature = "native")]
pub const SAC_Q_LR: f64 = 3e-4;

#[cfg(feature = "native")]
pub const SAC_ALPHA_INIT: f32 = 0.1;

#[cfg(feature = "native")]
pub const SAC_ALPHA_LR: f64 = 3e-4;

#[cfg(feature = "native")]
pub const SAC_TARGET_ENTROPY: f32 = -(ACT_DIM as f32);

#[cfg(feature = "native")]
pub const SAC_LOG_STD_MIN: f32 = -5.0;
#[cfg(feature = "native")]
pub const SAC_LOG_STD_MAX: f32 = 2.5;

#[cfg(feature = "native")]
pub const REWARD_SCALE: f32 = 1.0;

#[cfg(feature = "native")]
pub const HIDDEN_DIM: usize = 256;

#[cfg(feature = "native")]
pub const REPLAY_CAPACITY: usize = 200_000;

#[cfg(feature = "native")]
pub const BATCH_SIZE: usize = 256;

#[cfg(feature = "native")]
pub const MIN_REPLAY_SIZE: usize = 2_000;

#[cfg(feature = "native")]
pub const MAX_EPISODES: usize = 500;

pub const EPISODE_STEPS: usize = 300;

#[cfg(feature = "native")]
pub const TRAINING_ITERS: usize = 50;

pub const JOINT_COUNT: usize = 13;

#[cfg(feature = "native")]
pub const OBS_DIM: usize = JOINT_COUNT * 2 + 9;

pub const ACT_DIM: usize = JOINT_COUNT + 1;
