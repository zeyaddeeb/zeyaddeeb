use candle_core::{DType, Device, Result as CResult, Tensor, Var};
use candle_nn::{AdamW, Optimizer, ParamsAdamW, VarBuilder, VarMap};
use std::path::Path;

use super::buffer::ReplayBuffer;
use super::config::*;
use super::networks::{CriticNet, PolicyNet};

pub const SAC_CHECKPOINT_DIR: &str = "checkpoints_sac";

const POLICY_CHECKPOINT: &str = "sac_policy.safetensors";
const Q1_CHECKPOINT: &str = "sac_q1.safetensors";
const Q2_CHECKPOINT: &str = "sac_q2.safetensors";
const TARGET_Q1_CHECKPOINT: &str = "sac_target_q1.safetensors";
const TARGET_Q2_CHECKPOINT: &str = "sac_target_q2.safetensors";
const ALPHA_CHECKPOINT: &str = "sac_alpha.safetensors";
const BUFFER_CHECKPOINT: &str = "sac_buffer.bin";

const LOG_PROB_EPS: f32 = 1e-6;
const LOG_2PI: f32 = 1.8378771;

fn copy_varmap(src: &VarMap, dst: &VarMap) {
    let src_data = src.data().lock().unwrap();
    let mut dst_data = dst.data().lock().unwrap();
    for (name, src_var) in src_data.iter() {
        if let Some(dst_var) = dst_data.get_mut(name) {
            dst_var.set(&src_var.as_tensor().detach()).ok();
        }
    }
}

fn soft_update_varmap(src: &VarMap, dst: &VarMap, tau: f64) {
    let src_data = src.data().lock().unwrap();
    let mut dst_data = dst.data().lock().unwrap();
    for (name, src_var) in src_data.iter() {
        if let Some(dst_var) = dst_data.get_mut(name) {
            let src_t = src_var.as_tensor();
            let dst_t = dst_var.as_tensor();
            if let Ok(blended) =
                (tau * src_t).and_then(|a| ((1.0 - tau) * dst_t).and_then(|b| &a + &b))
            {
                dst_var.set(&blended.detach()).ok();
            }
        }
    }
}

pub struct SACAgent {
    policy_varmap: VarMap,
    policy: PolicyNet,

    q1_varmap: VarMap,
    q1: CriticNet,
    q2_varmap: VarMap,
    q2: CriticNet,

    target_q1_varmap: VarMap,
    target_q1: CriticNet,
    target_q2_varmap: VarMap,
    target_q2: CriticNet,

    policy_optim: AdamW,
    q1_optim: AdamW,
    q2_optim: AdamW,

    log_alpha: Var,
    alpha_optim: AdamW,
    target_entropy: f32,

    pub replay_buffer: ReplayBuffer,

    pub is_training: bool,
}

impl SACAgent {
    pub fn new_or_load(checkpoint_dir: &str) -> CResult<Self> {
        let checkpoint_path = Path::new(checkpoint_dir);
        if checkpoint_path.join(POLICY_CHECKPOINT).exists() {
            Self::new_internal(Some(checkpoint_dir))
        } else {
            Self::new_internal(None)
        }
    }

    fn new_internal(checkpoint_dir: Option<&str>) -> CResult<Self> {
        let dev = Device::Cpu;

        let mut policy_varmap = VarMap::new();
        let policy_vb = VarBuilder::from_varmap(&policy_varmap, DType::F32, &dev);
        let policy = PolicyNet::new(&policy_vb)?;

        let mut q1_varmap = VarMap::new();
        let q1_vb = VarBuilder::from_varmap(&q1_varmap, DType::F32, &dev);
        let q1 = CriticNet::new(&q1_vb)?;

        let mut q2_varmap = VarMap::new();
        let q2_vb = VarBuilder::from_varmap(&q2_varmap, DType::F32, &dev);
        let q2 = CriticNet::new(&q2_vb)?;

        let mut target_q1_varmap = VarMap::new();
        let target_q1_vb = VarBuilder::from_varmap(&target_q1_varmap, DType::F32, &dev);
        let target_q1 = CriticNet::new(&target_q1_vb)?;

        let mut target_q2_varmap = VarMap::new();
        let target_q2_vb = VarBuilder::from_varmap(&target_q2_varmap, DType::F32, &dev);
        let target_q2 = CriticNet::new(&target_q2_vb)?;

        if let Some(dir) = checkpoint_dir {
            let path = Path::new(dir);
            if path.join(POLICY_CHECKPOINT).exists() {
                println!("[SAC] Loading checkpoint from {}", dir);
                policy_varmap.load(path.join(POLICY_CHECKPOINT))?;
                q1_varmap.load(path.join(Q1_CHECKPOINT))?;
                q2_varmap.load(path.join(Q2_CHECKPOINT))?;
                target_q1_varmap.load(path.join(TARGET_Q1_CHECKPOINT))?;
                target_q2_varmap.load(path.join(TARGET_Q2_CHECKPOINT))?;
                println!("[SAC] Checkpoint loaded successfully");
            }
        } else {
            copy_varmap(&q1_varmap, &target_q1_varmap);
            copy_varmap(&q2_varmap, &target_q2_varmap);
        }

        let policy_optim = AdamW::new(
            policy_varmap.all_vars(),
            ParamsAdamW {
                lr: SAC_POLICY_LR,
                ..Default::default()
            },
        )?;

        let q1_optim = AdamW::new(
            q1_varmap.all_vars(),
            ParamsAdamW {
                lr: SAC_Q_LR,
                ..Default::default()
            },
        )?;

        let q2_optim = AdamW::new(
            q2_varmap.all_vars(),
            ParamsAdamW {
                lr: SAC_Q_LR,
                ..Default::default()
            },
        )?;

        let init_log_alpha = SAC_ALPHA_INIT.ln();
        let log_alpha = Var::new(&[init_log_alpha], &dev)?;

        if let Some(dir) = checkpoint_dir {
            let alpha_path = Path::new(dir).join(ALPHA_CHECKPOINT);
            if alpha_path.exists() {
                if let Ok(tensors) = candle_core::safetensors::load(&alpha_path, &dev) {
                    if let Some(saved_alpha) = tensors.get("log_alpha") {
                        log_alpha.set(saved_alpha)?;
                        println!("[SAC] Loaded log_alpha from checkpoint");
                    }
                }
            }
        }

        let alpha_optim = AdamW::new(
            vec![log_alpha.clone()],
            ParamsAdamW {
                lr: SAC_ALPHA_LR,
                ..Default::default()
            },
        )?;

        let mut replay_buffer = ReplayBuffer::new(REPLAY_CAPACITY);
        if let Some(dir) = checkpoint_dir {
            let buffer_path = Path::new(dir).join(BUFFER_CHECKPOINT);
            if buffer_path.exists() {
                match replay_buffer.load(&buffer_path) {
                    Ok(_) => println!(
                        "[SAC] Loaded replay buffer: {} samples",
                        replay_buffer.len()
                    ),
                    Err(e) => {
                        println!("[SAC] Failed to load replay buffer: {} - starting fresh", e)
                    }
                }
            }
        }

        Ok(Self {
            policy_varmap,
            policy,
            q1_varmap,
            q1,
            q2_varmap,
            q2,
            target_q1_varmap,
            target_q1,
            target_q2_varmap,
            target_q2,
            policy_optim,
            q1_optim,
            q2_optim,
            log_alpha,
            alpha_optim,
            target_entropy: SAC_TARGET_ENTROPY,
            replay_buffer,
            is_training: true,
        })
    }

    pub fn get_action(&mut self, obs: &[f32]) -> CResult<Vec<f32>> {
        let state = Tensor::new(obs, &Device::Cpu)?.unsqueeze(0)?;
        let (mean, log_std) = self.policy.forward(&state)?;
        let log_std = log_std.clamp(SAC_LOG_STD_MIN, SAC_LOG_STD_MAX)?;
        let std = log_std.exp()?;

        let action = if self.is_training {
            let eps = Tensor::randn(0f32, 1f32, mean.shape(), &Device::Cpu)?;
            let pre_tanh = (&mean + (&std * eps)?)?;
            pre_tanh.tanh()?
        } else {
            mean.tanh()?
        };

        Ok(action.squeeze(0)?.to_vec1()?)
    }

    fn sample_action_and_log_prob(&self, states: &Tensor) -> CResult<(Tensor, Tensor)> {
        let (mean, log_std) = self.policy.forward(states)?;
        let log_std = log_std.clamp(SAC_LOG_STD_MIN, SAC_LOG_STD_MAX)?;
        let std = log_std.exp()?;

        let eps = Tensor::randn(0f32, 1f32, mean.shape(), states.device())?;
        let pre_tanh = (&mean + (&std * eps)?)?;
        let action = pre_tanh.tanh()?;

        let diff = (&pre_tanh - &mean)?;
        let diff2 = diff.sqr()?;
        let var = std.sqr()?;
        let mut log_prob = (&diff2 / &var)?;
        log_prob = (&log_prob + (2.0 * &log_std)?)?;
        log_prob = log_prob.broadcast_add(&Tensor::new(LOG_2PI, log_prob.device())?)?;
        log_prob = (&log_prob * -0.5)?;
        log_prob = log_prob.sum_keepdim(1)?;

        let correction = (1.0 - action.sqr()?)?;
        let correction =
            correction.broadcast_add(&Tensor::new(LOG_PROB_EPS, correction.device())?)?;
        let correction = correction.log()?;
        let correction = correction.sum_keepdim(1)?;
        let log_prob = (&log_prob - correction)?;

        Ok((action, log_prob))
    }

    pub fn train_step(&mut self) -> CResult<()> {
        let batch = match self.replay_buffer.sample_batch(BATCH_SIZE) {
            Some(b) => b,
            None => return Ok(()),
        };

        let dev = Device::Cpu;

        let states: Vec<f32> = batch.iter().flat_map(|t| t.state.iter().copied()).collect();
        let states = Tensor::from_vec(states, (BATCH_SIZE, OBS_DIM), &dev)?;

        let actions: Vec<f32> = batch
            .iter()
            .flat_map(|t| t.action.iter().copied())
            .collect();
        let actions = Tensor::from_vec(actions, (BATCH_SIZE, ACT_DIM), &dev)?;

        let rewards: Vec<f32> = batch.iter().map(|t| t.reward * REWARD_SCALE).collect();
        let rewards = Tensor::from_vec(rewards, (BATCH_SIZE, 1), &dev)?;

        let next_states: Vec<f32> = batch
            .iter()
            .flat_map(|t| t.next_state.iter().copied())
            .collect();
        let next_states = Tensor::from_vec(next_states, (BATCH_SIZE, OBS_DIM), &dev)?;

        let dones: Vec<f32> = batch
            .iter()
            .map(|t| if t.done { 0.0 } else { 1.0 })
            .collect();
        let dones = Tensor::from_vec(dones, (BATCH_SIZE, 1), &dev)?;

        let alpha = self.log_alpha.as_tensor().exp()?;

        let (next_actions, next_log_prob) = self.sample_action_and_log_prob(&next_states)?;
        let next_input = Tensor::cat(&[&next_states, &next_actions], 1)?;
        let target_q1 = self.target_q1.forward(&next_input)?.detach();
        let target_q2 = self.target_q2.forward(&next_input)?.detach();
        let min_target_q = target_q1.broadcast_minimum(&target_q2)?;
        let alpha_logp = next_log_prob.broadcast_mul(&alpha.detach())?;
        let target = (&min_target_q - alpha_logp)?;
        let gamma = Tensor::new(GAMMA as f32, rewards.device())?;
        let y = (&rewards + (&dones * target)?.broadcast_mul(&gamma)?)?;

        let q1_input = Tensor::cat(&[&states, &actions], 1)?;
        let q1 = self.q1.forward(&q1_input)?;
        let q1_loss = (&y.detach() - &q1)?.sqr()?.mean_all()?;
        self.q1_optim.backward_step(&q1_loss)?;

        let q2_input = Tensor::cat(&[&states, &actions], 1)?;
        let q2 = self.q2.forward(&q2_input)?;
        let q2_loss = (&y.detach() - &q2)?.sqr()?.mean_all()?;
        self.q2_optim.backward_step(&q2_loss)?;

        let (new_actions, log_prob) = self.sample_action_and_log_prob(&states)?;
        let policy_input = Tensor::cat(&[&states, &new_actions], 1)?;
        let q1_pi = self.q1.forward(&policy_input)?;
        let q2_pi = self.q2.forward(&policy_input)?;
        let min_q_pi = q1_pi.broadcast_minimum(&q2_pi)?;

        let alpha = self.log_alpha.as_tensor().exp()?;
        let alpha_logp = log_prob.broadcast_mul(&alpha.detach())?;
        let policy_loss = (&alpha_logp - min_q_pi)?.mean_all()?;
        self.policy_optim.backward_step(&policy_loss)?;

        let target_ent = Tensor::new(&[self.target_entropy], &dev)?.reshape((1, 1))?;
        let log_prob_detached = log_prob.detach();
        let alpha = self.log_alpha.as_tensor().exp()?;
        let entropy_diff = log_prob_detached.broadcast_add(&target_ent)?;
        let alpha_loss = entropy_diff.neg()?.broadcast_mul(&alpha)?.mean_all()?;
        self.alpha_optim.backward_step(&alpha_loss)?;

        soft_update_varmap(&self.q1_varmap, &self.target_q1_varmap, TAU);
        soft_update_varmap(&self.q2_varmap, &self.target_q2_varmap, TAU);

        Ok(())
    }

    pub fn save_checkpoint(&self, checkpoint_dir: &str) -> CResult<()> {
        let path = Path::new(checkpoint_dir);
        std::fs::create_dir_all(path).map_err(|e| candle_core::Error::Io(e))?;

        self.policy_varmap.save(path.join(POLICY_CHECKPOINT))?;
        self.q1_varmap.save(path.join(Q1_CHECKPOINT))?;
        self.q2_varmap.save(path.join(Q2_CHECKPOINT))?;
        self.target_q1_varmap
            .save(path.join(TARGET_Q1_CHECKPOINT))?;
        self.target_q2_varmap
            .save(path.join(TARGET_Q2_CHECKPOINT))?;

        let alpha_tensors = std::collections::HashMap::from([(
            "log_alpha".to_string(),
            self.log_alpha.as_tensor().clone(),
        )]);
        candle_core::safetensors::save(&alpha_tensors, path.join(ALPHA_CHECKPOINT))?;

        Ok(())
    }

    pub fn get_alpha(&self) -> f32 {
        self.log_alpha
            .as_tensor()
            .exp()
            .and_then(|t| t.to_vec0())
            .unwrap_or(SAC_ALPHA_INIT)
    }
}
