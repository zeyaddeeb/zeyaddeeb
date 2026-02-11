use ::robot::{camera, robot, ui};
use avian3d::prelude::*;
use bevy::prelude::*;

fn should_reset(training: Option<Res<robot::TrainingState>>) -> bool {
    training.map(|t| t.needs_reset).unwrap_or(false)
}

fn main() {
    println!("=== Basketball Robot Training ===");
    App::new()
        .add_plugins((DefaultPlugins, PhysicsPlugins::default()))
        .insert_resource(SubstepCount(24))
        .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
        .add_systems(
            Startup,
            (
                camera::spawn_camera,
                robot::setup,
                robot::start_zenoh,
                ui::setup_ui,
            ),
        )
        .add_systems(
            Update,
            (
                camera::orbit_camera,
                robot::reset_robot_positions.run_if(should_reset),
                ui::update_stats_ui,
            ),
        )
        .add_systems(FixedUpdate, robot::training_loop)
        .run();
}
