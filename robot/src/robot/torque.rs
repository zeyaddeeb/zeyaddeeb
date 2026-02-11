use avian3d::prelude::*;
use bevy::prelude::*;

use super::components::*;
use super::constants::*;

pub const MAX_JOINT_TORQUE: f32 = 10.0;

pub fn clamp_torque(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(-MAX_JOINT_TORQUE, MAX_JOINT_TORQUE)
    } else {
        0.0
    }
}

#[derive(Debug, Clone, Default)]
pub struct ComputedTorques {
    pub torso: Vec3,
    pub shoulder: f32,
    pub elbow: f32,
    pub wrist: f32,
    pub left_shoulder: f32,
    pub left_elbow: f32,
    pub left_wrist: f32,
    pub left_hip: f32,
    pub left_knee: f32,
    pub left_ankle: f32,
    pub right_hip: f32,
    pub right_knee: f32,
    pub right_ankle: f32,
}

impl ComputedTorques {
    pub fn from_action(action: &[f32]) -> Self {
        Self {
            torso: Vec3::new(0.0, 0.0, clamp_torque(action[6] * TORSO_TORQUE_SCALE)),
            shoulder: clamp_torque(action[0] * SHOULDER_TORQUE_SCALE),
            elbow: clamp_torque(action[1] * ELBOW_TORQUE_SCALE),
            wrist: clamp_torque(action[2] * WRIST_TORQUE_SCALE),

            left_shoulder: clamp_torque(action[3] * SHOULDER_TORQUE_SCALE),
            left_elbow: clamp_torque(action[4] * ELBOW_TORQUE_SCALE),
            left_wrist: clamp_torque(action[5] * WRIST_TORQUE_SCALE),

            left_hip: clamp_torque(action[7] * HIP_TORQUE_SCALE),
            left_knee: clamp_torque(action[8] * KNEE_TORQUE_SCALE),
            left_ankle: clamp_torque(action[9] * ANKLE_TORQUE_SCALE),

            right_hip: clamp_torque(action[10] * HIP_TORQUE_SCALE),
            right_knee: clamp_torque(action[11] * KNEE_TORQUE_SCALE),
            right_ankle: clamp_torque(action[12] * ANKLE_TORQUE_SCALE),
        }
    }
}

pub type TorqueWriteQuery<'w, 's> = Query<
    'w,
    's,
    (
        &'static mut ConstantTorque,
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

pub fn apply_torques(query: &mut TorqueWriteQuery, torques: &ComputedTorques) {
    for (
        mut torque,
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
    ) in query.iter_mut()
    {
        if torso.is_some() {
            *torque = ConstantTorque::new(torques.torso.x, torques.torso.y, torques.torso.z);
        } else if upper.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.shoulder);
        } else if forearm.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.elbow);
        } else if hand.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.wrist);
        } else if left_upper.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_shoulder);
        } else if left_forearm.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_elbow);
        } else if left_hand.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_wrist);
        } else if left_thigh.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_hip);
        } else if left_shin.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_knee);
        } else if left_foot.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_ankle);
        } else if right_thigh.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.right_hip);
        } else if right_shin.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.right_knee);
        } else if right_foot.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.right_ankle);
        }
    }
}
