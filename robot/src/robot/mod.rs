mod components;
mod constants;
mod observation;
mod reset;
mod resources;
mod setup;
mod state;

#[cfg(feature = "native")]
mod training;
#[cfg(feature = "native")]
mod zenoh_bridge;

#[cfg(feature = "wasm")]
mod wasm_bridge;

#[cfg(feature = "native")]
pub use reset::reset_robot_positions;
pub use setup::*;

#[cfg(feature = "native")]
pub use training::*;
#[cfg(feature = "native")]
pub use zenoh_bridge::*;

pub use resources::{ActionMsg, ObservationMsg};

#[cfg(feature = "wasm")]
pub use wasm_bridge::*;
