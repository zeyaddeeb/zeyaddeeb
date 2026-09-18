#[cfg(any(feature = "wasm", test))]
mod action_mailbox;
mod builder;
mod components;
mod constants;
mod episode;
mod observation;
mod reset;
mod resources;
mod setup;
mod state;
mod torque;

#[cfg(all(test, feature = "native"))]
mod learning_check;

#[cfg(feature = "native")]
mod headless;
#[cfg(feature = "native")]
mod training;
#[cfg(feature = "native")]
mod zenoh_bridge;

#[cfg(feature = "wasm")]
mod wasm_bridge;

pub use builder::spawn_robot;
pub use reset::{get_initial_poses, reset_robot_positions, BodyPartPose, RobotPoses};
pub use setup::*;

#[cfg(feature = "native")]
pub use headless::{run_headless, run_headless_with_substeps};
#[cfg(feature = "native")]
pub use training::*;
#[cfg(feature = "native")]
pub use zenoh_bridge::*;

pub use resources::{ActionMsg, ObservationMsg, TrainStatsMsg};

pub use resources::CurriculumStage;

#[cfg(feature = "native")]
pub use resources::{TrainingPhase, TrainingState};

#[cfg(feature = "wasm")]
pub use resources::SimulationState;

#[cfg(feature = "wasm")]
pub use wasm_bridge::*;
