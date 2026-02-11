use super::components::*;
use super::constants::*;
use super::resources::RobotEntities;
use avian3d::prelude::*;
use bevy::prelude::*;
use std::f32::consts::PI;

pub fn spawn_robot(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
) -> RobotEntities {
    let gold_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.82, 0.70, 0.25),
        metallic: 0.85,
        perceptual_roughness: 0.3,
        ..default()
    });
    let white_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.92, 0.92, 0.90),
        perceptual_roughness: 0.7,
        ..default()
    });
    let dark_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(0.1, 0.1, 0.12),
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
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.3).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            GravityScale(1.5),
            AngularDamping(0.5),
            LinearDamping(0.3),
        ))
        .with_children(|parent| {
            parent.spawn((
                Mesh3d(meshes.add(Cylinder::new(0.1, NECK_HEIGHT))),
                MeshMaterial3d(white_mat.clone()),
                Transform::from_xyz(0.0, TORSO_HEIGHT / 2.0 + NECK_HEIGHT / 2.0, 0.0),
            ));
            parent.spawn((
                Mesh3d(meshes.add(Sphere::new(HEAD_RADIUS))),
                MeshMaterial3d(gold_mat.clone()),
                Transform::from_xyz(0.0, TORSO_HEIGHT / 2.0 + NECK_HEIGHT + HEAD_RADIUS, 0.0),
            ));
            parent.spawn((
                Mesh3d(meshes.add(Sphere::new(0.03))),
                MeshMaterial3d(dark_mat.clone()),
                Transform::from_xyz(0.06, TORSO_HEIGHT / 2.0 + NECK_HEIGHT + HEAD_RADIUS, 0.14),
            ));
            parent.spawn((
                Mesh3d(meshes.add(Sphere::new(0.03))),
                MeshMaterial3d(dark_mat.clone()),
                Transform::from_xyz(-0.06, TORSO_HEIGHT / 2.0 + NECK_HEIGHT + HEAD_RADIUS, 0.14),
            ));
        })
        .id();

    let right_shoulder_pos = torso_pos + SHOULDER_OFFSET_RIGHT;
    let right_up_arm_pos = right_shoulder_pos + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let right_upper_arm = commands
        .spawn((
            RobotUpperArm,
            Mesh3d(meshes.add(Capsule3d::new(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(right_up_arm_pos)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(UPPER_ARM_LENGTH / 2.0, UPPER_ARM_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new(),
            AngularDamping(0.6),
            LinearDamping(0.2),
        ))
        .id();

    let right_shoulder = commands
        .spawn((
            RevoluteJoint::new(torso, right_upper_arm)
                .with_local_anchor1(SHOULDER_OFFSET_RIGHT)
                .with_local_anchor2(Vec3::new(0.0, -UPPER_ARM_LENGTH / 2.0, 0.0))
                .with_angle_limits(SHOULDER_MIN, SHOULDER_MAX)
                .with_point_compliance(0.000001)
                .with_align_compliance(0.000001)
                .with_limit_compliance(0.00001),
            JointDamping {
                linear: 0.0,
                angular: 1.0,
            },
        ))
        .id();

    let right_elbow_world = right_shoulder_pos + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let right_forearm_pos = right_elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let right_forearm = commands
        .spawn((
            RobotForearm,
            Mesh3d(meshes.add(Capsule3d::new(FOREARM_RADIUS, FOREARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(right_forearm_pos)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(FOREARM_LENGTH / 2.0, FOREARM_RADIUS),
            ColliderDensity(60.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new(),
            AngularDamping(0.6),
            LinearDamping(0.2),
        ))
        .id();

    let right_elbow = commands
        .spawn((
            RevoluteJoint::new(right_upper_arm, right_forearm)
                .with_local_anchor1(Vec3::new(0.0, UPPER_ARM_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(0.0, -FOREARM_LENGTH / 2.0, 0.0))
                .with_angle_limits(ELBOW_MIN, ELBOW_MAX)
                .with_point_compliance(0.000001)
                .with_align_compliance(0.000001)
                .with_limit_compliance(0.00001),
            JointDamping {
                linear: 0.0,
                angular: 0.8,
            },
        ))
        .id();

    let right_hand_pos = right_elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let right_hand = commands
        .spawn((
            RobotHand,
            Mesh3d(meshes.add(Sphere::new(HAND_RADIUS))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(right_hand_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::sphere(HAND_RADIUS),
            ColliderDensity(50.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.4).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            LockedAxes::new(),
            AngularDamping(0.8),
            LinearDamping(0.4),
        ))
        .id();

    let right_wrist = commands
        .spawn(
            RevoluteJoint::new(right_forearm, right_hand)
                .with_local_anchor1(Vec3::new(0.0, FOREARM_LENGTH / 2.0 + HAND_RADIUS, 0.0))
                .with_local_anchor2(Vec3::ZERO)
                .with_angle_limits(WRIST_MIN, WRIST_MAX)
                .with_point_compliance(0.000001)
                .with_align_compliance(0.000001)
                .with_limit_compliance(0.00001),
        )
        .id();

    let left_shoulder_pos = torso_pos + SHOULDER_OFFSET_LEFT;
    let left_up_arm_pos = left_shoulder_pos + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let left_upper_arm = commands
        .spawn((
            RobotLeftUpperArm,
            Mesh3d(meshes.add(Capsule3d::new(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_up_arm_pos)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(UPPER_ARM_LENGTH / 2.0, UPPER_ARM_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(0.8),
            LinearDamping(0.2),
        ))
        .id();

    let left_shoulder = commands
        .spawn((
            RevoluteJoint::new(torso, left_upper_arm)
                .with_local_anchor1(SHOULDER_OFFSET_LEFT)
                .with_local_anchor2(Vec3::new(0.0, -UPPER_ARM_LENGTH / 2.0, 0.0))
                .with_angle_limits(LEFT_SHOULDER_MIN, LEFT_SHOULDER_MAX)
                .with_point_compliance(0.000001)
                .with_align_compliance(0.000001)
                .with_limit_compliance(0.00001),
            JointDamping {
                linear: 0.0,
                angular: 1.0,
            },
        ))
        .id();

    let left_elbow_world = left_shoulder_pos + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let left_forearm_pos = left_elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let left_forearm = commands
        .spawn((
            RobotLeftForearm,
            Mesh3d(meshes.add(Capsule3d::new(FOREARM_RADIUS, FOREARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_forearm_pos)
                .with_rotation(Quat::from_rotation_z(-PI / 2.0)),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(FOREARM_LENGTH / 2.0, FOREARM_RADIUS),
            ColliderDensity(60.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(0.8),
            LinearDamping(0.2),
        ))
        .id();

    let left_elbow = commands
        .spawn((
            RevoluteJoint::new(left_upper_arm, left_forearm)
                .with_local_anchor1(Vec3::new(0.0, UPPER_ARM_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(0.0, -FOREARM_LENGTH / 2.0, 0.0))
                .with_angle_limits(ELBOW_MIN, LEFT_ELBOW_MAX)
                .with_point_compliance(0.000001)
                .with_align_compliance(0.000001)
                .with_limit_compliance(0.00001),
            JointDamping {
                linear: 0.0,
                angular: 0.8,
            },
        ))
        .id();

    let left_hand_pos = left_elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let left_hand = commands
        .spawn((
            RobotLeftHand,
            Mesh3d(meshes.add(Sphere::new(HAND_RADIUS))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_hand_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::sphere(HAND_RADIUS),
            ColliderDensity(50.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.4).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            LockedAxes::new().lock_rotation_x().lock_rotation_y(),
            AngularDamping(0.6),
            LinearDamping(0.3),
        ))
        .id();

    let left_wrist = commands
        .spawn(
            RevoluteJoint::new(left_forearm, left_hand)
                .with_local_anchor1(Vec3::new(0.0, FOREARM_LENGTH / 2.0 + HAND_RADIUS, 0.0))
                .with_local_anchor2(Vec3::ZERO)
                .with_angle_limits(LEFT_WRIST_MIN, LEFT_WRIST_MAX)
                .with_point_compliance(0.000001)
                .with_align_compliance(0.000001)
                .with_limit_compliance(0.00001),
        )
        .id();

    let left_hip_pos = torso_pos + HIP_OFFSET_LEFT;
    let left_thigh_pos = left_hip_pos + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0);

    let left_thigh = commands
        .spawn((
            RobotLeftThigh,
            Mesh3d(meshes.add(Capsule3d::new(THIGH_RADIUS, THIGH_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_thigh_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(THIGH_LENGTH / 2.0, THIGH_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.3).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            AngularDamping(2.5),
            LinearDamping(0.6),
        ))
        .id();

    let left_hip = commands
        .spawn(
            RevoluteJoint::new(torso, left_thigh)
                .with_local_anchor1(HIP_OFFSET_LEFT)
                .with_local_anchor2(Vec3::new(0.0, THIGH_LENGTH / 2.0, 0.0))
                .with_angle_limits(HIP_MIN, HIP_MAX)
                .with_point_compliance(0.0005)
                .with_align_compliance(0.0005)
                .with_limit_compliance(0.001),
        )
        .id();

    let left_shin_pos = left_hip_pos + Vec3::new(0.0, -THIGH_LENGTH - SHIN_LENGTH / 2.0, 0.0);

    let left_shin = commands
        .spawn((
            RobotLeftShin,
            Mesh3d(meshes.add(Capsule3d::new(SHIN_RADIUS, SHIN_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_shin_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(SHIN_LENGTH / 2.0, SHIN_RADIUS),
            ColliderDensity(120.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.3).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            AngularDamping(2.0),
            LinearDamping(0.6),
        ))
        .id();

    let left_knee = commands
        .spawn(
            RevoluteJoint::new(left_thigh, left_shin)
                .with_local_anchor1(Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(0.0, SHIN_LENGTH / 2.0, 0.0))
                .with_angle_limits(KNEE_MIN, KNEE_MAX)
                .with_point_compliance(0.0005)
                .with_align_compliance(0.0005)
                .with_limit_compliance(0.001),
        )
        .id();

    let left_foot_pos = left_hip_pos
        + Vec3::new(
            FOOT_FORWARD_OFFSET,
            -THIGH_LENGTH - SHIN_LENGTH - FOOT_SIZE_Y / 2.0,
            0.0,
        );

    let left_foot = commands
        .spawn((
            RobotLeftFoot,
            Mesh3d(meshes.add(Cuboid::new(FOOT_SIZE_X, FOOT_SIZE_Y, FOOT_SIZE_Z))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(left_foot_pos),
            RigidBody::Dynamic,
            SweptCcd {
                linear_threshold: 0.0,
                angular_threshold: 0.0,
                ..default()
            },
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::cuboid(FOOT_SIZE_X / 2.0, FOOT_SIZE_Y / 2.0, FOOT_SIZE_Z / 2.0),
            ColliderDensity(50.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.7).with_combine_rule(CoefficientCombine::Max),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            AngularDamping(0.5),
            LinearDamping(0.3),
        ))
        .id();

    let left_ankle = commands
        .spawn(
            FixedJoint::new(left_shin, left_foot)
                .with_local_anchor1(Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(-FOOT_FORWARD_OFFSET, 0.0, 0.0))
                .with_point_compliance(0.0001),
        )
        .id();

    let right_hip_pos = torso_pos + HIP_OFFSET_RIGHT;
    let right_thigh_pos = right_hip_pos + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0);

    let right_thigh = commands
        .spawn((
            RobotRightThigh,
            Mesh3d(meshes.add(Capsule3d::new(THIGH_RADIUS, THIGH_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(right_thigh_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(THIGH_LENGTH / 2.0, THIGH_RADIUS),
            ColliderDensity(80.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.3).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            AngularDamping(2.5),
            LinearDamping(0.6),
        ))
        .id();

    let right_hip = commands
        .spawn(
            RevoluteJoint::new(torso, right_thigh)
                .with_local_anchor1(HIP_OFFSET_RIGHT)
                .with_local_anchor2(Vec3::new(0.0, THIGH_LENGTH / 2.0, 0.0))
                .with_angle_limits(HIP_MIN, HIP_MAX)
                .with_point_compliance(0.0005)
                .with_align_compliance(0.0005)
                .with_limit_compliance(0.001),
        )
        .id();

    let right_shin_pos = right_hip_pos + Vec3::new(0.0, -THIGH_LENGTH - SHIN_LENGTH / 2.0, 0.0);

    let right_shin = commands
        .spawn((
            RobotRightShin,
            Mesh3d(meshes.add(Capsule3d::new(SHIN_RADIUS, SHIN_LENGTH))),
            MeshMaterial3d(white_mat.clone()),
            Transform::from_translation(right_shin_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(SHIN_LENGTH / 2.0, SHIN_RADIUS),
            ColliderDensity(120.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.3).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            AngularDamping(2.0),
            LinearDamping(0.6),
        ))
        .id();

    let right_knee = commands
        .spawn(
            RevoluteJoint::new(right_thigh, right_shin)
                .with_local_anchor1(Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(0.0, SHIN_LENGTH / 2.0, 0.0))
                .with_angle_limits(KNEE_MIN, KNEE_MAX)
                .with_point_compliance(0.0005)
                .with_align_compliance(0.0005)
                .with_limit_compliance(0.001),
        )
        .id();

    let right_foot_pos = right_hip_pos
        + Vec3::new(
            FOOT_FORWARD_OFFSET,
            -THIGH_LENGTH - SHIN_LENGTH - FOOT_SIZE_Y / 2.0,
            0.0,
        );

    let right_foot = commands
        .spawn((
            RobotRightFoot,
            Mesh3d(meshes.add(Cuboid::new(FOOT_SIZE_X, FOOT_SIZE_Y, FOOT_SIZE_Z))),
            MeshMaterial3d(white_mat.clone()),
            Transform::from_translation(right_foot_pos),
            RigidBody::Dynamic,
            SweptCcd {
                linear_threshold: 0.0,
                angular_threshold: 0.0,
                ..default()
            },
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::cuboid(FOOT_SIZE_X / 2.0, FOOT_SIZE_Y / 2.0, FOOT_SIZE_Z / 2.0),
            ColliderDensity(50.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.7).with_combine_rule(CoefficientCombine::Max),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
            AngularDamping(0.5),
            LinearDamping(0.3),
        ))
        .id();

    let right_ankle = commands
        .spawn(
            FixedJoint::new(right_shin, right_foot)
                .with_local_anchor1(Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(-FOOT_FORWARD_OFFSET, 0.0, 0.0))
                .with_point_compliance(0.0001),
        )
        .id();

    RobotEntities {
        torso,

        right_upper_arm,
        right_forearm,
        right_hand,
        right_shoulder,
        right_elbow,
        right_wrist,

        left_upper_arm,
        left_forearm,
        left_hand,
        left_shoulder,
        left_elbow,
        left_wrist,

        right_thigh,
        right_shin,
        right_foot,
        right_hip,
        right_knee,
        right_ankle,

        left_thigh,
        left_shin,
        left_foot,
        left_hip,
        left_knee,
        left_ankle,
    }
}
