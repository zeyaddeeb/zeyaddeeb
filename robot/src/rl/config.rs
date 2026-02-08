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
pub const SAC_ALPHA: f32 = 0.2;

#[cfg(feature = "native")]
pub const SAC_LOG_STD_MIN: f32 = -5.0;
#[cfg(feature = "native")]
pub const SAC_LOG_STD_MAX: f32 = 2.0;

#[cfg(feature = "native")]
pub const REPLAY_CAPACITY: usize = 50_000;

#[cfg(feature = "native")]
pub const BATCH_SIZE: usize = 64;

#[cfg(feature = "native")]
pub const MAX_EPISODES: usize = 500;

#[cfg(feature = "native")]
pub const EPISODE_STEPS: usize = 120;

#[cfg(feature = "native")]
pub const TRAINING_ITERS: usize = 50;

pub const JOINT_COUNT: usize = 13;

#[cfg(feature = "native")]
pub const OBS_DIM: usize = JOINT_COUNT * 2 + 9;

pub const ACT_DIM: usize = JOINT_COUNT + 1;
