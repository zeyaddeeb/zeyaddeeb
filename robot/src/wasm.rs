use ::robot::{camera, robot};
use avian3d::prelude::*;
use bevy::{audio::PlaybackMode, prelude::*, render::settings::WgpuSettings};

#[derive(Resource)]
struct BackgroundMusic;

fn setup_music(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn((
        AudioPlayer::new(asset_server.load("eye_of_the_tiger.ogg")),
        PlaybackSettings {
            mode: PlaybackMode::Loop,
            volume: bevy::audio::Volume::Linear(0.5),
            ..default()
        },
    ));
}

fn main() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();

    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Robot Basketball - WASM".into(),
                        canvas: Some("#bevy-canvas".into()),
                        fit_canvas_to_parent: true,
                        prevent_default_event_handling: true,
                        ..default()
                    }),
                    ..default()
                })
                .set(bevy::render::RenderPlugin {
                    render_creation: bevy::render::settings::RenderCreation::Automatic(
                        WgpuSettings {
                            backends: Some(bevy::render::settings::Backends::GL),
                            ..default()
                        },
                    ),
                    ..default()
                }),
        )
        .add_plugins(PhysicsPlugins::default())
        .insert_resource(SubstepCount(4))
        .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
        .add_systems(Startup, (camera::spawn_camera, robot::setup, setup_music))
        .add_systems(
            Update,
            (
                camera::orbit_camera,
                robot::ws_connection_system,
                robot::draw_gizmos_wasm,
            ),
        )
        .add_systems(
            FixedUpdate,
            robot::wasm_simulation_loop.run_if(robot::should_run_simulation),
        )
        .add_systems(
            FixedUpdate,
            robot::wasm_reset_system.run_if(robot::should_run_reset),
        )
        .run();
}
