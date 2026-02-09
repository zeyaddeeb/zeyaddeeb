use avian3d::prelude::*;
use bevy::prelude::*;

use super::components::*;
use super::constants::*;

#[derive(Debug, Clone, Copy)]
pub struct BodyPartPose {
    pub position: Vec3,
    pub rotation: Quat,
}

impl BodyPartPose {
    pub fn new(position: Vec3, rotation: Quat) -> Self {
        Self { position, rotation }
    }
}
pub fn get_initial_poses() -> RobotPoses {
    use std::f32::consts::PI;

    let torso_pos = Vec3::new(0.0, TORSO_Y, 0.0);
    let torso_rot = Quat::IDENTITY;

    let right_shoulder_world = torso_pos + SHOULDER_OFFSET_RIGHT;
    let right_upper_arm_center = right_shoulder_world + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let elbow_world = right_shoulder_world + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let forearm_center = elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let hand_world = elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let shoulder_rot = Quat::from_rotation_z(-PI / 2.0);

    let left_shoulder_world = torso_pos + SHOULDER_OFFSET_LEFT;
    let left_upper_arm_center = left_shoulder_world + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let left_elbow_world = left_shoulder_world + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let left_forearm_center = left_elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let left_hand_world = left_elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let right_hip_world = torso_pos + HIP_OFFSET_RIGHT;
    let right_thigh_center = right_hip_world + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0);

    let right_knee_world = right_hip_world + Vec3::new(0.0, -THIGH_LENGTH, 0.0);
    let right_shin_center = right_knee_world + Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0);

    let right_foot_world =
        right_knee_world + Vec3::new(FOOT_FORWARD_OFFSET, -SHIN_LENGTH - FOOT_SIZE_Y / 2.0, 0.0);

    let left_hip_world = torso_pos + HIP_OFFSET_LEFT;
    let left_thigh_center = left_hip_world + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0);

    let left_knee_world = left_hip_world + Vec3::new(0.0, -THIGH_LENGTH, 0.0);
    let left_shin_center = left_knee_world + Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0);

    let left_foot_world =
        left_knee_world + Vec3::new(FOOT_FORWARD_OFFSET, -SHIN_LENGTH - FOOT_SIZE_Y / 2.0, 0.0);

    RobotPoses {
        torso: BodyPartPose::new(torso_pos, torso_rot),
        upper_arm: BodyPartPose::new(right_upper_arm_center, shoulder_rot),
        forearm: BodyPartPose::new(forearm_center, shoulder_rot),
        hand: BodyPartPose::new(hand_world, shoulder_rot),
        left_upper_arm: BodyPartPose::new(left_upper_arm_center, shoulder_rot),
        left_forearm: BodyPartPose::new(left_forearm_center, shoulder_rot),
        left_hand: BodyPartPose::new(left_hand_world, shoulder_rot),
        left_thigh: BodyPartPose::new(left_thigh_center, Quat::IDENTITY),
        left_shin: BodyPartPose::new(left_shin_center, Quat::IDENTITY),
        left_foot: BodyPartPose::new(left_foot_world, Quat::IDENTITY),
        right_thigh: BodyPartPose::new(right_thigh_center, Quat::IDENTITY),
        right_shin: BodyPartPose::new(right_shin_center, Quat::IDENTITY),
        right_foot: BodyPartPose::new(right_foot_world, Quat::IDENTITY),
    }
}

pub struct RobotPoses {
    pub torso: BodyPartPose,
    pub upper_arm: BodyPartPose,
    pub forearm: BodyPartPose,
    pub hand: BodyPartPose,
    pub left_upper_arm: BodyPartPose,
    pub left_forearm: BodyPartPose,
    pub left_hand: BodyPartPose,
    pub left_thigh: BodyPartPose,
    pub left_shin: BodyPartPose,
    pub left_foot: BodyPartPose,
    pub right_thigh: BodyPartPose,
    pub right_shin: BodyPartPose,
    pub right_foot: BodyPartPose,
}

fn reset_body(
    transform: &mut Transform,
    lin_vel: &mut LinearVelocity,
    ang_vel: &mut AngularVelocity,
    phys_pos: Option<Mut<Position>>,
    pose: &BodyPartPose,
) {
    transform.translation = pose.position;
    transform.rotation = pose.rotation;
    if let Some(mut pos) = phys_pos {
        pos.0 = pose.position;
    }
    **lin_vel = Vec3::ZERO;
    **ang_vel = Vec3::ZERO;
}

#[cfg(feature = "native")]
pub fn reset_robot_positions(
    mut torso_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        With<RobotTorso>,
    >,
    mut upper_arm_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (With<RobotUpperArm>, Without<RobotTorso>),
    >,
    mut forearm_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotForearm>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
        ),
    >,
    mut hand_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotHand>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
        ),
    >,
    mut left_upper_arm_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotLeftUpperArm>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
        ),
    >,
    mut left_forearm_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotLeftForearm>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
        ),
    >,
    mut left_hand_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotLeftHand>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
        ),
    >,
    mut left_thigh_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotLeftThigh>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
            Without<RobotLeftHand>,
        ),
    >,
    mut left_shin_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotLeftShin>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
            Without<RobotLeftHand>,
            Without<RobotLeftThigh>,
        ),
    >,
    mut left_foot_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotLeftFoot>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
            Without<RobotLeftHand>,
            Without<RobotLeftThigh>,
            Without<RobotLeftShin>,
        ),
    >,
    mut right_thigh_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotRightThigh>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
            Without<RobotLeftHand>,
            Without<RobotLeftThigh>,
            Without<RobotLeftShin>,
            Without<RobotLeftFoot>,
        ),
    >,
    mut right_shin_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotRightShin>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
            Without<RobotLeftHand>,
            Without<RobotLeftThigh>,
            Without<RobotLeftShin>,
            Without<RobotLeftFoot>,
            Without<RobotRightThigh>,
        ),
    >,
    mut right_foot_q: Query<
        (
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
            Option<&mut Position>,
        ),
        (
            With<RobotRightFoot>,
            Without<RobotTorso>,
            Without<RobotUpperArm>,
            Without<RobotForearm>,
            Without<RobotHand>,
            Without<RobotLeftUpperArm>,
            Without<RobotLeftForearm>,
            Without<RobotLeftHand>,
            Without<RobotLeftThigh>,
            Without<RobotLeftShin>,
            Without<RobotLeftFoot>,
            Without<RobotRightThigh>,
            Without<RobotRightShin>,
        ),
    >,
    training_state: Res<super::resources::TrainingState>,
) {
    if training_state.step != 0 {
        return;
    }

    let poses = get_initial_poses();

    if let Some((mut tf, mut lv, mut av, pos)) = torso_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.torso);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = upper_arm_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.upper_arm);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = forearm_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.forearm);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = hand_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.hand);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = left_upper_arm_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.left_upper_arm);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = left_forearm_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.left_forearm);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = left_hand_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.left_hand);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = left_thigh_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.left_thigh);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = left_shin_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.left_shin);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = left_foot_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.left_foot);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = right_thigh_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.right_thigh);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = right_shin_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.right_shin);
    }
    if let Some((mut tf, mut lv, mut av, pos)) = right_foot_q.iter_mut().next() {
        reset_body(&mut tf, &mut lv, &mut av, pos, &poses.right_foot);
    }
}
