use avian3d::prelude::*;
use bevy::prelude::*;

use super::components::*;
use super::constants::*;
use super::observation::{compute_reward_components_curriculum, get_observation};
use super::resources::*;
use super::state::{extract_robot_state, JointReadQuery};
use super::torque::{apply_torques, ComputedTorques, TorqueWriteQuery};
#[cfg(feature = "native")]
use crate::rl::{Transition, ACT_DIM};

const TORSO_FALL_Y: f32 = 0.40;
const SETTLE_STEPS: usize = 60;
const BOUNDS_SIZE: f32 = 5.0;

#[derive(Debug, Clone, Copy)]
pub enum EpisodeEndReason {
    BallSettled,
    BallFell,
    TorsoFell,
    TimedOut,
    OutOfBounds,
    BasketMade,
}

fn is_out_of_bounds(pos: Vec3) -> bool {
    pos.x.abs() > BOUNDS_SIZE || pos.z.abs() > BOUNDS_SIZE
}

impl EpisodeEndReason {
    fn check(
        ball_pos: Vec3,
        ball_vel: Vec3,
        torso_pos: Vec3,
        ball_released: bool,
        basket_made: bool,
        step: usize,
        max_steps: usize,
    ) -> Option<Self> {
        let ball_settled = ball_released && ball_vel.length() < 0.05 && step > 60;
        let ball_fell = ball_pos.y < -0.5;
        let torso_fell = step > SETTLE_STEPS && torso_pos.y < TORSO_FALL_Y;
        let timed_out = step >= max_steps;
        let out_of_bounds = is_out_of_bounds(torso_pos) || is_out_of_bounds(ball_pos);

        if basket_made {
            Some(Self::BasketMade)
        } else if out_of_bounds {
            Some(Self::OutOfBounds)
        } else if torso_fell {
            Some(Self::TorsoFell)
        } else if ball_fell {
            Some(Self::BallFell)
        } else if ball_settled {
            Some(Self::BallSettled)
        } else if timed_out {
            Some(Self::TimedOut)
        } else {
            None
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::BallSettled => "ball_settled",
            Self::BallFell => "ball_fell",
            Self::TorsoFell => "torso_fell",
            Self::TimedOut => "timed_out",
            Self::OutOfBounds => "out_of_bounds",
            Self::BasketMade => "basket_made",
        }
    }
}

pub fn training_loop(
    #[cfg(feature = "native")] _commands: Commands,
    #[cfg(feature = "native")] mut training: ResMut<TrainingState>,
    #[cfg(feature = "native")] robot: Option<Res<RobotEntities>>,
    #[cfg(feature = "native")] _time: Res<Time>,
    #[cfg(feature = "native")] mut zenoh: Option<ResMut<ZenohBridge>>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery)>,
    ball_query: Query<(&Transform, &LinearVelocity), With<Basketball>>,
) {
    #[cfg(not(feature = "native"))]
    {
        return;
    }

    #[cfg(feature = "native")]
    {
        if training.phase != TrainingPhase::Training {
            return;
        }

        let Some(_robot) = robot else { return };

        if training.cooldown > 0 {
            training.cooldown -= 1;
            return;
        }

        let state = {
            let q = queries.p0();
            extract_robot_state(&q)
        };

        let Some(state) = state else {
            return;
        };

        let Ok((ball_tf, ball_vel)) = ball_query.single() else {
            return;
        };

        let ball_pos = ball_tf.translation;
        let ball_v = Vec3::new(ball_vel.x, ball_vel.y, ball_vel.z);

        let obs = get_observation(
            &state.joint_angles(),
            &state.joint_velocities(),
            ball_pos,
            ball_v,
        );

        let dist_to_hoop = (ball_pos - HOOP_POS).length();
        let basket_made = dist_to_hoop < 0.3;

        let end_reason = EpisodeEndReason::check(
            ball_pos,
            ball_v,
            state.torso_pos,
            training.ball_released,
            basket_made,
            training.step,
            crate::rl::EPISODE_STEPS,
        );

        if let (Some(prev_obs), Some(prev_action)) =
            (training.prev_obs.clone(), training.prev_action.clone())
        {
            let (comps, stage_success) = compute_reward_components_curriculum(
                ball_pos,
                ball_v,
                training.ball_released,
                false,
                state.torso_pos,
                state.torso_up,
                state.left_foot_pos,
                state.right_foot_pos,
                training.curriculum_stage,
            );

            if stage_success {
                training.stage_success_streak += 1;
            } else {
                training.stage_success_streak = 0;
            }

            let reward = comps.stand + comps.throw;

            training.episode_reward += reward;

            training.sac_trainer.add_transition(Transition {
                state: prev_obs,
                action: prev_action,
                reward,
                next_state: obs.clone(),
                done: end_reason.is_some(),
            });

            if let Some(bridge) = zenoh.as_deref_mut() {
                let _ = bridge.obs_tx.send(ObservationMsg {
                    step: training.step as u64,
                    obs: obs.clone(),
                    reward,
                    done: end_reason.is_some(),
                    ball_released: training.ball_released,
                });
            }
        }

        let mut action = if training.episode < 10 {
            (0..ACT_DIM)
                .map(|_| rand::random::<f32>() * 2.0 - 1.0)
                .collect()
        } else {
            training.sac_trainer.get_action(&obs)
        };

        if action.len() < ACT_DIM {
            action.resize(ACT_DIM, 0.0);
        }
        for a in action.iter_mut() {
            if !a.is_finite() {
                *a = 0.0;
            }
            *a = a.clamp(-1.0, 1.0);
        }

        let torques = ComputedTorques::from_action(&action);
        {
            let mut q = queries.p1();
            apply_torques(&mut q, &torques);
        }

        let release_signal = action[13];
        if !training.ball_released && release_signal > 0.0 {
            training.ball_released = true;
        }

        training.prev_obs = Some(obs.clone());
        training.prev_action = Some(action);
        training.prev_torso_pos = Some(state.torso_pos);
        training.step += 1;

        if let Some(reason) = end_reason {
            if !training.episode_reward_ema_initialized {
                training.episode_reward_ema = training.episode_reward;
                training.episode_reward_ema_initialized = true;
            } else {
                training.episode_reward_ema =
                    0.95 * training.episode_reward_ema + 0.05 * training.episode_reward;
            }

            let is_best = training.episode_reward > training.best_episode_reward;
            if is_best {
                training.best_episode_reward = training.episode_reward;
            }

            if basket_made {
                training.baskets_made += 1;
            }

            let should_log = (training.episode + 1) % 50 == 0 || is_best || basket_made;
            if should_log {
                info!(
                "Episode {} [{}] ended: {} | Reward: {:.2} | EMA: {:.2} | Best: {:.2} | Baskets: {}/{} ({:.1}%)",
                training.episode,
                training.curriculum_stage.as_str(),
                reason.as_str(),
                training.episode_reward,
                training.episode_reward_ema,
                training.best_episode_reward,
                training.baskets_made,
                training.episode + 1,
                (training.baskets_made as f32 / (training.episode + 1) as f32) * 100.0
            );
            }

            if (training.episode + 1) % 10 == 0 || is_best {
                info!("[Checkpoint] Saving at episode {}...", training.episode + 1);
                training.sac_trainer.save_checkpoint();

                if let Ok(agent) = training.sac_trainer.agent.lock() {
                    let buffer_path =
                        std::path::Path::new("checkpoints_sac").join("sac_buffer.bin");
                    if let Err(e) = agent.replay_buffer.save(&buffer_path) {
                        warn!("Failed to save replay buffer: {}", e);
                    } else {
                        info!(
                            "[Checkpoint] Saved replay buffer ({} samples)",
                            agent.replay_buffer.len()
                        );
                    }
                }
            }

            training.stage_episodes += 1;
            let success_threshold = 5;
            let min_episodes_per_stage = 100;

            if training.stage_episodes >= min_episodes_per_stage
                && training.stage_success_streak >= success_threshold
            {
                let next_stage = match training.curriculum_stage {
                    CurriculumStage::Standing => {
                        info!(
                        "[Curriculum] Advancing to ApproachBall after {} episodes with {} successes!",
                        training.stage_episodes,
                        training.stage_success_streak
                    );
                        Some(CurriculumStage::ApproachBall)
                    }
                    CurriculumStage::ApproachBall => {
                        info!(
                        "[Curriculum] Advancing to Shooting after {} episodes with {} successes!",
                        training.stage_episodes,
                        training.stage_success_streak
                    );
                        Some(CurriculumStage::Shooting)
                    }
                    CurriculumStage::Shooting => None,
                };

                if let Some(stage) = next_stage {
                    training.curriculum_stage = stage;
                    training.stage_episodes = 0;
                    training.stage_success_streak = 0;
                }
            }

            training.needs_reset = true;
            training.cooldown = 30;
            training.episode += 1;
            training.step = 0;
            training.episode_reward = 0.0;
            training.ball_released = false;
            training.prev_obs = None;
            training.prev_action = None;
        }
    }
}
