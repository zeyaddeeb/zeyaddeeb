use avian3d::prelude::*;
use bevy::prelude::*;
use std::f32::consts::PI;

use super::components::*;

#[derive(Debug, Clone, Copy, Default)]
pub struct JointState {
    pub angle: f32,
    pub velocity: f32,
}

impl JointState {
    pub fn new(angle: f32, velocity: f32) -> Self {
        Self { angle, velocity }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RobotState {
    pub torso_pos: Vec3,
    pub torso_up: Vec3,
    pub torso_ang_vel: Vec3,
    pub torso: JointState,

    pub shoulder: JointState,
    pub elbow: JointState,
    pub wrist: JointState,

    pub left_shoulder: JointState,
    pub left_elbow: JointState,
    pub left_wrist: JointState,

    pub left_hip: JointState,
    pub left_knee: JointState,
    pub left_ankle: JointState,

    pub right_hip: JointState,
    pub right_knee: JointState,
    pub right_ankle: JointState,

    pub left_foot_pos: Vec3,
    pub right_foot_pos: Vec3,
}

impl RobotState {
    pub fn joint_angles(&self) -> Vec<f32> {
        vec![
            self.shoulder.angle,
            self.elbow.angle,
            self.wrist.angle,
            self.left_shoulder.angle,
            self.left_elbow.angle,
            self.left_wrist.angle,
            self.torso.angle,
            self.left_hip.angle,
            self.left_knee.angle,
            self.left_ankle.angle,
            self.right_hip.angle,
            self.right_knee.angle,
            self.right_ankle.angle,
        ]
    }

    pub fn joint_velocities(&self) -> Vec<f32> {
        vec![
            self.shoulder.velocity,
            self.elbow.velocity,
            self.wrist.velocity,
            self.left_shoulder.velocity,
            self.left_elbow.velocity,
            self.left_wrist.velocity,
            self.torso.velocity,
            self.left_hip.velocity,
            self.left_knee.velocity,
            self.left_ankle.velocity,
            self.right_hip.velocity,
            self.right_knee.velocity,
            self.right_ankle.velocity,
        ]
    }
}

pub type JointReadQuery<'w, 's> = Query<
    'w,
    's,
    (
        &'static Transform,
        &'static AngularVelocity,
        Option<&'static RobotTorso>,
        Option<&'static RobotUpperArm>,
        Option<&'static RobotForearm>,
        Option<&'static RobotHand>,
        Option<&'static RobotLeftUpperArm>,
        Option<&'static RobotLeftForearm>,
        Option<&'static RobotLeftHand>,
        Option<&'static RobotLeftThigh>,
        Option<&'static RobotLeftShin>,
        Option<&'static RobotLeftFoot>,
        Option<&'static RobotRightThigh>,
        Option<&'static RobotRightShin>,
        Option<&'static RobotRightFoot>,
    ),
    Or<(
        With<RobotTorso>,
        With<RobotUpperArm>,
        With<RobotForearm>,
        With<RobotHand>,
        With<RobotLeftUpperArm>,
        With<RobotLeftForearm>,
        With<RobotLeftHand>,
        With<RobotLeftThigh>,
        With<RobotLeftShin>,
        With<RobotLeftFoot>,
        With<RobotRightThigh>,
        With<RobotRightShin>,
        With<RobotRightFoot>,
    )>,
>;

pub fn extract_robot_state(query: &JointReadQuery) -> Option<RobotState> {
    let mut state = RobotState::default();
    let mut torso_raw = None;
    let mut upper_raw = None;
    let mut forearm_raw = None;
    let mut hand_raw = None;
    let mut left_upper_raw = None;
    let mut left_forearm_raw = None;
    let mut left_hand_raw = None;
    let mut left_thigh_raw = None;
    let mut left_shin_raw = None;
    let mut left_foot_raw = None;
    let mut right_thigh_raw = None;
    let mut right_shin_raw = None;
    let mut right_foot_raw = None;

    for (
        tf,
        ang_vel,
        torso,
        upper,
        forearm,
        hand,
        left_upper,
        left_forearm,
        left_hand,
        left_thigh,
        left_shin,
        left_foot,
        right_thigh,
        right_shin,
        right_foot,
    ) in query.iter()
    {
        let angle = tf.rotation.to_euler(EulerRot::ZYX).0;
        let vel = ang_vel.z;
        let ang3 = Vec3::new(ang_vel.x, ang_vel.y, ang_vel.z);
        let up_vec = tf.rotation * Vec3::Y;

        if torso.is_some() {
            torso_raw = Some((angle, vel));
            state.torso_pos = tf.translation;
            state.torso_up = up_vec;
            state.torso_ang_vel = ang3;
        } else if upper.is_some() {
            upper_raw = Some((angle, vel));
        } else if forearm.is_some() {
            forearm_raw = Some((angle, vel));
        } else if hand.is_some() {
            hand_raw = Some((angle, vel));
        } else if left_upper.is_some() {
            left_upper_raw = Some((angle, vel));
        } else if left_forearm.is_some() {
            left_forearm_raw = Some((angle, vel));
        } else if left_hand.is_some() {
            left_hand_raw = Some((angle, vel));
        } else if left_thigh.is_some() {
            left_thigh_raw = Some((angle, vel));
        } else if left_shin.is_some() {
            left_shin_raw = Some((angle, vel));
        } else if left_foot.is_some() {
            left_foot_raw = Some((angle, vel));
            state.left_foot_pos = tf.translation;
        } else if right_thigh.is_some() {
            right_thigh_raw = Some((angle, vel));
        } else if right_shin.is_some() {
            right_shin_raw = Some((angle, vel));
        } else if right_foot.is_some() {
            right_foot_raw = Some((angle, vel));
            state.right_foot_pos = tf.translation;
        }
    }

    let (torso_angle_raw, torso_vel) = torso_raw?;
    let (upper_angle_raw, shoulder_vel) = upper_raw?;
    let (forearm_angle_raw, elbow_vel) = forearm_raw?;
    let (hand_angle_raw, wrist_vel) = hand_raw?;
    let (left_upper_angle_raw, left_shoulder_vel) = left_upper_raw?;
    let (left_forearm_angle_raw, left_elbow_vel) = left_forearm_raw?;
    let (left_hand_angle_raw, left_wrist_vel) = left_hand_raw?;
    let (left_thigh_angle_raw, left_hip_vel) = left_thigh_raw?;
    let (left_shin_angle_raw, left_knee_vel) = left_shin_raw?;
    let (left_foot_angle_raw, left_ankle_vel) = left_foot_raw?;
    let (right_thigh_angle_raw, right_hip_vel) = right_thigh_raw?;
    let (right_shin_angle_raw, right_knee_vel) = right_shin_raw?;
    let (right_foot_angle_raw, right_ankle_vel) = right_foot_raw?;

    state.torso = JointState::new(torso_angle_raw, torso_vel);
    state.shoulder = JointState::new(upper_angle_raw - torso_angle_raw + PI / 2.0, shoulder_vel);
    state.elbow = JointState::new(forearm_angle_raw - upper_angle_raw, elbow_vel);
    state.wrist = JointState::new(hand_angle_raw - forearm_angle_raw, wrist_vel);
    state.left_shoulder = JointState::new(
        left_upper_angle_raw - torso_angle_raw + PI / 2.0,
        left_shoulder_vel,
    );
    state.left_elbow = JointState::new(
        left_forearm_angle_raw - left_upper_angle_raw,
        left_elbow_vel,
    );
    state.left_wrist =
        JointState::new(left_hand_angle_raw - left_forearm_angle_raw, left_wrist_vel);
    state.left_hip = JointState::new(left_thigh_angle_raw - torso_angle_raw, left_hip_vel);
    state.left_knee = JointState::new(left_shin_angle_raw - left_thigh_angle_raw, left_knee_vel);
    state.left_ankle = JointState::new(left_foot_angle_raw - left_shin_angle_raw, left_ankle_vel);
    state.right_hip = JointState::new(right_thigh_angle_raw - torso_angle_raw, right_hip_vel);
    state.right_knee =
        JointState::new(right_shin_angle_raw - right_thigh_angle_raw, right_knee_vel);
    state.right_ankle =
        JointState::new(right_foot_angle_raw - right_shin_angle_raw, right_ankle_vel);

    Some(state)
}
