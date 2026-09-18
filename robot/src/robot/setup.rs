use super::builder::spawn_robot;
use super::components::*;
use super::constants::*;
#[cfg(feature = "native")]
use super::episode::held_ball_position;
use super::reset::get_initial_poses;
#[allow(unused_imports)]
use super::resources::*;

#[cfg(feature = "native")]
use crate::rl::SacAsyncTrainer;
use avian3d::prelude::*;
use bevy::prelude::*;

#[cfg(feature = "wasm")]
fn wasm_ws_url() -> String {
    let Some(window) = web_sys::window() else {
        return "ws://localhost:9001".to_string();
    };
    let location = window.location();
    let protocol = location
        .protocol()
        .ok()
        .unwrap_or_else(|| "http:".to_string());
    let scheme = if protocol == "https:" { "wss" } else { "ws" };
    let host = location
        .hostname()
        .ok()
        .unwrap_or_else(|| "localhost".to_string());
    let _port = location.port().ok().unwrap_or_default();
    if host == "localhost" || host == "127.0.0.1" {
        format!("{}://{}:{}", scheme, host, "9001")
    } else {
        format!("{}://ws.robot.zeyaddeeb.com", scheme)
    }
}

pub fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    #[cfg(feature = "native")] shared_trainer: Option<Res<SharedTrainer>>,
) {
    commands.spawn((
        DirectionalLight {
            illuminance: 15000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -0.8, 0.4, 0.0)),
    ));
    commands.spawn(AmbientLight {
        color: Color::WHITE,
        brightness: 800.0,
        affects_lightmapped_meshes: true,
    });

    let court_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.76, 0.60, 0.42),
        perceptual_roughness: 0.8,
        ..default()
    });

    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(20.0, 14.0))),
        MeshMaterial3d(court_mat),
        RigidBody::Static,
        Collider::cuboid(20.0, 0.002, 14.0),
        CollisionMargin(0.0),
        CollisionLayers::new(GameLayer::Ground, [GameLayer::Robot, GameLayer::Ball]),
        Friction::new(0.9).with_combine_rule(CoefficientCombine::Max),
        Restitution::new(0.1).with_combine_rule(CoefficientCombine::Min),
    ));

    let robot_entities = spawn_robot(&mut commands, &mut meshes, &mut materials);

    let poses = get_initial_poses();
    let torso_pos = poses.torso.position;
    let ball_start = poses.ball_position();

    let ball_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.85, 0.45, 0.15),
        perceptual_roughness: 0.6,
        ..default()
    });

    let ball = commands
        .spawn((
            Basketball,
            Mesh3d(meshes.add(Sphere::new(BALL_RADIUS))),
            MeshMaterial3d(ball_mat),
            Transform::from_translation(ball_start),
            RigidBody::Dynamic,
            SweptCcd {
                linear_threshold: 0.0,
                angular_threshold: 0.0,
                ..default()
            },
            Collider::sphere(BALL_RADIUS),
            ColliderDensity(20.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Ball, [GameLayer::Ground]),
            Restitution::new(0.82),
            AngularDamping(0.3),
            LinearDamping(0.0),
        ))
        .id();

    commands.insert_resource(robot_entities);

    let hoop_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.9, 0.3, 0.1),
        metallic: 0.8,
        ..default()
    });
    commands.spawn((
        Hoop,
        Mesh3d(meshes.add(Torus::new(
            super::episode::RIM_INNER_RADIUS,
            super::episode::RIM_INNER_RADIUS + 0.03,
        ))),
        MeshMaterial3d(hoop_mat),
        Transform::from_translation(HOOP_POS),
    ));

    let backboard_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.9, 0.9, 0.92),
        ..default()
    });
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.05, 1.0, 1.2))),
        MeshMaterial3d(backboard_mat),
        Transform::from_xyz(HOOP_POS.x + 0.25, HOOP_POS.y + 0.3, HOOP_POS.z),
        RigidBody::Static,
        Collider::cuboid(0.12, 1.0, 1.2),
        CollisionMargin(0.0),
    ));

    let pole_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.4, 0.4, 0.45),
        metallic: 0.9,
        ..default()
    });
    commands.spawn((
        Mesh3d(meshes.add(Cylinder::new(0.05, HOOP_POS.y + 0.8))),
        MeshMaterial3d(pole_mat),
        Transform::from_xyz(HOOP_POS.x + 0.3, (HOOP_POS.y + 0.8) / 2.0, HOOP_POS.z),
    ));

    #[cfg(feature = "native")]
    {
        let (sac_trainer, headless) = match shared_trainer {
            Some(shared) => (shared.trainer.clone(), shared.headless),
            None => (std::sync::Arc::new(SacAsyncTrainer::new()), false),
        };
        let progress = sac_trainer.progress();
        commands.insert_resource(TrainingState {
            sac_trainer,
            headless,
            episode: progress.episodes,
            step: 0,
            episode_reward: 0.0,
            episode_reward_ema: 0.0,
            episode_reward_ema_initialized: false,
            best_episode_reward: f32::NEG_INFINITY,
            baskets_made: progress.baskets_made,
            ball_released: false,
            steps_since_release: 0,
            shot_miss_ema: None,
            best_aim_ema: None,
            episode_best_aim: f32::INFINITY,
            phase: if std::env::var("DEMO").is_ok() {
                TrainingPhase::Showcasing
            } else {
                TrainingPhase::Training
            },
            curriculum_stage: CurriculumStage::from_index(progress.curriculum_stage),
            stage_episodes: progress.stage_episodes,
            stage_success_streak: progress.stage_success_streak,
            cooldown: 0,
            needs_reset: false,
            ball_entity: Some(ball),
            use_external_control: false,
            prev_obs: None,
            prev_action: None,

            prev_ball_pos: None,
            prev_torso_pos: Some(torso_pos),
            prev_left_foot_pos: None,
            prev_right_foot_pos: None,
        });
    }

    #[cfg(feature = "wasm")]
    {
        use super::resources::{CurriculumStage, SimulationState};
        use super::wasm_bridge::WsBridge;

        commands.insert_resource(SimulationState {
            episode: 0,
            step: 0,
            episode_reward: 0.0,
            episode_reward_ema: 0.0,
            episode_reward_ema_initialized: false,
            best_episode_reward: f32::NEG_INFINITY,
            baskets_made: 0,
            ball_released: false,
            steps_since_release: 0,
            ball_entity: Some(ball),
            curriculum_stage: CurriculumStage::Standing,
            stage_episodes: 0,
            stage_success_streak: 0,
            cooldown: 0,
            needs_reset: false,
            prev_obs: None,
            prev_action: None,
            last_action: None,
            prev_ball_pos: None,
            prev_torso_pos: Some(torso_pos),
            prev_left_foot_pos: None,
            prev_right_foot_pos: None,
            server_stats: None,
        });

        let ws_url = wasm_ws_url();
        commands.insert_resource(WsBridge::new(&ws_url));
    }
}

#[cfg(feature = "native")]
pub fn respawn_ball(
    mut commands: Commands,
    mut training: ResMut<TrainingState>,
    robot: Option<Res<RobotEntities>>,
    hand_query: Query<&Transform, With<RobotHand>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    if training.ball_entity.is_some() {
        return;
    }

    let Some(_robot) = robot else { return };
    let Ok(hand_tf) = hand_query.single() else {
        return;
    };
    let ball_start = held_ball_position(hand_tf.translation);

    let ball_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.9, 0.5, 0.2),
        ..default()
    });

    let ball = commands
        .spawn((
            Basketball,
            Mesh3d(meshes.add(Sphere::new(BALL_RADIUS))),
            MeshMaterial3d(ball_mat),
            Transform::from_translation(ball_start),
            RigidBody::Dynamic,
            SweptCcd {
                linear_threshold: 0.0,
                angular_threshold: 0.0,
                ..default()
            },
            Collider::sphere(BALL_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Ball, [GameLayer::Ground]),
            Restitution::new(0.7),
            Friction::new(0.6),
        ))
        .id();

    training.ball_entity = Some(ball);
}
