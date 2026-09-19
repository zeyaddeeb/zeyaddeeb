use bevy::prelude::*;

use super::episode::*;
use super::observation::{
    compute_reward_components, get_observation, release_reward, BASKET_REWARD,
};
use super::reset::release_ball;
use super::resources::*;
use super::state::{extract_robot_state, BallQuery, JointReadQuery};
use super::torque::{apply_torques, ComputedTorques, TorqueWriteQuery};
#[cfg(feature = "native")]
use crate::rl::{Transition, ACT_DIM};

pub fn training_loop(
    #[cfg(feature = "native")] mut training: ResMut<TrainingState>,
    #[cfg(feature = "native")] robot: Option<Res<RobotEntities>>,
    #[cfg(feature = "native")] mut zenoh: Option<ResMut<ZenohBridge>>,
    #[cfg(feature = "native")] mut commands: Commands,
    #[cfg(feature = "native")] mut grip: Option<ResMut<BallGrip>>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery, BallQuery)>,
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

        if training.needs_reset {
            return;
        }

        if training.cooldown > 0 {
            training.cooldown -= 1;
            return;
        }

        training.ball_released |= grip.as_deref().is_some_and(|grip| grip.released);

        let state = {
            let q = queries.p0();
            extract_robot_state(&q)
        };

        let Some(state) = state else {
            return;
        };

        let (ball_pos, ball_v) = {
            let q = queries.p2();
            let Ok((pos, lin_vel, _)) = q.single() else {
                return;
            };
            (pos.0, lin_vel.0)
        };

        let obs = get_observation(
            &state,
            ball_pos,
            ball_v,
            training.ball_released,
            training.curriculum_stage,
            training.step,
        );

        let end_reason = EpisodeEndReason::check(
            ball_pos,
            training.prev_ball_pos,
            state.torso_pos,
            state.torso_up,
            training.ball_released,
            training.step,
            crate::rl::EPISODE_STEPS,
        );
        let terminal = end_reason.is_some_and(|r| r.is_terminal());

        if let (Some(prev_obs), Some(prev_action)) =
            (training.prev_obs.take(), training.prev_action.take())
        {
            let comps = compute_reward_components(
                &state,
                &prev_action,
                ball_pos,
                ball_v,
                training.ball_released,
                training.curriculum_stage,
            );

            let mut reward = comps.stand + comps.throw;
            if training.ball_released
                && training.steps_since_release == 0
                && grip.as_deref().is_none_or(|grip| !grip.dropped)
            {
                reward += release_reward(ball_pos, ball_v);
                let miss = shot_miss_distance(ball_pos, ball_v);
                training.shot_miss_ema = Some(
                    training
                        .shot_miss_ema
                        .map_or(miss, |ema| 0.95 * ema + 0.05 * miss),
                );
            }
            if !training.ball_released {
                training.episode_best_aim = training
                    .episode_best_aim
                    .min(shot_miss_distance(ball_pos, ball_v));
            }
            if end_reason == Some(EpisodeEndReason::BasketMade) {
                reward += BASKET_REWARD;
            } else if end_reason.is_some() && training.curriculum_stage == CurriculumStage::Shooting
            {
                reward -= 5.0;
            }

            training.episode_reward += reward;

            if let Some(bridge) = zenoh.as_deref_mut() {
                let _ = bridge.obs_tx.send(ObservationMsg {
                    protocol_version: crate::rl::ENVIRONMENT_VERSION,
                    episode: training.episode as u64,
                    request_id: training.step as u64,
                    step: training.step as u64,
                    obs: obs.clone(),
                    reward,
                    done: end_reason.is_some(),
                    truncated: end_reason.is_some() && !terminal,
                    ball_released: training.ball_released,
                });
            }

            let transition = Transition {
                state: prev_obs,
                action: prev_action,
                reward,
                next_state: obs.clone(),
                done: terminal,
            };
            if training.headless {
                training.sac_trainer.add_transition_blocking(transition);
            } else {
                training.sac_trainer.add_transition(transition);
            }
        }

        if let Some(reason) = end_reason {
            finish_episode(&mut training, reason, ball_pos);
            let mut q = queries.p1();
            apply_torques(&mut q, &ComputedTorques::default());
            return;
        }

        let warming_up = training.sac_trainer.needs_random_warmup();
        let mut action = if warming_up {
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

        if training.ball_released {
            training.steps_since_release += 1;
        } else if should_release(training.curriculum_stage, training.step, action[13]) {
            training.ball_released = true;
            if let Some(grip) = grip.as_deref_mut() {
                release_ball(&mut commands, grip);
            }
        }

        training.prev_obs = Some(obs);
        training.prev_action = Some(action);
        training.prev_ball_pos = Some(ball_pos);
        training.prev_torso_pos = Some(state.torso_pos);
        training.step += 1;
    }
}

#[cfg(feature = "native")]
fn finish_episode(training: &mut TrainingState, reason: EpisodeEndReason, ball_pos: Vec3) {
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

    if reason == EpisodeEndReason::BasketMade {
        training.baskets_made += 1;
    }

    if (training.episode + 1).is_multiple_of(25) || reason == EpisodeEndReason::BasketMade {
        info!(
            "Episode {} [{}] ended: {} after {} steps | Reward: {:.2} | EMA: {:.2} | Best: {:.2} | Baskets: {}/{} | Shot miss: {:.2} m | Best aim while holding: {:.2} m | Train steps: {}",
            training.episode,
            training.curriculum_stage.as_str(),
            reason.as_str(),
            training.step,
            training.episode_reward,
            training.episode_reward_ema,
            training.best_episode_reward,
            training.baskets_made,
            training.episode + 1,
            training.shot_miss_ema.unwrap_or(f32::NAN),
            training.best_aim_ema.unwrap_or(f32::NAN),
            training.sac_trainer.get_stats().train_steps_done
        );
    }

    training
        .sac_trainer
        .record_episode(training.episode_reward, training.curriculum_stage.index());

    if reason.is_stage_success(training.curriculum_stage, ball_pos) {
        training.stage_success_streak += 1;
    } else {
        training.stage_success_streak = 0;
    }
    training.stage_episodes += 1;

    if training.stage_episodes >= STAGE_MIN_EPISODES
        && training.stage_success_streak >= STAGE_SUCCESS_STREAK
    {
        if let Some(stage) = next_stage(training.curriculum_stage) {
            info!(
                "[Curriculum] Advancing to {} after {} episodes",
                stage.as_str(),
                training.stage_episodes
            );
            training.curriculum_stage = stage;
            training.stage_episodes = 0;
            training.stage_success_streak = 0;
        }
    }

    let aim = training.episode_best_aim;
    if aim.is_finite() {
        training.best_aim_ema = Some(
            training
                .best_aim_ema
                .map_or(aim, |ema| 0.95 * ema + 0.05 * aim),
        );
    }
    training.episode_best_aim = f32::INFINITY;

    training.needs_reset = true;
    training.cooldown = RESET_COOLDOWN;
    training.episode += 1;
    training
        .sac_trainer
        .set_progress(crate::rl::TrainingProgress {
            episodes: training.episode,
            curriculum_stage: training.curriculum_stage.index(),
            stage_episodes: training.stage_episodes,
            stage_success_streak: training.stage_success_streak,
            baskets_made: training.baskets_made,
        });
    if training.episode.is_multiple_of(200) {
        training.sac_trainer.save_checkpoint();
    }
    training.step = 0;
    training.episode_reward = 0.0;
    training.ball_released = false;
    training.steps_since_release = 0;
    training.prev_ball_pos = None;
    training.prev_obs = None;
    training.prev_action = None;
}
