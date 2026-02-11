use super::builder::spawn_robot;
use super::components::*;
use super::constants::*;
use super::resources::*;

#[cfg(feature = "native")]
use crate::rl::{AsyncTrainer, SacAsyncTrainer};
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
) {
    commands.spawn((
        DirectionalLight {
            illuminance: 15000.0,
            shadows_enabled: true,
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

    let torso_pos = Vec3::new(0.0, TORSO_Y, 0.0);
    let right_shoulder = torso_pos + SHOULDER_OFFSET_RIGHT;
    let right_elbow = right_shoulder + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let right_hand_pos = right_elbow + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let left_shoulder = torso_pos + SHOULDER_OFFSET_LEFT;
    let left_elbow = left_shoulder + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let left_hand_pos = left_elbow + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let _hands_mid = (right_hand_pos + left_hand_pos) * 0.5;
    let ball_start = Vec3::new(0.5, 1.5, 0.0);

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
            CollisionLayers::new(GameLayer::Ball, [GameLayer::Ground, GameLayer::Robot]),
            Restitution::new(0.82),
            AngularDamping(0.3),
            LinearDamping(0.2),
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
        Mesh3d(meshes.add(Torus::new(0.20, 0.23))),
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
        let trainer = AsyncTrainer::new();
        let sac_trainer = SacAsyncTrainer::new();
        commands.insert_resource(TrainingState {
            trainer,
            sac_trainer,
            episode: 0,
            step: 0,
            episode_reward: 0.0,
            episode_reward_ema: 0.0,
            episode_reward_ema_initialized: false,
            best_episode_reward: f32::NEG_INFINITY,
            baskets_made: 0,
            ball_released: false,
            phase: if std::env::var("DEMO").is_ok() {
                TrainingPhase::Showcasing
            } else {
                TrainingPhase::Training
            },
            curriculum_stage: CurriculumStage::Standing,
            stage_episodes: 0,
            stage_success_streak: 0,
            cooldown: 0,
            needs_reset: false,
            ball_entity: Some(ball),
            use_external_control: false,
            prev_obs: None,
            prev_action: None,

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
            ball_entity: Some(ball),
            curriculum_stage: CurriculumStage::Standing,
            stage_episodes: 0,
            stage_success_streak: 0,
            cooldown: 0,
            needs_reset: false,
            prev_obs: None,
            prev_action: None,
            prev_torso_pos: Some(torso_pos),
            prev_left_foot_pos: None,
            prev_right_foot_pos: None,
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
    left_hand_query: Query<&Transform, With<RobotLeftHand>>,
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
    let Ok(left_hand_tf) = left_hand_query.single() else {
        return;
    };

    let _hands_mid = (hand_tf.translation + left_hand_tf.translation) * 0.5;
    let ball_start = Vec3::new(0.5, 1.5, 0.0);

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
            CollisionLayers::new(GameLayer::Ball, [GameLayer::Ground, GameLayer::Robot]),
            Restitution::new(0.7),
            Friction::new(0.6),
        ))
        .id();

    training.ball_entity = Some(ball);
}
