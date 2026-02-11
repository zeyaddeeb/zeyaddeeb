use bevy::prelude::*;
use std::f32::consts::PI;

use super::constants::HOOP_POS;
use super::resources::CurriculumStage;

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

#[cfg(feature = "wasm")]
pub fn compute_reward_components(
    ball_pos: Vec3,
    _ball_vel: Vec3,
    ball_released: bool,
    done: bool,
    torso_pos: Vec3,
    torso_up: Vec3,
    left_foot_pos: Vec3,
    right_foot_pos: Vec3,
    stage: CurriculumStage,
) -> (RewardComponents, bool) {
    let mut stand_reward = 0.0;
    let mut throw_reward = 0.0;
    let mut stage_success = false;

    let uprightness = torso_up.y.max(0.0);
    stand_reward += uprightness * 2.0;

    if uprightness < 0.9 {
        stand_reward -= (0.9 - uprightness) * 5.0;
    }
    if uprightness < 0.7 {
        stand_reward -= 3.0;
    }

    let target_height = 1.5;
    let height_diff = (torso_pos.y - target_height).abs();
    if height_diff < 0.3 {
        stand_reward += 0.5 * (1.0 - height_diff / 0.3);
    }

    if torso_pos.y < 1.0 {
        stand_reward -= 3.0;
    }
    if torso_pos.y < 0.8 {
        stand_reward -= 5.0;
    }

    if torso_pos.y < 0.4 && done {
        stand_reward -= 50.0;
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

    let avg_foot_x = (left_foot_pos.x + right_foot_pos.x) / 2.0;
    if avg_foot_x > torso_pos.x + 0.3 {
        stand_reward -= 2.0;
    }

    stand_reward -= 0.01;

    match stage {
        CurriculumStage::Standing => {
            if uprightness > 0.9 && torso_pos.y > 1.2 && feet_grounded {
                stand_reward += 1.0;
                stage_success = !done || torso_pos.y > 1.0;
            }
        }
        CurriculumStage::ApproachBall => {
            let dist_to_ball = (torso_pos - ball_pos).length();
            if dist_to_ball < 2.0 {
                throw_reward += 2.0 * (1.0 - dist_to_ball / 2.0);
            }
            if dist_to_ball < 0.5 {
                throw_reward += 5.0;
                stage_success = true;
            }
        }
        CurriculumStage::Shooting => {
            let dist = (ball_pos - HOOP_POS).length();
            let basket_made = dist < 0.3;

            if basket_made {
                throw_reward = 1000.0;
                stage_success = true;
            }

            if dist < 1.0 && ball_released {
                throw_reward += 10.0 * (1.0 - dist);
            }

            if ball_released && ball_pos.y > 2.0 {
                let height_bonus = (ball_pos.y - 2.0).min(2.0) * 2.0;
                throw_reward += height_bonus;
            }
        }
    }

    (
        RewardComponents {
            stand: stand_reward,
            throw: throw_reward,
        },
        stage_success,
    )
}

#[cfg(feature = "native")]
pub fn compute_reward_components_curriculum(
    ball_pos: Vec3,
    _ball_vel: Vec3,
    ball_released: bool,
    done: bool,
    torso_pos: Vec3,
    torso_up: Vec3,
    left_foot_pos: Vec3,
    right_foot_pos: Vec3,
    stage: CurriculumStage,
) -> (RewardComponents, bool) {
    let mut stand_reward = 0.0;
    let mut throw_reward = 0.0;
    let mut stage_success = false;

    let uprightness = torso_up.y.max(0.0);
    stand_reward += uprightness * 2.0;

    if uprightness < 0.9 {
        stand_reward -= (0.9 - uprightness) * 5.0;
    }
    if uprightness < 0.7 {
        stand_reward -= 3.0;
    }

    let target_height = 1.5;
    let height_diff = (torso_pos.y - target_height).abs();
    if height_diff < 0.3 {
        stand_reward += 0.5 * (1.0 - height_diff / 0.3);
    }

    if torso_pos.y < 1.0 {
        stand_reward -= 3.0;
    }
    if torso_pos.y < 0.8 {
        stand_reward -= 5.0;
    }

    if torso_pos.y < 0.4 && done {
        stand_reward -= 50.0;
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

    let avg_foot_x = (left_foot_pos.x + right_foot_pos.x) / 2.0;
    if avg_foot_x > torso_pos.x + 0.3 {
        stand_reward -= 2.0;
    }

    stand_reward -= 0.01;

    match stage {
        CurriculumStage::Standing => {
            if uprightness > 0.9 && torso_pos.y > 1.2 && feet_grounded {
                stand_reward += 1.0;
                stage_success = !done || torso_pos.y > 1.0;
            }
        }
        CurriculumStage::ApproachBall => {
            let dist_to_ball = (torso_pos - ball_pos).length();
            if dist_to_ball < 2.0 {
                throw_reward += 2.0 * (1.0 - dist_to_ball / 2.0);
            }
            if dist_to_ball < 0.5 {
                throw_reward += 5.0;
                stage_success = true;
            }
        }
        CurriculumStage::Shooting => {
            let dist = (ball_pos - HOOP_POS).length();
            let basket_made = dist < 0.3;

            if basket_made {
                throw_reward = 1000.0;
                stage_success = true;
            }

            if dist < 1.0 && ball_released {
                throw_reward += 10.0 * (1.0 - dist);
            }

            if ball_released && ball_pos.y > 2.0 {
                let height_bonus = (ball_pos.y - 2.0).min(2.0) * 2.0;
                throw_reward += height_bonus;
            }
        }
    }

    (
        RewardComponents {
            stand: stand_reward,
            throw: throw_reward,
        },
        stage_success,
    )
}
