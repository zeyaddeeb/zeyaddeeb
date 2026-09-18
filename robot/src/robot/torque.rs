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
        &'static Rotation,
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
    // Motors act about their parent's hinge axis, including when the robot tilts.
    let mut axes = [Vec3::Z; 9];
    for (
        _,
        rotation,
        torso,
        upper,
        forearm,
        _,
        left_upper,
        left_forearm,
        _,
        left_thigh,
        left_shin,
        _,
        right_thigh,
        right_shin,
        _,
    ) in query.iter()
    {
        let index = if torso.is_some() {
            Some(0)
        } else if upper.is_some() {
            Some(1)
        } else if forearm.is_some() {
            Some(2)
        } else if left_upper.is_some() {
            Some(3)
        } else if left_forearm.is_some() {
            Some(4)
        } else if left_thigh.is_some() {
            Some(5)
        } else if left_shin.is_some() {
            Some(6)
        } else if right_thigh.is_some() {
            Some(7)
        } else if right_shin.is_some() {
            Some(8)
        } else {
            None
        };
        if let Some(index) = index {
            axes[index] = rotation.0 * Vec3::Z;
        }
    }
    let assist = axes[0] * torques.torso.z;
    let shoulder = axes[0] * torques.shoulder;
    let elbow = axes[1] * torques.elbow;
    let wrist = axes[2] * torques.wrist;
    let left_shoulder_torque = axes[0] * torques.left_shoulder;
    let left_elbow = axes[3] * torques.left_elbow;
    let left_wrist = axes[4] * torques.left_wrist;
    let left_hip = axes[0] * torques.left_hip;
    let left_knee = axes[5] * torques.left_knee;
    let left_ankle = axes[6] * torques.left_ankle;
    let right_hip = axes[0] * torques.right_hip;
    let right_knee = axes[7] * torques.right_knee;
    let right_ankle = axes[8] * torques.right_ankle;
    for (
        mut torque,
        _,
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
        let value = if torso.is_some() {
            assist - shoulder - left_shoulder_torque - left_hip - right_hip
        } else if upper.is_some() {
            shoulder - elbow
        } else if forearm.is_some() {
            elbow - wrist
        } else if hand.is_some() {
            wrist
        } else if left_upper.is_some() {
            left_shoulder_torque - left_elbow
        } else if left_forearm.is_some() {
            left_elbow - left_wrist
        } else if left_hand.is_some() {
            left_wrist
        } else if left_thigh.is_some() {
            left_hip - left_knee - assist / 2.0
        } else if left_shin.is_some() {
            left_knee - left_ankle
        } else if left_foot.is_some() {
            left_ankle
        } else if right_thigh.is_some() {
            right_hip - right_knee - assist / 2.0
        } else if right_shin.is_some() {
            right_knee - right_ankle
        } else if right_foot.is_some() {
            right_ankle
        } else {
            Vec3::ZERO
        };
        *torque = ConstantTorque(value);
    }
}
