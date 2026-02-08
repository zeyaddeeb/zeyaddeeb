use ::robot::{camera, robot};
use avian3d::prelude::*;
use bevy::prelude::*;

fn main() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Robot Basketball - WASM".into(),
                canvas: Some("#bevy-canvas".into()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: true,
                ..default()
            }),
            ..default()
        }))
        .add_plugins(PhysicsPlugins::default())
        .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
        .add_systems(Startup, (camera::spawn_camera, robot::setup))
        .add_systems(
            Update,
            (
                camera::orbit_camera,
                robot::ws_connection_system,
                robot::draw_gizmos_wasm,
            ),
        )
        .add_systems(FixedUpdate, robot::wasm_simulation_loop)
        .run();
}
