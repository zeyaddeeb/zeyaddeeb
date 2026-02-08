use avian3d::prelude::*;
use bevy::prelude::*;
use std::f32::consts::PI;

#[derive(PhysicsLayer, Default)]
enum GameLayer {
    #[default]
    Ground,
    Robot,
    Ball,
}

use super::components::*;
use super::constants::*;
use super::resources::*;

#[cfg(feature = "native")]
use crate::rl::{AsyncTrainer, SacAsyncTrainer};

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
    let port = location.port().ok().unwrap_or_default();
    if host == "localhost" || host == "127.0.0.1" {
        let ws_port = if port.is_empty() { "9001" } else { &port };
        format!("{}://{}:{}", scheme, host, ws_port)
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
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));

    commands.spawn((
        RigidBody::Static,
        Collider::cuboid(10.0, 0.5, 7.0),
        Transform::from_xyz(0.0, -0.5, 0.0),
        CollisionMargin(0.01),
        Friction::new(1.05),
        Restitution::new(0.01),
        CollisionLayers::new(GameLayer::Ground, [GameLayer::Robot, GameLayer::Ball]),
    ));

    let white_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.92, 0.92, 0.90),
        perceptual_roughness: 0.7,
        ..default()
    });
    let gold_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.82, 0.70, 0.25),
        metallic: 0.85,
        perceptual_roughness: 0.3,
        ..default()
    });
    let dark_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.1, 0.1, 0.12),
        ..default()
    });
    let ball_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.85, 0.45, 0.15),
        perceptual_roughness: 0.6,
        ..default()
    });

    let torso_pos = Vec3::new(0.0, TORSO_Y, 0.0);
    let torso = commands
        .spawn((
            RobotTorso,
            Mesh3d(meshes.add(Cuboid::new(TORSO_SIZE_X, TORSO_HEIGHT, TORSO_SIZE_Z))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(torso_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::cuboid(TORSO_SIZE_X / 2.0, TORSO_HEIGHT / 2.0, TORSO_SIZE_Z / 2.0),
            ColliderDensity(100.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(5.0),
            LinearDamping(2.2),
        ))
        .with_children(|parent| {
            parent.spawn((
                Mesh3d(meshes.add(Cylinder::new(TORSO_RADIUS * 0.45, NECK_HEIGHT))),
                MeshMaterial3d(gold_mat.clone()),
                Transform::from_xyz(0.0, TORSO_HEIGHT / 2.0 + NECK_HEIGHT / 2.0, 0.0),
            ));
            parent.spawn((
                Mesh3d(meshes.add(Sphere::new(HEAD_RADIUS))),
                MeshMaterial3d(gold_mat.clone()),
                Transform::from_xyz(0.0, TORSO_HEIGHT / 2.0 + NECK_HEIGHT + HEAD_RADIUS, 0.0),
            ));

            parent.spawn((
                Mesh3d(meshes.add(Sphere::new(0.04))),
                MeshMaterial3d(dark_mat.clone()),
                Transform::from_xyz(
                    -0.05,
                    TORSO_HEIGHT / 2.0 + NECK_HEIGHT + HEAD_RADIUS * 0.2,
                    0.12,
                ),
            ));
            parent.spawn((
                Mesh3d(meshes.add(Sphere::new(0.04))),
                MeshMaterial3d(dark_mat.clone()),
                Transform::from_xyz(
                    0.05,
                    TORSO_HEIGHT / 2.0 + NECK_HEIGHT + HEAD_RADIUS * 0.2,
                    0.12,
                ),
            ));
        })
        .id();

    let right_shoulder_world = torso_pos + SHOULDER_OFFSET_RIGHT;
    let right_upper_arm_center = right_shoulder_world + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let upper_arm = commands
        .spawn((
            RobotUpperArm,
            Mesh3d(meshes.add(Capsule3d::new(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(right_upper_arm_center)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(UPPER_ARM_LENGTH / 2.0, UPPER_ARM_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new(),
            AngularDamping(3.6),
            LinearDamping(1.2),
        ))
        .id();

    commands.spawn((
        RevoluteJoint::new(torso, upper_arm)
            .with_local_anchor1(SHOULDER_OFFSET_RIGHT)
            .with_local_anchor2(Vec3::new(0.0, -UPPER_ARM_LENGTH / 2.0, 0.0))
            .with_angle_limits(SHOULDER_MIN, SHOULDER_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
        JointDamping {
            linear: 0.0,
            angular: 1.0,
        },
    ));

    let elbow_world = right_shoulder_world + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let forearm_center = elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let forearm = commands
        .spawn((
            RobotForearm,
            Mesh3d(meshes.add(Capsule3d::new(FOREARM_RADIUS, FOREARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(forearm_center)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(FOREARM_LENGTH / 2.0, FOREARM_RADIUS),
            ColliderDensity(60.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new(),
            AngularDamping(3.6),
            LinearDamping(1.2),
        ))
        .id();

    commands.spawn((
        RevoluteJoint::new(upper_arm, forearm)
            .with_local_anchor1(Vec3::new(0.0, UPPER_ARM_LENGTH / 2.0, 0.0))
            .with_local_anchor2(Vec3::new(0.0, -FOREARM_LENGTH / 2.0, 0.0))
            .with_angle_limits(ELBOW_MIN, ELBOW_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
        JointDamping {
            linear: 0.0,
            angular: 0.8,
        },
    ));

    let hand_world = elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let hand = commands
        .spawn((
            RobotHand,
            Mesh3d(meshes.add(Sphere::new(HAND_RADIUS))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(hand_world),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::sphere(HAND_RADIUS),
            ColliderDensity(50.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new(),
            AngularDamping(2.0),
            LinearDamping(1.0),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(forearm, hand)
            .with_local_anchor1(Vec3::new(0.0, FOREARM_LENGTH / 2.0 + HAND_RADIUS, 0.0))
            .with_local_anchor2(Vec3::ZERO)
            .with_angle_limits(WRIST_MIN, WRIST_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let left_shoulder_world = torso_pos + SHOULDER_OFFSET_LEFT;
    let left_upper_arm_center = left_shoulder_world + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let left_upper_arm = commands
        .spawn((
            RobotLeftUpperArm,
            Mesh3d(meshes.add(Capsule3d::new(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_upper_arm_center)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(UPPER_ARM_LENGTH / 2.0, UPPER_ARM_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(2.0),
            LinearDamping(0.5),
        ))
        .id();

    commands.spawn((
        RevoluteJoint::new(torso, left_upper_arm)
            .with_local_anchor1(SHOULDER_OFFSET_LEFT)
            .with_local_anchor2(Vec3::new(0.0, -UPPER_ARM_LENGTH / 2.0, 0.0))
            .with_angle_limits(LEFT_SHOULDER_MIN, LEFT_SHOULDER_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
        JointDamping {
            linear: 0.0,
            angular: 1.0,
        },
    ));

    let left_elbow_world = left_shoulder_world + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let left_forearm_center = left_elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let left_forearm = commands
        .spawn((
            RobotLeftForearm,
            Mesh3d(meshes.add(Capsule3d::new(FOREARM_RADIUS, FOREARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_forearm_center)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(FOREARM_LENGTH / 2.0, FOREARM_RADIUS),
            ColliderDensity(60.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(2.0),
            LinearDamping(0.5),
        ))
        .id();

    commands.spawn((
        RevoluteJoint::new(left_upper_arm, left_forearm)
            .with_local_anchor1(Vec3::new(0.0, UPPER_ARM_LENGTH / 2.0, 0.0))
            .with_local_anchor2(Vec3::new(0.0, -FOREARM_LENGTH / 2.0, 0.0))
            .with_angle_limits(ELBOW_MIN, LEFT_ELBOW_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
        JointDamping {
            linear: 0.0,
            angular: 0.8,
        },
    ));

    let left_hand_world = left_elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let left_hand = commands
        .spawn((
            RobotLeftHand,
            Mesh3d(meshes.add(Sphere::new(HAND_RADIUS))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_hand_world),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::sphere(HAND_RADIUS),
            ColliderDensity(50.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(1.2),
            LinearDamping(0.6),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(left_forearm, left_hand)
            .with_local_anchor1(Vec3::new(0.0, FOREARM_LENGTH / 2.0 + HAND_RADIUS, 0.0))
            .with_local_anchor2(Vec3::ZERO)
            .with_angle_limits(LEFT_WRIST_MIN, LEFT_WRIST_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let left_hip_world = torso_pos + HIP_OFFSET_LEFT;
    let right_hip_world = torso_pos + HIP_OFFSET_RIGHT;

    let left_thigh = commands
        .spawn((
            RobotLeftThigh,
            Mesh3d(meshes.add(Capsule3d::new(THIGH_RADIUS, THIGH_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_hip_world + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(THIGH_LENGTH / 2.0, THIGH_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(3.4),
            LinearDamping(1.0),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(torso, left_thigh)
            .with_local_anchor1(HIP_OFFSET_LEFT)
            .with_local_anchor2(Vec3::new(0.0, THIGH_LENGTH / 2.0, 0.0))
            .with_angle_limits(HIP_MIN, HIP_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let left_shin = commands
        .spawn((
            RobotLeftShin,
            Mesh3d(meshes.add(Capsule3d::new(SHIN_RADIUS, SHIN_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(
                left_hip_world + Vec3::new(0.0, -THIGH_LENGTH - SHIN_LENGTH / 2.0, 0.0),
            ),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(SHIN_LENGTH / 2.0, SHIN_RADIUS),
            ColliderDensity(450.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(3.0),
            LinearDamping(1.0),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(left_thigh, left_shin)
            .with_local_anchor1(Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0))
            .with_local_anchor2(Vec3::new(0.0, SHIN_LENGTH / 2.0, 0.0))
            .with_angle_limits(KNEE_MIN, KNEE_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let left_foot = commands
        .spawn((
            RobotLeftFoot,
            Mesh3d(meshes.add(Cuboid::new(FOOT_SIZE_X, FOOT_SIZE_Y, FOOT_SIZE_Z))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(
                left_hip_world
                    + Vec3::new(
                        FOOT_FORWARD_OFFSET,
                        -THIGH_LENGTH - SHIN_LENGTH - FOOT_SIZE_Y / 2.0,
                        0.0,
                    ),
            ),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::cuboid(FOOT_SIZE_X / 2.0, FOOT_SIZE_Y / 2.0, FOOT_SIZE_Z / 2.0),
            ColliderDensity(50.0),
            (
                CollisionMargin(0.02),
                SpeculativeMargin(0.05),
                CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
                LockedAxes::new().lock_rotation_x().lock_rotation_y(),
                Friction::new(1.5),
                SweptCcd::default(),
                AngularDamping(2.6),
                LinearDamping(1.0),
            ),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(left_shin, left_foot)
            .with_local_anchor1(Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0))
            .with_local_anchor2(Vec3::new(-FOOT_FORWARD_OFFSET, 0.0, 0.0))
            .with_angle_limits(ANKLE_MIN, ANKLE_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let right_thigh = commands
        .spawn((
            RobotRightThigh,
            Mesh3d(meshes.add(Capsule3d::new(THIGH_RADIUS, THIGH_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(right_hip_world + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(THIGH_LENGTH / 2.0, THIGH_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(3.4),
            LinearDamping(1.0),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(torso, right_thigh)
            .with_local_anchor1(HIP_OFFSET_RIGHT)
            .with_local_anchor2(Vec3::new(0.0, THIGH_LENGTH / 2.0, 0.0))
            .with_angle_limits(HIP_MIN, HIP_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let right_shin = commands
        .spawn((
            RobotRightShin,
            Mesh3d(meshes.add(Capsule3d::new(SHIN_RADIUS, SHIN_LENGTH))),
            MeshMaterial3d(white_mat.clone()),
            Transform::from_translation(
                right_hip_world + Vec3::new(0.0, -THIGH_LENGTH - SHIN_LENGTH / 2.0, 0.0),
            ),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(SHIN_LENGTH / 2.0, SHIN_RADIUS),
            ColliderDensity(450.0),
            CollisionMargin(0.02),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(3.0),
            LinearDamping(1.0),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(right_thigh, right_shin)
            .with_local_anchor1(Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0))
            .with_local_anchor2(Vec3::new(0.0, SHIN_LENGTH / 2.0, 0.0))
            .with_angle_limits(KNEE_MIN, KNEE_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let right_foot = commands
        .spawn((
            RobotRightFoot,
            Mesh3d(meshes.add(Cuboid::new(FOOT_SIZE_X, FOOT_SIZE_Y, FOOT_SIZE_Z))),
            MeshMaterial3d(white_mat.clone()),
            Transform::from_translation(
                right_hip_world
                    + Vec3::new(
                        FOOT_FORWARD_OFFSET,
                        -THIGH_LENGTH - SHIN_LENGTH - FOOT_SIZE_Y / 2.0,
                        0.0,
                    ),
            ),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::cuboid(FOOT_SIZE_X / 2.0, FOOT_SIZE_Y / 2.0, FOOT_SIZE_Z / 2.0),
            ColliderDensity(50.0),
            (
                CollisionMargin(0.02),
                SpeculativeMargin(0.05),
                CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
                LockedAxes::new().lock_rotation_x().lock_rotation_y(),
                Friction::new(1.5),
                SweptCcd::default(),
                AngularDamping(2.6),
                LinearDamping(1.0),
            ),
        ))
        .id();

    commands.spawn(
        RevoluteJoint::new(right_shin, right_foot)
            .with_local_anchor1(Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0))
            .with_local_anchor2(Vec3::new(-FOOT_FORWARD_OFFSET, 0.0, 0.0))
            .with_angle_limits(ANKLE_MIN, ANKLE_MAX)
            .with_point_compliance(0.00001)
            .with_align_compliance(0.00001)
            .with_limit_compliance(0.00001),
    );

    let hands_mid = (hand_world + left_hand_world) * 0.5;
    let ball_start = hands_mid + Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0);
    let ball = commands
        .spawn((
            Basketball,
            Mesh3d(meshes.add(Sphere::new(BALL_RADIUS))),
            MeshMaterial3d(ball_mat),
            Transform::from_translation(ball_start),
            RigidBody::Dynamic,
            Collider::sphere(BALL_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            SpeculativeMargin(0.05),
            CollisionLayers::new(GameLayer::Ball, [GameLayer::Ground, GameLayer::Robot]),
            LockedAxes::new(),
            Restitution::new(0.7),
            Friction::new(0.6),
            SweptCcd::default(),
        ))
        .id();

    let right_grip = commands
        .spawn((
            BallGrip,
            FixedJoint::new(hand, ball)
                .with_local_anchor1(Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0))
                .with_local_anchor2(Vec3::ZERO),
        ))
        .id();

    let left_grip = commands
        .spawn((
            BallGrip,
            FixedJoint::new(left_hand, ball)
                .with_local_anchor1(Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0))
                .with_local_anchor2(Vec3::ZERO),
        ))
        .id();

    commands.insert_resource(RobotEntities {
        torso,
        upper_arm,
        forearm,
        hand,
        left_hand,
    });

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
            ball_released: false,
            phase: TrainingPhase::Training,
            cooldown: 60,
            use_external_control: true,
            prev_obs: None,
            prev_action: None,
            ball_entity: Some(ball),
            grip_joints: vec![right_grip, left_grip],
            reward_scales: RewardScales {
                stand: 1.0,
                walk: 1.0,
                throw: 1.0,
                energy: 1.0,
                slip: 1.0,
            },
            prev_torso_pos: None,
            prev_left_foot_pos: None,
            prev_right_foot_pos: None,
            prev_skill: None,
            current_skill: Skill::Stand,
            skill_step: 0,
            skill_reward_accum: 0.0,
            skill_policy: SkillPolicy::default(),
            skill_counts: [0, 0, 0],
        });

        commands.insert_resource(CheckpointTimer::default());
    }

    #[cfg(feature = "wasm")]
    {
        use super::resources::SimulationState;
        use super::wasm_bridge::WsBridge;
        use crate::rl::ACT_DIM;

        commands.insert_resource(SimulationState {
            step: 0,
            ball_released: false,
            ball_entity: Some(ball),
            grip_joints: vec![right_grip, left_grip],
            last_action: vec![0.0; ACT_DIM],
            needs_reset: false,
            episode_count: 0,
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

    let Some(robot) = robot else { return };
    let Ok(hand_tf) = hand_query.single() else {
        return;
    };
    let Ok(left_hand_tf) = left_hand_query.single() else {
        return;
    };

    let hands_mid = (hand_tf.translation + left_hand_tf.translation) * 0.5;
    let ball_start = hands_mid + Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0);

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
            Collider::sphere(BALL_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.02),
            SpeculativeMargin(0.05),
            CollisionLayers::new(GameLayer::Ball, [GameLayer::Ground, GameLayer::Robot]),
            LockedAxes::new(),
            Restitution::new(0.7),
            Friction::new(0.6),
            SweptCcd::default(),
        ))
        .id();

    let right_grip = commands
        .spawn((
            BallGrip,
            FixedJoint::new(robot.hand, ball)
                .with_local_anchor1(Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0))
                .with_local_anchor2(Vec3::ZERO),
        ))
        .id();

    let left_grip = commands
        .spawn((
            BallGrip,
            FixedJoint::new(robot.left_hand, ball)
                .with_local_anchor1(Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0))
                .with_local_anchor2(Vec3::ZERO),
        ))
        .id();

    training.ball_entity = Some(ball);
    training.grip_joints = vec![right_grip, left_grip];
}
