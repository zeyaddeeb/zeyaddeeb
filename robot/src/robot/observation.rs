use bevy::prelude::*;
use std::f32::consts::PI;

use super::constants::HOOP_POS;

#[derive(Debug, Clone, Copy, Default)]
pub struct RewardComponents {
    pub stand: f32,
    pub throw: f32,
}

pub fn get_observation(
    joint_angles: &[f32],
    joint_vels: &[f32],
    ball_pos: Vec3,
    ball_vel: Vec3,
) -> Vec<f32> {
    let joint_count = joint_angles.len().min(joint_vels.len());
    let mut obs = Vec::with_capacity(joint_count * 2 + 9);

    for i in 0..joint_count {
        obs.push(joint_angles[i] / PI);
        obs.push(joint_vels[i] / 10.0);
    }

    obs.push((ball_pos.x - HOOP_POS.x) / 5.0);
    obs.push((ball_pos.y - HOOP_POS.y) / 5.0);
    obs.push((ball_pos.z - HOOP_POS.z) / 5.0);

    obs.push(ball_vel.x / 15.0);
    obs.push(ball_vel.y / 15.0);
    obs.push(ball_vel.z / 15.0);

    obs.push(HOOP_POS.x / 5.0);
    obs.push(HOOP_POS.y / 5.0);
    obs.push(HOOP_POS.z / 5.0);

    obs
}

pub fn compute_reward_components(
    ball_pos: Vec3,
    ball_vel: Vec3,
    ball_released: bool,
    done: bool,
    torso_pos: Vec3,
    torso_angle: f32,
    torso_ang_vel: f32,
) -> RewardComponents {
    let dist = (ball_pos - HOOP_POS).length();

    let upright = 1.0 - (torso_angle.abs() / (PI / 3.0)).clamp(0.0, 1.0);
    let upright_reward = upright * 4.0;
    let height_reward = ((torso_pos.y - 0.6) / 0.6).clamp(0.0, 1.0) * 4.0;
    let stability_reward = (1.0 - (torso_ang_vel.abs() / 6.0).clamp(0.0, 1.0)) * 1.0;

    let mut stand_reward = upright_reward + height_reward + stability_reward;
    let release_reward = if ball_released { 1.0 } else { 0.0 };
    let standing_bonus = if torso_pos.y > 0.7 {
        1.5
    } else if torso_pos.y > 0.6 {
        0.8
    } else if torso_pos.y > 0.5 {
        0.3
    } else {
        0.0
    };
    let low_height_penalty = if torso_pos.y < 0.4 { -0.15 } else { 0.0 };
    let ang_vel_penalty = -(torso_ang_vel.abs() / 8.0).clamp(0.0, 1.0) * 0.1;
    stand_reward += standing_bonus + low_height_penalty + ang_vel_penalty;

    if !ball_released {
        stand_reward += if done { -2.0 } else { 0.02 };
        return RewardComponents {
            stand: stand_reward,
            throw: 0.0,
        };
    }

    let dist_reward = -dist * 0.2;

    let score_bonus = if dist < 0.3 {
        160.0
    } else if dist < 0.6 {
        50.0
    } else if dist < 1.0 {
        18.0
    } else if dist < 2.0 {
        6.0
    } else {
        0.0
    };

    let dir_to_hoop = (HOOP_POS - ball_pos).normalize_or_zero();
    let vel_alignment = ball_vel.normalize_or_zero().dot(dir_to_hoop).max(0.0);
    let direction_reward = vel_alignment * 3.5;

    let ball_height_reward = if ball_pos.y > HOOP_POS.y {
        8.0
    } else {
        (ball_pos.y / HOOP_POS.y).max(0.0) * 3.0
    };

    let ground_penalty = if ball_pos.y < 0.15 && done { -3.0 } else { 0.0 };

    let fall_penalty = if torso_pos.y < 0.5 && done { -6.0 } else { 0.0 };

    let throw_reward = release_reward
        + dist_reward
        + score_bonus
        + direction_reward
        + ball_height_reward
        + ground_penalty;

    if done {
        stand_reward += fall_penalty;
    }

    RewardComponents {
        stand: stand_reward,
        throw: throw_reward,
    }
}

#[allow(dead_code)]
pub fn compute_reward(
    ball_pos: Vec3,
    ball_vel: Vec3,
    ball_released: bool,
    done: bool,
    torso_pos: Vec3,
    torso_angle: f32,
    torso_ang_vel: f32,
) -> f32 {
    let comps = compute_reward_components(
        ball_pos,
        ball_vel,
        ball_released,
        done,
        torso_pos,
        torso_angle,
        torso_ang_vel,
    );
    comps.stand + comps.throw
}
