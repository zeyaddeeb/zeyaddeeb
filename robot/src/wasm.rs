use ::robot::{camera, robot, ui};
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

fn should_reset(training: Option<Res<robot::SimulationState>>) -> bool {
    training.map(|t| t.needs_reset).unwrap_or(false)
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
        .insert_resource(SubstepCount(20))
        .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
        .add_systems(
            Startup,
            (
                camera::spawn_camera,
                robot::setup,
                setup_music,
                ui::setup_ui,
            ),
        )
        .add_systems(
            Update,
            (
                camera::orbit_camera,
                ui::update_stats_ui,
                robot::ws_connection_system,
                robot::reset_robot_positions.run_if(should_reset),
            ),
        )
        .add_systems(FixedUpdate, robot::wasm_training_loop)
        .run();
}
