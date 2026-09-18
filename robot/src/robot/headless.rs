use std::sync::Arc;
use std::time::Duration;

use avian3d::prelude::*;
use bevy::app::ScheduleRunnerPlugin;
use bevy::prelude::*;
use bevy::time::TimeUpdateStrategy;

use super::reset::reset_robot_positions;
use super::resources::{SharedTrainer, TrainingState};
use super::setup::setup;
use super::training::training_loop;
use crate::rl::SacAsyncTrainer;

fn should_reset(training: Option<Res<TrainingState>>) -> bool {
    training.map(|t| t.needs_reset).unwrap_or(false)
}

pub fn run_headless(trainer: Arc<SacAsyncTrainer>, max_steps_per_second: Option<f64>) {
    let runner = match max_steps_per_second {
        Some(hz) if hz > 0.0 => ScheduleRunnerPlugin::run_loop(Duration::from_secs_f64(1.0 / hz)),
        _ => ScheduleRunnerPlugin::default(),
    };

    App::new()
        .add_plugins((
            MinimalPlugins.set(runner),
            bevy::log::LogPlugin::default(),
            TransformPlugin,
            AssetPlugin::default(),
            PhysicsPlugins::default(),
        ))
        .init_asset::<Mesh>()
        .init_asset::<StandardMaterial>()
        .insert_resource(SharedTrainer {
            trainer,
            headless: true,
        })
        .insert_resource(TimeUpdateStrategy::FixedTimesteps(1))
        .insert_resource(SubstepCount(24))
        .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
        .add_systems(Startup, setup)
        .add_systems(Update, reset_robot_positions.run_if(should_reset))
        .add_systems(FixedUpdate, training_loop)
        .run();
}
