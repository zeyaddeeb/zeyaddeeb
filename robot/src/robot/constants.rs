use bevy::prelude::*;
use std::f32::consts::PI;

pub const HOOP_POS: Vec3 = Vec3::new(4.0, 3.05, 0.0);
pub const HOOP_X: f32 = 4.0;
pub const HOOP_Y: f32 = 3.05;
pub const HOOP_RADIUS: f32 = 0.23;

pub const BALL_RADIUS: f32 = 0.24;

pub const TORSO_HEIGHT: f32 = 0.9;
pub const TORSO_RADIUS: f32 = 0.18;
pub const TORSO_SIZE_X: f32 = 0.28;
pub const TORSO_SIZE_Z: f32 = 0.18;
pub const UPPER_ARM_LENGTH: f32 = 0.45;
pub const UPPER_ARM_RADIUS: f32 = 0.035;
pub const FOREARM_LENGTH: f32 = 0.40;
pub const FOREARM_RADIUS: f32 = 0.03;
#[allow(dead_code)]
pub const HAND_LENGTH: f32 = 0.12;
pub const HAND_RADIUS: f32 = 0.06;
pub const THIGH_LENGTH: f32 = 0.55;
pub const THIGH_RADIUS: f32 = 0.04;
pub const SHIN_LENGTH: f32 = 0.55;
pub const SHIN_RADIUS: f32 = 0.035;
#[allow(dead_code)]
pub const FOOT_LENGTH: f32 = 0.28;
#[allow(dead_code)]
pub const FOOT_HEIGHT: f32 = 0.10;
#[allow(dead_code)]
pub const FOOT_OFFSET: f32 = 0.08;
pub const FOOT_SIZE_X: f32 = 0.28;
pub const FOOT_SIZE_Y: f32 = 0.10;
pub const FOOT_SIZE_Z: f32 = 0.16;
pub const FOOT_FORWARD_OFFSET: f32 = 0.08;
pub const HEAD_RADIUS: f32 = 0.16;
pub const NECK_HEIGHT: f32 = 0.08;

pub const TORSO_Y: f32 = 1.68;

pub const SHOULDER_OFFSET_RIGHT: Vec3 =
    Vec3::new(0.0, TORSO_HEIGHT / 2.0 - 0.10, -TORSO_SIZE_Z / 2.0 - 0.02);

pub const SHOULDER_OFFSET_LEFT: Vec3 =
    Vec3::new(0.0, TORSO_HEIGHT / 2.0 - 0.10, TORSO_SIZE_Z / 2.0 + 0.02);
pub const HIP_OFFSET_Y: f32 = -TORSO_HEIGHT / 2.0 + 0.04;
pub const HIP_OFFSET_Z: f32 = TORSO_SIZE_Z / 2.0 + 0.06;
pub const HIP_OFFSET_LEFT: Vec3 = Vec3::new(0.0, HIP_OFFSET_Y, HIP_OFFSET_Z);
pub const HIP_OFFSET_RIGHT: Vec3 = Vec3::new(0.0, HIP_OFFSET_Y, -HIP_OFFSET_Z);

pub const SHOULDER_MIN: f32 = -PI * 0.8;

pub const SHOULDER_MAX: f32 = PI * 0.6;

pub const LEFT_SHOULDER_MIN: f32 = -PI * 0.7;

pub const LEFT_SHOULDER_MAX: f32 = PI * 0.5;

pub const ELBOW_MIN: f32 = 0.0;

pub const ELBOW_MAX: f32 = PI * 0.85;

pub const LEFT_ELBOW_MAX: f32 = PI * 0.83;

pub const WRIST_MIN: f32 = -PI * 0.8;
pub const WRIST_MAX: f32 = PI * 0.8;

pub const LEFT_WRIST_MIN: f32 = -PI * 0.6;
pub const LEFT_WRIST_MAX: f32 = PI * 0.6;

pub const HIP_MIN: f32 = -PI * 0.6;
pub const HIP_MAX: f32 = PI * 0.4;

pub const KNEE_MIN: f32 = 0.0;
pub const KNEE_MAX: f32 = PI * 0.9;

pub const ANKLE_MIN: f32 = 0.0;
pub const ANKLE_MAX: f32 = 0.0;

pub const SHOULDER_TORQUE_SCALE: f32 = 25.0;
pub const ELBOW_TORQUE_SCALE: f32 = 18.0;
pub const WRIST_TORQUE_SCALE: f32 = 10.0;
pub const TORSO_TORQUE_SCALE: f32 = 30.0;
pub const HIP_TORQUE_SCALE: f32 = 45.0;
pub const KNEE_TORQUE_SCALE: f32 = 40.0;
pub const ANKLE_TORQUE_SCALE: f32 = 20.0;

pub const BOUNDS_X_MIN: f32 = -8.0;
pub const BOUNDS_X_MAX: f32 = 8.0;
pub const BOUNDS_Z_MIN: f32 = -5.0;
pub const BOUNDS_Z_MAX: f32 = 5.0;
pub const BOUNDS_Y_MIN: f32 = -1.0;
