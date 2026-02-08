use avian3d::prelude::*;
use bevy::prelude::*;
use std::time::Instant;

use super::components::*;
use super::constants::*;
use super::observation::{compute_reward_components, get_observation, RewardComponents};
use super::resources::*;
use super::state::{extract_robot_state, JointReadQuery, RobotState};
use crate::rl::{Transition, ACT_DIM, EPISODE_STEPS, MAX_EPISODES, TRAINING_ITERS};

const SHOWCASE_MAX_STEPS: usize = 240;
const WARM_EPISODES: usize = 20;
const WARM_STEPS: usize = 200;
const EXTERNAL_ACTION_TIMEOUT: f32 = 0.25;
const TORSO_FALL_Y: f32 = 0.40;
const RELEASE_THRESHOLD: f32 = 0.2;
const RELEASE_HELP_PROB: f32 = 0.02;
const RELEASE_HELP_MIN_STEP: usize = 25;
const RELEASE_HELP_MAX_STEP: usize = 90;
const WARM_STAND_STEPS: usize = 45;
const REWARD_EMA_ALPHA: f32 = 0.05;
const REWARD_MIN_SCALE: f32 = 0.1;
const WALK_REWARD_SCALE: f32 = 2.0;
const ENERGY_PENALTY_SCALE: f32 = 0.015;
const SLIP_PENALTY_SCALE: f32 = 1.0;
const FOOT_GROUND_Y: f32 = 0.12;
const SKILL_HORIZON: usize = 35;
const FORCE_THROW_EPISODES: usize = 50;
const FORCE_STAND_STEPS: usize = 40;
const MIN_WALK_SKILLS_PER_EPISODE: usize = 1;
const MIN_THROW_SKILLS_PER_EPISODE: usize = 1;
const THROW_BOOST: f32 = 0.2;
const MIN_WALK_PROB: f32 = 0.05;
const MIN_THROW_PROB: f32 = 0.05;
const EP_REWARD_EMA_ALPHA: f32 = 0.1;

const STAB_BLEND: f32 = 0.8;
const TORSO_UP_KP: f32 = 5.0;
const TORSO_UP_KD: f32 = 2.0;
const TORSO_TILT_KP: f32 = 8.0;
const TORSO_TILT_KD: f32 = 3.0;
const LEG_KP: f32 = 5.0;
const LEG_KD: f32 = 2.0;
const HIP_REST: f32 = 0.0;
const KNEE_REST: f32 = 0.05;
const ANKLE_REST: f32 = 0.0;
const MAX_JOINT_TORQUE: f32 = 10.0;
const SETTLE_STEPS: usize = 60;

fn clamp_torque(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(-MAX_JOINT_TORQUE, MAX_JOINT_TORQUE)
    } else {
        0.0
    }
}

fn update_scale(scale: &mut f32, value: f32) {
    let target = value.abs().max(REWARD_MIN_SCALE);
    *scale = (1.0 - REWARD_EMA_ALPHA) * (*scale) + REWARD_EMA_ALPHA * target;
}

fn normalize(value: f32, scale: f32) -> f32 {
    if scale > 0.0 {
        value / scale
    } else {
        0.0
    }
}

fn compute_walk_component(prev: Option<Vec3>, current: Vec3) -> f32 {
    let Some(prev) = prev else { return 0.0 };
    let delta = (current.x - prev.x).clamp(-0.05, 0.05);
    delta * WALK_REWARD_SCALE
}

fn compute_energy_component(action: &[f32]) -> f32 {
    let effort: f32 = action.iter().map(|a| a.abs()).sum();
    -effort * ENERGY_PENALTY_SCALE
}

fn compute_slip_component(
    prev_left: Option<Vec3>,
    prev_right: Option<Vec3>,
    left: Option<Vec3>,
    right: Option<Vec3>,
) -> f32 {
    let mut penalty = 0.0;
    if let (Some(prev), Some(curr)) = (prev_left, left) {
        if curr.y < FOOT_GROUND_Y {
            let slip = Vec2::new(curr.x - prev.x, curr.z - prev.z).length();
            penalty -= slip * SLIP_PENALTY_SCALE;
        }
    }
    if let (Some(prev), Some(curr)) = (prev_right, right) {
        if curr.y < FOOT_GROUND_Y {
            let slip = Vec2::new(curr.x - prev.x, curr.z - prev.z).length();
            penalty -= slip * SLIP_PENALTY_SCALE;
        }
    }
    penalty
}

fn skill_index(skill: Skill) -> usize {
    match skill {
        Skill::Stand => 0,
        Skill::Walk => 1,
        Skill::Throw => 2,
    }
}

fn softmax3(logits: [f32; 3], temperature: f32) -> [f32; 3] {
    let t = temperature.max(1e-3);
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let e0 = ((logits[0] - max) / t).exp();
    let e1 = ((logits[1] - max) / t).exp();
    let e2 = ((logits[2] - max) / t).exp();
    let sum = (e0 + e1 + e2).max(1e-6);
    [e0 / sum, e1 / sum, e2 / sum]
}

fn sample_skill(probs: [f32; 3]) -> Skill {
    let r = rand::random::<f32>();
    if r < probs[0] {
        Skill::Stand
    } else if r < probs[0] + probs[1] {
        Skill::Walk
    } else {
        Skill::Throw
    }
}

fn update_skill_policy(policy: &mut SkillPolicy, reward: f32) {
    let Some(skill) = policy.last_skill else {
        return;
    };
    let idx = skill_index(skill);
    let probs = policy.last_probs;
    let adv = reward - policy.baseline;
    policy.baseline = 0.95 * policy.baseline + 0.05 * reward;
    for i in 0..3 {
        let one_hot = if i == idx { 1.0 } else { 0.0 };
        policy.weights[i] += policy.alpha * adv * (one_hot - probs[i]);
    }
}

fn select_skill(training: &mut TrainingState) {
    let mut probs = softmax3(
        training.skill_policy.weights,
        training.skill_policy.temperature,
    );
    if probs[1] < MIN_WALK_PROB || probs[2] < MIN_THROW_PROB {
        let min_walk = MIN_WALK_PROB;
        let min_throw = MIN_THROW_PROB;
        let remaining = (1.0 - min_walk - min_throw).max(0.0);
        probs[0] = remaining;
        probs[1] = min_walk;
        probs[2] = min_throw;
    }
    let skill = if training.episode < FORCE_THROW_EPISODES {
        if training.step < FORCE_STAND_STEPS {
            Skill::Stand
        } else {
            Skill::Throw
        }
    } else if training.skill_counts[skill_index(Skill::Walk)] < MIN_WALK_SKILLS_PER_EPISODE {
        Skill::Walk
    } else if training.skill_counts[skill_index(Skill::Throw)] < MIN_THROW_SKILLS_PER_EPISODE {
        Skill::Throw
    } else {
        let boosted = [probs[0], probs[1], (probs[2] + THROW_BOOST).min(1.0)];
        let sum = (boosted[0] + boosted[1] + boosted[2]).max(1e-6);
        sample_skill([boosted[0] / sum, boosted[1] / sum, boosted[2] / sum])
    };
    training.skill_policy.last_skill = Some(skill);
    training.skill_policy.last_probs = probs;
    training.current_skill = skill;
    training.skill_step = 0;
    training.skill_reward_accum = 0.0;
    training.skill_counts[skill_index(skill)] += 1;
}

fn stand_action() -> Vec<f32> {
    vec![0.0; ACT_DIM]
}

fn walk_action(step: usize) -> Vec<f32> {
    let mut action = vec![0.0_f32; ACT_DIM];
    let phase = step as f32 * 0.15;
    let hip_amp = 0.35;
    let knee_amp = 0.45;
    let ankle_amp = 0.15;
    let left_phase = phase;
    let right_phase = phase + std::f32::consts::PI;

    action[7] = hip_amp * left_phase.sin();
    action[8] = knee_amp * left_phase.sin().max(0.0);
    action[9] = -ankle_amp * left_phase.sin();

    action[10] = hip_amp * right_phase.sin();
    action[11] = knee_amp * right_phase.sin().max(0.0);
    action[12] = -ankle_amp * right_phase.sin();

    action
}

fn combine_reward(
    training: &mut TrainingState,
    comps: RewardComponents,
    walk: f32,
    energy: f32,
    slip: f32,
) -> f32 {
    update_scale(&mut training.reward_scales.stand, comps.stand);
    update_scale(&mut training.reward_scales.walk, walk);
    update_scale(&mut training.reward_scales.throw, comps.throw);
    update_scale(&mut training.reward_scales.energy, energy);
    update_scale(&mut training.reward_scales.slip, slip);

    normalize(comps.stand, training.reward_scales.stand)
        + normalize(walk, training.reward_scales.walk)
        + normalize(comps.throw, training.reward_scales.throw)
        + normalize(energy, training.reward_scales.energy)
        + normalize(slip, training.reward_scales.slip)
}

fn warm_start_action(step: usize) -> Vec<f32> {
    let mut action = vec![0.0_f32; ACT_DIM];
    if step < 30 {
        action[0] = 0.3;
        action[1] = 0.2;
        action[2] = 0.1;
        action[3] = 0.25;
        action[4] = 0.15;
        action[5] = 0.1;
        action[6] = 0.15;
    } else if step < 60 {
        action[0] = 0.6;
        action[1] = 0.45;
        action[2] = 0.2;
        action[3] = 0.55;
        action[4] = 0.4;
        action[5] = 0.2;
        action[6] = 0.25;
    } else {
        action[0] = 0.8;
        action[1] = 0.65;
        action[2] = 0.35;
        action[3] = 0.75;
        action[4] = 0.6;
        action[5] = 0.35;
        action[6] = 0.3;
        action[13] = 0.6;
    }
    action
}

fn sanitize_action(action: &mut Vec<f32>) {
    if action.len() < ACT_DIM {
        action.resize(ACT_DIM, 0.0_f32);
    }
    for a in action.iter_mut() {
        if !a.is_finite() {
            *a = 0.0_f32;
        }
        *a = a.clamp(-1.0_f32, 1.0_f32);
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
    pub fn from_action_with_stabilization(action: &[f32], state: &RobotState) -> Self {
        let shoulder = clamp_torque(action[0] * SHOULDER_TORQUE_SCALE);
        let elbow = clamp_torque(action[1] * ELBOW_TORQUE_SCALE);
        let wrist = clamp_torque(action[2] * WRIST_TORQUE_SCALE);
        let left_shoulder = clamp_torque(action[3] * SHOULDER_TORQUE_SCALE);
        let left_elbow = clamp_torque(action[4] * ELBOW_TORQUE_SCALE);
        let left_wrist = clamp_torque(action[5] * WRIST_TORQUE_SCALE);

        let torso_stab = (-TORSO_UP_KP * state.torso.angle) + (-TORSO_UP_KD * state.torso.velocity);

        let up = state.torso_up.normalize_or_zero();
        let tilt_axis = up.cross(Vec3::Y);
        let tilt_mag = tilt_axis.length();
        let tilt_dir = if tilt_mag > 1e-4 {
            tilt_axis / tilt_mag
        } else {
            Vec3::ZERO
        };
        let tilt_torque = tilt_dir * (TORSO_TILT_KP * tilt_mag);
        let damp_xy = Vec3::new(state.torso_ang_vel.x, state.torso_ang_vel.y, 0.0) * TORSO_TILT_KD;
        let torso_xy_torque = tilt_torque - damp_xy;

        let torso = Vec3::new(
            clamp_torque(torso_xy_torque.x),
            clamp_torque(torso_xy_torque.y),
            clamp_torque(action[6] * TORSO_TORQUE_SCALE + STAB_BLEND * torso_stab),
        );

        let forward_lean = state.torso_up.x.clamp(-0.5, 0.5);
        let hip_compensation = -forward_lean * 1.2;

        let left_hip_stab = (HIP_REST + hip_compensation - state.left_hip.angle) * LEG_KP
            + (-state.left_hip.velocity * LEG_KD);
        let left_knee_stab =
            (KNEE_REST - state.left_knee.angle) * LEG_KP + (-state.left_knee.velocity * LEG_KD);
        let left_ankle_stab =
            (ANKLE_REST - state.left_ankle.angle) * LEG_KP + (-state.left_ankle.velocity * LEG_KD);
        let right_hip_stab = (HIP_REST + hip_compensation - state.right_hip.angle) * LEG_KP
            + (-state.right_hip.velocity * LEG_KD);
        let right_knee_stab =
            (KNEE_REST - state.right_knee.angle) * LEG_KP + (-state.right_knee.velocity * LEG_KD);
        let right_ankle_stab = (ANKLE_REST - state.right_ankle.angle) * LEG_KP
            + (-state.right_ankle.velocity * LEG_KD);

        Self {
            torso,
            shoulder,
            elbow,
            wrist,
            left_shoulder,
            left_elbow,
            left_wrist,
            left_hip: clamp_torque(action[7] * HIP_TORQUE_SCALE + STAB_BLEND * left_hip_stab),
            left_knee: clamp_torque(action[8] * KNEE_TORQUE_SCALE + STAB_BLEND * left_knee_stab),
            left_ankle: clamp_torque(action[9] * ANKLE_TORQUE_SCALE + STAB_BLEND * left_ankle_stab),
            right_hip: clamp_torque(action[10] * HIP_TORQUE_SCALE + STAB_BLEND * right_hip_stab),
            right_knee: clamp_torque(action[11] * KNEE_TORQUE_SCALE + STAB_BLEND * right_knee_stab),
            right_ankle: clamp_torque(
                action[12] * ANKLE_TORQUE_SCALE + STAB_BLEND * right_ankle_stab,
            ),
        }
    }
}

type TorqueWriteQuery<'w, 's> = Query<
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

fn apply_torques(query: &mut TorqueWriteQuery, torques: &ComputedTorques) {
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

#[derive(Debug, Clone, Copy)]
pub enum EpisodeEndReason {
    BallSettled,
    BallFell,
    TorsoFell,
    TimedOut,
}

impl EpisodeEndReason {
    fn check(
        ball_pos: Vec3,
        ball_vel: Vec3,
        torso_pos: Vec3,
        ball_released: bool,
        step: usize,
        max_steps: usize,
    ) -> Option<Self> {
        let ball_settled = ball_released && ball_vel.length() < 0.05 && step > 60;
        let ball_fell = ball_pos.y < -0.5;
        let torso_fell = step > SETTLE_STEPS && torso_pos.y < TORSO_FALL_Y;
        let timed_out = step >= max_steps;

        if torso_fell {
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

    fn as_str(&self) -> &'static str {
        match self {
            Self::BallSettled => "ball_settled",
            Self::BallFell => "ball_fell",
            Self::TorsoFell => "torso_fell",
            Self::TimedOut => "timed_out",
        }
    }
}

pub fn training_loop(
    mut commands: Commands,
    mut training: ResMut<TrainingState>,
    robot: Option<Res<RobotEntities>>,
    time: Res<Time>,
    mut zenoh: Option<ResMut<ZenohBridge>>,
    joint_read_q: JointReadQuery,
    mut joint_write_q: TorqueWriteQuery,
    ball_query: Query<(&Transform, &LinearVelocity), With<Basketball>>,
    left_foot_q: Query<&Transform, With<RobotLeftFoot>>,
    right_foot_q: Query<&Transform, With<RobotRightFoot>>,
) {
    if training.phase != TrainingPhase::Training {
        return;
    }

    let Some(robot) = robot else { return };

    if training.cooldown > 0 {
        training.cooldown -= 1;
    }

    let Some(state) = extract_robot_state(&joint_read_q) else {
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

    let left_foot_pos = left_foot_q.single().ok().map(|tf| tf.translation);
    let right_foot_pos = right_foot_q.single().ok().map(|tf| tf.translation);
    let walk_component = compute_walk_component(training.prev_torso_pos, state.torso_pos);
    let slip_component = compute_slip_component(
        training.prev_left_foot_pos,
        training.prev_right_foot_pos,
        left_foot_pos,
        right_foot_pos,
    );

    if let (Some(prev_obs), Some(prev_action)) =
        (training.prev_obs.clone(), training.prev_action.clone())
    {
        let comps = compute_reward_components(
            ball_pos,
            ball_v,
            training.ball_released,
            false,
            state.torso_pos,
            state.torso.angle,
            state.torso.velocity,
        );
        let energy_component = compute_energy_component(&prev_action);
        let reward = combine_reward(
            &mut training,
            comps,
            walk_component,
            energy_component,
            slip_component,
        );
        training.episode_reward += reward;
        training.skill_reward_accum += reward;

        training.sac_trainer.add_transition(Transition {
            state: prev_obs,
            action: prev_action,
            reward,
            next_state: obs.clone(),
            done: false,
        });

        if let Some(bridge) = zenoh.as_deref_mut() {
            let _ = bridge.obs_tx.send(ObservationMsg {
                obs: obs.clone(),
                reward,
                done: false,
                step: training.step as u64,
                ball_released: training.ball_released,
            });
        }
    }

    if training.step == 0 && training.skill_step == 0 {
        select_skill(&mut training);
    } else if training.skill_step >= SKILL_HORIZON {
        let skill_reward = training.skill_reward_accum;
        update_skill_policy(&mut training.skill_policy, skill_reward);
        select_skill(&mut training);
    }

    let mut action = match training.current_skill {
        Skill::Stand => stand_action(),
        Skill::Walk => walk_action(training.skill_step),
        Skill::Throw => get_action(&mut training, &obs, &time, zenoh.as_deref_mut()),
    };

    if training.current_skill == Skill::Throw
        && training.episode < WARM_EPISODES
        && training.step < WARM_STEPS
    {
        action = warm_start_action(training.step);
    }

    sanitize_action(&mut action);

    let torques = if training.step < SETTLE_STEPS {
        ComputedTorques::default()
    } else {
        ComputedTorques::from_action_with_stabilization(&action, &state)
    };
    apply_torques(&mut joint_write_q, &torques);

    let release_signal = action[13];
    let allow_release = training.current_skill == Skill::Throw
        && (training.episode >= WARM_EPISODES || training.step >= WARM_STAND_STEPS);
    let force_release = !training.ball_released
        && (RELEASE_HELP_MIN_STEP..=RELEASE_HELP_MAX_STEP).contains(&training.step)
        && rand::random::<f32>() < RELEASE_HELP_PROB;
    if !training.ball_released
        && allow_release
        && (release_signal > RELEASE_THRESHOLD || force_release)
        && training.step > 10
    {
        for grip_entity in training.grip_joints.drain(..) {
            commands.entity(grip_entity).despawn();
        }
        training.ball_released = true;
    }

    training.prev_obs = Some(obs.clone());
    training.prev_action = Some(action);
    training.prev_torso_pos = Some(state.torso_pos);
    training.prev_left_foot_pos = left_foot_pos;
    training.prev_right_foot_pos = right_foot_pos;
    training.prev_skill = Some(training.current_skill);
    training.step += 1;
    training.skill_step += 1;

    if let Some(reason) = EpisodeEndReason::check(
        ball_pos,
        ball_v,
        state.torso_pos,
        training.ball_released,
        training.step,
        EPISODE_STEPS,
    ) {
        if training.episode % 50 == 0 {
            println!(
                "  Ep {} ended at step {} ({}): torso_y={:.2}, ball_y={:.2}",
                training.episode,
                training.step,
                reason.as_str(),
                state.torso_pos.y,
                ball_pos.y
            );
        }

        let final_energy = training
            .prev_action
            .as_deref()
            .map(compute_energy_component)
            .unwrap_or(0.0);
        let final_comps = compute_reward_components(
            ball_pos,
            ball_v,
            training.ball_released,
            true,
            state.torso_pos,
            state.torso.angle,
            state.torso.velocity,
        );
        let final_reward = combine_reward(
            &mut training,
            final_comps,
            walk_component,
            final_energy,
            slip_component,
        );
        training.skill_reward_accum += final_reward;
        let skill_reward = training.skill_reward_accum;
        update_skill_policy(&mut training.skill_policy, skill_reward);

        handle_episode_end(
            &mut commands,
            &mut training,
            &robot,
            &state,
            ball_pos,
            ball_v,
            final_reward,
            zenoh.as_deref_mut(),
        );
    }
}

pub fn showcase_loop(
    mut commands: Commands,
    mut training: ResMut<TrainingState>,
    robot: Option<Res<RobotEntities>>,
    mut zenoh: Option<ResMut<ZenohBridge>>,
    joint_read_q: JointReadQuery,
    mut joint_write_q: TorqueWriteQuery,
    ball_query: Query<(&Transform, &LinearVelocity), With<Basketball>>,
    time: Res<Time>,
) {
    if training.phase != TrainingPhase::Showcasing {
        return;
    }

    let Some(robot) = robot else { return };

    if training.cooldown > 0 {
        training.cooldown -= 1;
        return;
    }

    let Some(state) = extract_robot_state(&joint_read_q) else {
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

    let mut action = get_action(&mut training, &obs, &time, zenoh.as_deref_mut());
    sanitize_action(&mut action);

    let torques = if training.step < SETTLE_STEPS {
        ComputedTorques::default()
    } else {
        ComputedTorques::from_action_with_stabilization(&action, &state)
    };
    apply_torques(&mut joint_write_q, &torques);

    let release_signal = action[13];
    if !training.ball_released && release_signal > RELEASE_THRESHOLD && training.step > 10 {
        for grip_entity in training.grip_joints.drain(..) {
            commands.entity(grip_entity).despawn();
        }
        training.ball_released = true;
    }

    training.step += 1;

    if let Some(reason) = EpisodeEndReason::check(
        ball_pos,
        ball_v,
        state.torso_pos,
        training.ball_released,
        training.step,
        SHOWCASE_MAX_STEPS,
    ) {
        println!(
            "[Showcase] Episode ended at step {} ({}): ball_pos={:.2?}",
            training.step,
            reason.as_str(),
            ball_pos
        );
        end_episode(&mut commands, &mut training, &robot);
    }
}

fn get_action(
    training: &mut TrainingState,
    obs: &[f32],
    time: &Time,
    zenoh: Option<&mut ZenohBridge>,
) -> Vec<f32> {
    if training.use_external_control {
        if let Some(bridge) = zenoh {
            let now = time.elapsed_secs();
            if let Ok(rx) = bridge.action_rx.try_lock() {
                while let Ok(msg) = rx.try_recv() {
                    bridge.last_action = msg.action;
                    bridge.last_action_at = now;
                }
            }
            if now - bridge.last_action_at > EXTERNAL_ACTION_TIMEOUT {
                training.sac_trainer.get_action(obs)
            } else {
                bridge.last_action.clone()
            }
        } else {
            training.sac_trainer.get_action(obs)
        }
    } else {
        training.sac_trainer.get_action(obs)
    }
}

fn handle_episode_end(
    commands: &mut Commands,
    training: &mut TrainingState,
    robot: &RobotEntities,
    state: &RobotState,
    ball_pos: Vec3,
    ball_v: Vec3,
    final_reward: f32,
    zenoh: Option<&mut ZenohBridge>,
) {
    training.episode_reward += final_reward;

    if let (Some(prev_obs), Some(prev_action)) =
        (training.prev_obs.clone(), training.prev_action.clone())
    {
        let obs = get_observation(
            &state.joint_angles(),
            &state.joint_velocities(),
            ball_pos,
            ball_v,
        );
        training.sac_trainer.add_transition(Transition {
            state: prev_obs,
            action: prev_action,
            reward: final_reward,
            next_state: obs.clone(),
            done: true,
        });

        if let Some(bridge) = zenoh {
            let _ = bridge.obs_tx.send(ObservationMsg {
                obs,
                reward: final_reward,
                done: true,
                step: training.step as u64,
                ball_released: training.ball_released,
            });
        }
    }

    end_episode(commands, training, robot);
}

pub fn end_episode(commands: &mut Commands, training: &mut TrainingState, _robot: &RobotEntities) {
    if let Some(ball_entity) = training.ball_entity.take() {
        commands.entity(ball_entity).despawn();
    }

    for grip_entity in training.grip_joints.drain(..) {
        commands.entity(grip_entity).despawn();
    }

    if training.episode_reward_ema_initialized {
        training.episode_reward_ema = (1.0 - EP_REWARD_EMA_ALPHA) * training.episode_reward_ema
            + EP_REWARD_EMA_ALPHA * training.episode_reward;
    } else {
        training.episode_reward_ema = training.episode_reward;
        training.episode_reward_ema_initialized = true;
    }

    if training.episode % 50 == 0 || training.phase == TrainingPhase::Showcasing {
        println!(
            "[Ep {}] reward={:.2}, ema={:.2}, steps={}, released={}, skills S/W/T={}/{}/{}, probs={:.2}/{:.2}/{:.2}",
            training.episode,
            training.episode_reward,
            training.episode_reward_ema,
            training.step,
            training.ball_released,
            training.skill_counts[0],
            training.skill_counts[1],
            training.skill_counts[2],
            training.skill_policy.last_probs[0],
            training.skill_policy.last_probs[1],
            training.skill_policy.last_probs[2]
        );
        if training.phase == TrainingPhase::Training {
            let stats = training.sac_trainer.get_stats();
            println!(
                "[Train] buffer={}, train_steps={}",
                stats.buffer_len, stats.train_steps_done
            );
        }
    }

    if training.phase == TrainingPhase::Training {
        let iters = if training.episode < WARM_EPISODES {
            TRAINING_ITERS / 2
        } else {
            TRAINING_ITERS
        };
        for _ in 0..iters {
            training.sac_trainer.request_train_steps(1);
        }
    }

    training.episode += 1;
    training.step = 0;
    training.ball_released = false;
    training.prev_obs = None;
    training.prev_action = None;
    training.prev_torso_pos = None;
    training.prev_left_foot_pos = None;
    training.prev_right_foot_pos = None;
    training.prev_skill = None;
    training.episode_reward = 0.0;
    training.cooldown = 30;
    training.skill_step = 0;
    training.skill_reward_accum = 0.0;
    training.current_skill = Skill::Stand;

    if training.phase == TrainingPhase::Training && training.episode >= MAX_EPISODES {
        println!("Training complete after {} episodes!", training.episode);
        training.phase = TrainingPhase::Showcasing;
        training.episode = 0;
    }
}

pub fn gradual_train(training: Res<TrainingState>) {
    let _progress = (training.episode as f32) / (MAX_EPISODES as f32);
}

pub fn auto_reset_training(mut training: ResMut<TrainingState>) {
    if training.phase == TrainingPhase::Showcasing && training.episode >= 5 {
        training.phase = TrainingPhase::Training;
        training.episode = 0;
        println!("[AutoReset] Returning to training phase.");
    }
}

pub fn checkpoint_system(training: Res<TrainingState>, mut timer: ResMut<CheckpointTimer>) {
    let elapsed = timer.last_save.elapsed();
    if elapsed >= CHECKPOINT_INTERVAL {
        println!("[Checkpoint] Attempting save after {:?}...", elapsed);
        training.sac_trainer.save_checkpoint();
        training.trainer.save_checkpoint();
        timer.last_save = Instant::now();
    }
}

pub fn draw_gizmos(mut gizmos: Gizmos, ball_q: Query<&Transform, With<Basketball>>) {
    let hoop_center = Vec3::new(HOOP_X, HOOP_Y, 0.0);
    gizmos.circle(hoop_center, HOOP_RADIUS, Color::srgb(1.0, 0.5, 0.0));

    if let Ok(ball_tf) = ball_q.single() {
        gizmos.line(ball_tf.translation, hoop_center, Color::srgb(0.5, 0.5, 1.0));
    }
}

pub fn ground_correction(
    mut feet_q: Query<
        (&mut Transform, &mut LinearVelocity, Option<&mut Position>),
        Or<(With<RobotLeftFoot>, With<RobotRightFoot>)>,
    >,
    mut ball_q: Query<
        (&mut Transform, &mut LinearVelocity, Option<&mut Position>),
        (
            With<Basketball>,
            Without<RobotLeftFoot>,
            Without<RobotRightFoot>,
        ),
    >,
) {
    const MIN_Y: f32 = 0.06;

    for (mut tf, mut vel, mut pos) in feet_q.iter_mut() {
        if tf.translation.y < MIN_Y {
            tf.translation.y = MIN_Y;
            if let Some(pos) = pos.as_mut() {
                pos.0.y = MIN_Y;
            }
            if vel.y < 0.0 {
                vel.y = 0.0;
            }
        }
    }

    for (mut tf, mut vel, mut pos) in ball_q.iter_mut() {
        let ball_min = BALL_RADIUS + 0.03;
        if tf.translation.y < ball_min {
            tf.translation.y = ball_min;
            if let Some(pos) = pos.as_mut() {
                pos.0.y = ball_min;
            }
            if vel.y < 0.0 {
                vel.y = 0.0;
            }
        }
    }
}
