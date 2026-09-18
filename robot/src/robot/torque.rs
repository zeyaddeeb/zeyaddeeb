use avian3d::prelude::*;
use bevy::prelude::*;

use super::components::*;
use super::constants::*;

pub fn scale_torque(action: f32, scale: f32) -> f32 {
    if action.is_finite() {
        action.clamp(-1.0, 1.0) * scale
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
            torso: Vec3::new(0.0, 0.0, scale_torque(action[6], TORSO_TORQUE_SCALE)),
            shoulder: scale_torque(action[0], SHOULDER_TORQUE_SCALE),
            elbow: scale_torque(action[1], ELBOW_TORQUE_SCALE),
            wrist: scale_torque(action[2], WRIST_TORQUE_SCALE),

            left_shoulder: scale_torque(action[3], SHOULDER_TORQUE_SCALE),
            left_elbow: scale_torque(action[4], ELBOW_TORQUE_SCALE),
            left_wrist: scale_torque(action[5], WRIST_TORQUE_SCALE),

            left_hip: scale_torque(action[7], HIP_TORQUE_SCALE),
            left_knee: scale_torque(action[8], KNEE_TORQUE_SCALE),
            left_ankle: scale_torque(action[9], ANKLE_TORQUE_SCALE),

            right_hip: scale_torque(action[10], HIP_TORQUE_SCALE),
            right_knee: scale_torque(action[11], KNEE_TORQUE_SCALE),
            right_ankle: scale_torque(action[12], ANKLE_TORQUE_SCALE),
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
        let z = if torso.is_some() {
            torques.torso.z
                - torques.shoulder
                - torques.left_shoulder
                - torques.left_hip
                - torques.right_hip
        } else if upper.is_some() {
            torques.shoulder - torques.elbow
        } else if forearm.is_some() {
            torques.elbow - torques.wrist
        } else if hand.is_some() {
            torques.wrist
        } else if left_upper.is_some() {
            torques.left_shoulder - torques.left_elbow
        } else if left_forearm.is_some() {
            torques.left_elbow - torques.left_wrist
        } else if left_hand.is_some() {
            torques.left_wrist
        } else if left_thigh.is_some() {
            torques.left_hip - torques.left_knee
        } else if left_shin.is_some() {
            torques.left_knee
        } else if left_foot.is_some() {
            torques.left_ankle
        } else if right_thigh.is_some() {
            torques.right_hip - torques.right_knee
        } else if right_shin.is_some() {
            torques.right_knee
        } else if right_foot.is_some() {
            torques.right_ankle
        } else {
            0.0
        };
        *torque = ConstantTorque::new(0.0, 0.0, z);
    }
}
