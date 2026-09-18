use bevy::prelude::*;
use std::f32::consts::PI;

use super::constants::HOOP_POS;
use super::episode::shot_miss_distance;
use super::resources::CurriculumStage;
use super::state::RobotState;

#[derive(Debug, Clone, Copy, Default)]
pub struct RewardComponents {
    pub stand: f32,
    pub throw: f32,
}

pub fn get_observation(
    state: &RobotState,
    ball_pos: Vec3,
    ball_vel: Vec3,
    ball_released: bool,
) -> Vec<f32> {
    let joint_angles = state.joint_angles();
    let joint_vels = state.joint_velocities();
    let mut obs = Vec::with_capacity(joint_angles.len() * 2 + 20);

    for (angle, vel) in joint_angles.iter().zip(&joint_vels) {
        obs.push(angle / PI);
        obs.push((vel / 10.0).clamp(-5.0, 5.0));
    }

    obs.push(state.torso_pos.y - 1.0);
    obs.extend(state.torso_up.to_array());
    obs.extend((state.torso_lin_vel / 5.0).clamp_length_max(5.0).to_array());
    obs.extend(
        (state.torso_ang_vel / 10.0)
            .clamp_length_max(5.0)
            .to_array(),
    );

    obs.extend(((ball_pos - state.torso_pos) / 5.0).to_array());
    obs.extend((ball_vel / 15.0).clamp_length_max(5.0).to_array());
    obs.extend(((HOOP_POS - state.torso_pos) / 5.0).to_array());
    obs.push(if ball_released { 1.0 } else { -1.0 });

    obs
}

pub fn compute_reward_components(
    state: &RobotState,
    action: &[f32],
    ball_pos: Vec3,
    ball_vel: Vec3,
    ball_released: bool,
    stage: CurriculumStage,
) -> RewardComponents {
    let torso_pos = state.torso_pos;
    let left_foot_pos = state.left_foot_pos;
    let right_foot_pos = state.right_foot_pos;
    let mut stand_reward = 0.0;
    let mut throw_reward = 0.0;

    let uprightness = state.torso_up.y.max(0.0);
    stand_reward += uprightness * 2.0;

    if uprightness < 0.9 {
        stand_reward -= (0.9 - uprightness) * 5.0;
    }

    let target_height = 1.5;
    let height_diff = (torso_pos.y - target_height).abs();
    if height_diff < 0.3 {
        stand_reward += 0.5 * (1.0 - height_diff / 0.3);
    }

    let feet_grounded = left_foot_pos.y < 0.15 && right_foot_pos.y < 0.15;
    let feet_under_body =
        (left_foot_pos.x - torso_pos.x).abs() < 0.5 && (right_foot_pos.x - torso_pos.x).abs() < 0.5;
    if feet_grounded {
        stand_reward += 0.3;
    }
    if feet_grounded && feet_under_body {
        stand_reward += 0.5;
    }
    if uprightness > 0.9 && torso_pos.y > 1.2 && feet_grounded {
        stand_reward += 1.0;
    }

    stand_reward -= state.torso_lin_vel.length().min(2.0) * 0.5;

    let effort = action.iter().map(|a| a * a).sum::<f32>() / action.len().max(1) as f32;
    stand_reward -= 0.5 * effort;

    if ball_released {
        throw_reward += RAISE_REWARD;
    } else if stage != CurriculumStage::Standing {
        throw_reward += RAISE_REWARD * (ball_pos.y - 1.5).clamp(0.0, 1.0);
        if stage == CurriculumStage::Shooting {
            throw_reward += AIM_REWARD * shot_quality(ball_pos, ball_vel);
        }
    }

    RewardComponents {
        stand: stand_reward,
        throw: throw_reward,
    }
}

pub const BASKET_REWARD: f32 = 50.0;
pub const RELEASE_REWARD: f32 = 300.0;
const AIM_REWARD: f32 = 3.0;
const RAISE_REWARD: f32 = 2.0;

fn shot_quality(ball_pos: Vec3, ball_vel: Vec3) -> f32 {
    let miss = shot_miss_distance(ball_pos, ball_vel);
    0.5 * (1.0 - miss / 4.0).max(0.0) + 0.5 * (-2.0 * miss).exp()
}

pub fn release_reward(ball_pos: Vec3, ball_vel: Vec3) -> f32 {
    RELEASE_REWARD * shot_quality(ball_pos, ball_vel)
}
