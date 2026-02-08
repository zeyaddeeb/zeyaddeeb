use ::robot::{camera, robot};
use avian3d::prelude::*;
use bevy::prelude::*;

fn main() {
    println!("=== Basketball Robot Training ===");
    App::new()
        .add_plugins((DefaultPlugins, PhysicsPlugins::default()))
        .insert_resource(SubstepCount(4))
        .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
        .add_systems(
            Startup,
            (camera::spawn_camera, robot::setup, robot::start_zenoh),
        )
        .add_systems(
            Update,
            (
                camera::orbit_camera,
                robot::draw_gizmos,
                robot::auto_reset_training,
                robot::checkpoint_system,
            ),
        )
        .add_systems(
            FixedUpdate,
            (
                robot::respawn_ball,
                robot::reset_robot_positions,
                robot::training_loop,
                robot::showcase_loop,
                robot::gradual_train,
            ),
        )
        .add_systems(
            FixedUpdate,
            robot::ground_correction.after(PhysicsSystems::Writeback),
        )
        .run();
}
