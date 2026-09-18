use super::components::*;
use super::constants::*;
use super::reset::get_initial_poses;
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
    let poses = get_initial_poses();
    let torso_pos = poses.torso.position;

    let torso = commands
        .spawn((
            RobotTorso,
            Mesh3d(meshes.add(Cuboid::new(TORSO_SIZE_X, TORSO_HEIGHT, TORSO_SIZE_Z))),
            MeshMaterial3d(gold_mat.clone()),
            Transform::from_translation(torso_pos),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::cuboid(TORSO_SIZE_X, TORSO_HEIGHT, TORSO_SIZE_Z),
            ColliderDensity(180.0),
            CollisionMargin(0.001),
            CollisionLayers::new(GameLayer::Robot, [GameLayer::Ground, GameLayer::Ball]),
            Friction::new(0.3).with_combine_rule(CoefficientCombine::Average),
            Restitution::ZERO.with_combine_rule(CoefficientCombine::Min),
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
        })
        .id();

    let right_upper_arm = commands
        .spawn((
            RobotUpperArm,
            Mesh3d(meshes.add(Capsule3d::new(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            poses.upper_arm.transform(),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH),
            ColliderDensity(400.0),
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
                .with_local_basis2(Quat::from_rotation_z(PI / 2.0))
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

    let right_forearm = commands
        .spawn((
            RobotForearm,
            Mesh3d(meshes.add(Capsule3d::new(FOREARM_RADIUS, FOREARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            poses.forearm.transform(),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(FOREARM_RADIUS, FOREARM_LENGTH),
            ColliderDensity(400.0),
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

    let right_hand = commands
        .spawn((
            RobotHand,
            Mesh3d(meshes.add(Sphere::new(HAND_RADIUS))),
            MeshMaterial3d(gold_mat.clone()),
            poses.hand.transform(),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::sphere(HAND_RADIUS),
            ColliderDensity(300.0),
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

    let left_upper_arm = commands
        .spawn((
            RobotLeftUpperArm,
            Mesh3d(meshes.add(Capsule3d::new(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            poses.left_upper_arm.transform(),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(UPPER_ARM_RADIUS, UPPER_ARM_LENGTH),
            ColliderDensity(400.0),
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
                .with_local_basis2(Quat::from_rotation_z(PI / 2.0))
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

    let left_forearm = commands
        .spawn((
            RobotLeftForearm,
            Mesh3d(meshes.add(Capsule3d::new(FOREARM_RADIUS, FOREARM_LENGTH))),
            MeshMaterial3d(gold_mat.clone()),
            poses.left_forearm.transform(),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::capsule(FOREARM_RADIUS, FOREARM_LENGTH),
            ColliderDensity(400.0),
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

    let left_hand = commands
        .spawn((
            RobotLeftHand,
            Mesh3d(meshes.add(Sphere::new(HAND_RADIUS))),
            MeshMaterial3d(gold_mat.clone()),
            poses.left_hand.transform(),
            RigidBody::Dynamic,
            ConstantTorque::new(0.0, 0.0, 0.0),
            Collider::sphere(HAND_RADIUS),
            ColliderDensity(300.0),
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
            Collider::capsule(THIGH_RADIUS, THIGH_LENGTH),
            ColliderDensity(800.0),
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
                .with_point_compliance(0.00001)
                .with_align_compliance(0.00001)
                .with_limit_compliance(0.0001),
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
            Collider::capsule(SHIN_RADIUS, SHIN_LENGTH),
            ColliderDensity(700.0),
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
                .with_point_compliance(0.00001)
                .with_align_compliance(0.00001)
                .with_limit_compliance(0.0001),
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
            Collider::cuboid(FOOT_SIZE_X, FOOT_SIZE_Y, FOOT_SIZE_Z),
            ColliderDensity(300.0),
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
            RevoluteJoint::new(left_shin, left_foot)
                .with_angle_limits(-0.6, 0.6)
                .with_local_anchor1(Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(-FOOT_FORWARD_OFFSET, FOOT_SIZE_Y / 2.0, 0.0))
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
            Collider::capsule(THIGH_RADIUS, THIGH_LENGTH),
            ColliderDensity(800.0),
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
                .with_point_compliance(0.00001)
                .with_align_compliance(0.00001)
                .with_limit_compliance(0.0001),
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
            Collider::capsule(SHIN_RADIUS, SHIN_LENGTH),
            ColliderDensity(700.0),
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
                .with_point_compliance(0.00001)
                .with_align_compliance(0.00001)
                .with_limit_compliance(0.0001),
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
            Collider::cuboid(FOOT_SIZE_X, FOOT_SIZE_Y, FOOT_SIZE_Z),
            ColliderDensity(300.0),
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
            RevoluteJoint::new(right_shin, right_foot)
                .with_angle_limits(-0.6, 0.6)
                .with_local_anchor1(Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0))
                .with_local_anchor2(Vec3::new(-FOOT_FORWARD_OFFSET, FOOT_SIZE_Y / 2.0, 0.0))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_matches_reset_and_starts_with_aligned_hinges() {
        let mut app = App::new();
        app.init_resource::<Assets<Mesh>>()
            .init_resource::<Assets<StandardMaterial>>()
            .add_systems(
                Startup,
                |mut commands: Commands,
                 mut meshes: ResMut<Assets<Mesh>>,
                 mut materials: ResMut<Assets<StandardMaterial>>| {
                    let robot = spawn_robot(&mut commands, &mut meshes, &mut materials);
                    commands.insert_resource(robot);
                },
            );
        app.update();
        let poses = get_initial_poses();
        let robot = app.world().resource::<RobotEntities>();
        for (entity, pose) in [
            (robot.torso, poses.torso),
            (robot.right_upper_arm, poses.upper_arm),
            (robot.right_forearm, poses.forearm),
            (robot.right_hand, poses.hand),
            (robot.left_upper_arm, poses.left_upper_arm),
            (robot.left_forearm, poses.left_forearm),
            (robot.left_hand, poses.left_hand),
            (robot.left_thigh, poses.left_thigh),
            (robot.left_shin, poses.left_shin),
            (robot.left_foot, poses.left_foot),
            (robot.right_thigh, poses.right_thigh),
            (robot.right_shin, poses.right_shin),
            (robot.right_foot, poses.right_foot),
        ] {
            let transform = app.world().get::<Transform>(entity).unwrap();
            assert!(transform.translation.abs_diff_eq(pose.position, 1e-5));
            assert!(transform.rotation.abs_diff_eq(pose.rotation, 1e-5));
        }

        assert!(app.world().get::<RevoluteJoint>(robot.left_ankle).is_some());
        assert!(app
            .world()
            .get::<RevoluteJoint>(robot.right_ankle)
            .is_some());
        let body_rotations: Vec<_> = app
            .world_mut()
            .query::<(Entity, &Transform, &ConstantTorque)>()
            .iter(app.world())
            .map(|(entity, transform, _)| (entity, transform.rotation))
            .collect();
        assert_eq!(body_rotations.len(), 13);
        for (entity, rotation) in body_rotations {
            app.world_mut()
                .entity_mut(entity)
                .insert(Rotation(Quat::from_rotation_x(0.3) * rotation));
        }
        let mut torque_system = bevy::ecs::system::SystemState::<
            super::super::torque::TorqueWriteQuery,
        >::new(app.world_mut());
        let torques =
            super::super::torque::ComputedTorques::from_action(&[0.5; crate::rl::ACT_DIM]);
        super::super::torque::apply_torques(
            &mut torque_system.get_mut(app.world_mut()).unwrap(),
            &torques,
        );
        let mut forces = app.world_mut().query::<&ConstantTorque>();
        let total: Vec3 = forces.iter(app.world()).map(|t| t.0).sum();
        assert!(
            total.length() < 1e-5,
            "Internal actuators must conserve angular momentum: {total}"
        );

        let mut joints = app.world_mut().query::<&RevoluteJoint>();
        for joint in joints.iter(app.world()) {
            let first = app.world().get::<Transform>(joint.body1).unwrap();
            let second = app.world().get::<Transform>(joint.body2).unwrap();
            let anchor1 = first.transform_point(joint.local_anchor1().unwrap());
            let anchor2 = second.transform_point(joint.local_anchor2().unwrap());
            assert!(anchor1.abs_diff_eq(anchor2, 1e-5));
            let basis1 = first.rotation * joint.local_basis1().unwrap();
            let basis2 = second.rotation * joint.local_basis2().unwrap();
            let angle = (basis1.inverse() * basis2).to_euler(EulerRot::ZYX).0;
            let limits = joint.angle_limit.unwrap();
            assert!(
                angle >= limits.min && angle <= limits.max,
                "joint starts outside limits: {angle}"
            );
        }
    }
}
