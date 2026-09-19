use super::adam::Adam;
use candle_core::{DType, Device, Result as CResult, Tensor, Var};
use candle_nn::{VarBuilder, VarMap};
use serde::{Deserialize, Serialize};
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

fn copy_varmap(src: &VarMap, dst: &VarMap) -> CResult<()> {
    let src_data = src.data().lock().unwrap();
    let dst_data = dst.data().lock().unwrap();
    for (name, src_var) in src_data.iter() {
        let dst_var = dst_data
            .get(name)
            .ok_or_else(|| candle_core::Error::Msg(format!("Missing target parameter {name}")))?;
        dst_var.set(&src_var.as_tensor().detach())?;
    }
    Ok(())
}

fn soft_update_varmap(src: &VarMap, dst: &VarMap, tau: f64) -> CResult<()> {
    let src_data = src.data().lock().unwrap();
    let dst_data = dst.data().lock().unwrap();
    for (name, src_var) in src_data.iter() {
        let dst_var = dst_data
            .get(name)
            .ok_or_else(|| candle_core::Error::Msg(format!("Missing target parameter {name}")))?;
        let blended = ((src_var.as_tensor() * tau)? + (dst_var.as_tensor() * (1.0 - tau))?)?;
        dst_var.set(&blended.detach())?;
    }
    Ok(())
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct TrainingProgress {
    pub episodes: usize,
    pub curriculum_stage: usize,
    pub stage_episodes: usize,
    pub stage_success_streak: usize,
    pub baskets_made: usize,
}

#[derive(Serialize, Deserialize)]
struct CheckpointMetadata {
    environment_version: u32,
    obs_dim: usize,
    act_dim: usize,
    train_steps: usize,
    progress: TrainingProgress,
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

    policy_optim: Adam,
    q1_optim: Adam,
    q2_optim: Adam,

    log_alpha: Var,
    alpha_optim: Adam,
    target_entropy: f32,

    pub replay_buffer: ReplayBuffer,

    pub is_training: bool,
    pub resumed: bool,
    pub progress: TrainingProgress,
    pub train_steps: usize,
}

impl SACAgent {
    pub fn new_or_load(checkpoint_dir: &str) -> CResult<Self> {
        let root = Path::new(checkpoint_dir);
        let current = root.join("CURRENT");
        if current.exists() {
            let generation = std::fs::read_to_string(current)?;
            if !generation.starts_with("generation-")
                || generation.contains('/')
                || generation.contains('\\')
            {
                candle_core::bail!("Invalid checkpoint generation");
            }
            let path = root.join(generation.trim());
            let outdated = std::fs::read(path.join("metadata.json"))
                .ok()
                .and_then(|bytes| serde_json::from_slice::<CheckpointMetadata>(&bytes).ok())
                .is_some_and(|metadata| metadata.environment_version < ENVIRONMENT_VERSION);
            if outdated {
                println!("[SAC] Checkpoint from an older environment replaced by a fresh version-{ENVIRONMENT_VERSION} training run");
                return Self::new_internal(None);
            }
            Self::new_internal(Some(path.to_str().unwrap()))
        } else {
            if root.join(POLICY_CHECKPOINT).exists() {
                println!("[SAC] Legacy environment checkpoint replaced by a fresh version-{ENVIRONMENT_VERSION} training run");
            }
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
            {
                println!("[SAC] Loading checkpoint from {}", dir);
                policy_varmap.load(path.join(POLICY_CHECKPOINT))?;
                q1_varmap.load(path.join(Q1_CHECKPOINT))?;
                q2_varmap.load(path.join(Q2_CHECKPOINT))?;
                target_q1_varmap.load(path.join(TARGET_Q1_CHECKPOINT))?;
                target_q2_varmap.load(path.join(TARGET_Q2_CHECKPOINT))?;
                println!("[SAC] Checkpoint loaded successfully");
            }
        } else {
            copy_varmap(&q1_varmap, &target_q1_varmap)?;
            copy_varmap(&q2_varmap, &target_q2_varmap)?;
        }

        let mut policy_optim = Adam::from_varmap(&policy_varmap, SAC_POLICY_LR)?;
        let mut q1_optim = Adam::from_varmap(&q1_varmap, SAC_Q_LR)?;
        let mut q2_optim = Adam::from_varmap(&q2_varmap, SAC_Q_LR)?;

        let init_log_alpha = SAC_ALPHA_INIT.ln();
        let log_alpha = Var::new(&[init_log_alpha], &dev)?;

        let mut alpha_optim =
            Adam::new(vec![("log_alpha".into(), log_alpha.clone())], SAC_ALPHA_LR)?;
        let mut replay_buffer = ReplayBuffer::new(REPLAY_CAPACITY);
        let mut progress = TrainingProgress::default();
        let mut train_steps = 0;
        if let Some(dir) = checkpoint_dir {
            let path = Path::new(dir);
            let metadata: CheckpointMetadata =
                serde_json::from_slice(&std::fs::read(path.join("metadata.json"))?)
                    .map_err(|e| candle_core::Error::Msg(e.to_string()))?;
            if metadata.environment_version != ENVIRONMENT_VERSION
                || metadata.obs_dim != OBS_DIM
                || metadata.act_dim != ACT_DIM
                || metadata.progress.curriculum_stage > 2
            {
                candle_core::bail!(
                    "Incompatible environment checkpoint; refusing to mix experience"
                );
            }
            let tensors = candle_core::safetensors::load(path.join("optimizer.safetensors"), &dev)?;
            policy_optim.restore("policy", &tensors, metadata.train_steps)?;
            q1_optim.restore("q1", &tensors, metadata.train_steps)?;
            q2_optim.restore("q2", &tensors, metadata.train_steps)?;
            alpha_optim.restore("alpha", &tensors, metadata.train_steps)?;
            let alpha = candle_core::safetensors::load(path.join(ALPHA_CHECKPOINT), &dev)?;
            log_alpha.set(
                alpha
                    .get("log_alpha")
                    .ok_or_else(|| candle_core::Error::Msg("Missing alpha".into()))?,
            )?;
            replay_buffer.load(path.join(BUFFER_CHECKPOINT))?;
            if !replay_buffer.is_valid(OBS_DIM, ACT_DIM) {
                candle_core::bail!("Invalid replay checkpoint");
            }
            progress = metadata.progress;
            train_steps = metadata.train_steps;
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
            resumed: checkpoint_dir.is_some(),
            progress,
            train_steps,
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

        action.squeeze(0)?.to_vec1()
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

        soft_update_varmap(&self.q1_varmap, &self.target_q1_varmap, TAU)?;
        soft_update_varmap(&self.q2_varmap, &self.target_q2_varmap, TAU)?;
        self.train_steps += 1;

        Ok(())
    }

    pub fn save_checkpoint(&self, checkpoint_dir: &str) -> CResult<()> {
        let root = Path::new(checkpoint_dir);
        std::fs::create_dir_all(root)?;
        let previous = std::fs::read_to_string(root.join("CURRENT")).ok();
        let generation = format!(
            "generation-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = root.join(&generation);
        std::fs::create_dir(&path)?;

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
        let mut tensors = std::collections::HashMap::new();
        for (name, optim) in [
            ("policy", &self.policy_optim),
            ("q1", &self.q1_optim),
            ("q2", &self.q2_optim),
            ("alpha", &self.alpha_optim),
        ] {
            optim.save(name, &mut tensors);
        }
        candle_core::safetensors::save(&tensors, path.join("optimizer.safetensors"))?;
        self.replay_buffer.save(path.join(BUFFER_CHECKPOINT))?;
        let metadata = CheckpointMetadata {
            environment_version: ENVIRONMENT_VERSION,
            obs_dim: OBS_DIM,
            act_dim: ACT_DIM,
            train_steps: self.train_steps,
            progress: self.progress.clone(),
        };
        std::fs::write(
            path.join("metadata.json"),
            serde_json::to_vec_pretty(&metadata)
                .map_err(|e| candle_core::Error::Msg(e.to_string()))?,
        )?;
        // Publish only after every member of the snapshot is durable.
        for entry in std::fs::read_dir(&path)? {
            std::fs::File::open(entry?.path())?.sync_all()?;
        }
        std::fs::File::open(&path)?.sync_all()?;
        std::fs::write(root.join("CURRENT.tmp"), &generation)?;
        std::fs::File::open(root.join("CURRENT.tmp"))?.sync_all()?;
        std::fs::rename(root.join("CURRENT.tmp"), root.join("CURRENT"))?;
        std::fs::File::open(root)?.sync_all()?;
        if previous.is_none() {
            // Legacy data is retired only after its replacement is committed.
            for name in [
                POLICY_CHECKPOINT,
                Q1_CHECKPOINT,
                Q2_CHECKPOINT,
                TARGET_Q1_CHECKPOINT,
                TARGET_Q2_CHECKPOINT,
                ALPHA_CHECKPOINT,
                BUFFER_CHECKPOINT,
            ] {
                let _ = std::fs::remove_file(root.join(name));
            }
        }
        if let Some(previous) = previous {
            if previous.starts_with("generation-")
                && !previous.contains('/')
                && !previous.contains('\\')
            {
                let _ = std::fs::remove_dir_all(root.join(previous.trim()));
            }
        }

        Ok(())
    }

    pub fn get_alpha(&self) -> f32 {
        self.log_alpha
            .as_tensor()
            .exp()
            .and_then(|t| t.to_vec1::<f32>())
            .ok()
            .and_then(|v| v.first().copied())
            .unwrap_or(SAC_ALPHA_INIT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rl::Transition;

    fn values(vars: &VarMap) -> std::collections::BTreeMap<String, Vec<f32>> {
        vars.data()
            .lock()
            .unwrap()
            .iter()
            .map(|(name, var)| {
                (
                    name.clone(),
                    var.as_tensor().flatten_all().unwrap().to_vec1().unwrap(),
                )
            })
            .collect()
    }

    #[test]
    fn gradients_update_both_critics_policy_and_soft_targets() {
        let mut agent = SACAgent::new_internal(None).unwrap();
        for _ in 0..BATCH_SIZE {
            agent.replay_buffer.push(Transition {
                state: vec![0.1; OBS_DIM],
                action: vec![0.0; ACT_DIM],
                reward: 10.0,
                next_state: vec![0.1; OBS_DIM],
                done: true,
            });
        }
        let before_policy = values(&agent.policy_varmap);
        let before_q1 = values(&agent.q1_varmap);
        let before_q2 = values(&agent.q2_varmap);
        assert_eq!(before_q1, values(&agent.target_q1_varmap));
        assert_eq!(before_q2, values(&agent.target_q2_varmap));
        agent.train_step().unwrap();
        let after_q1 = values(&agent.q1_varmap);
        assert_ne!(before_policy, values(&agent.policy_varmap));
        assert_ne!(before_q1, after_q1);
        assert_ne!(before_q2, values(&agent.q2_varmap));
        for (name, actual) in values(&agent.target_q1_varmap) {
            for ((old, new), target) in before_q1[&name].iter().zip(&after_q1[&name]).zip(actual) {
                let expected = (1.0 - TAU as f32) * old + TAU as f32 * new;
                assert!((target - expected).abs() < 1e-6);
            }
        }
        for vars in [
            &agent.policy_varmap,
            &agent.q1_varmap,
            &agent.q2_varmap,
            &agent.target_q1_varmap,
            &agent.target_q2_varmap,
        ] {
            assert!(values(vars).values().flatten().all(|v| v.is_finite()));
        }
        assert!(agent.get_alpha().is_finite() && agent.get_alpha() > 0.0);
    }

    #[test]
    fn checkpoint_reload_preserves_deterministic_actions() {
        let mut agent = SACAgent::new_internal(None).unwrap();
        agent.is_training = false;
        let obs = vec![0.1; OBS_DIM];
        for _ in 0..BATCH_SIZE {
            agent.replay_buffer.push(Transition {
                state: obs.clone(),
                action: vec![0.0; ACT_DIM],
                reward: 1.0,
                next_state: obs.clone(),
                done: true,
            });
        }
        agent.train_step().unwrap();
        agent.progress = TrainingProgress {
            episodes: 83,
            curriculum_stage: 2,
            stage_episodes: 23,
            stage_success_streak: 3,
            baskets_made: 9,
        };
        let before = agent.get_action(&obs).unwrap();
        let directory = std::env::temp_dir().join(format!(
            "robot-sac-roundtrip-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        agent.save_checkpoint(directory.to_str().unwrap()).unwrap();
        let mut restored = SACAgent::new_or_load(directory.to_str().unwrap()).unwrap();
        assert!(restored.resumed);
        assert_eq!(restored.progress, agent.progress);
        assert_eq!(restored.train_steps, agent.train_steps);
        assert_eq!(restored.replay_buffer.len(), BATCH_SIZE);
        let mut saved_moments = std::collections::HashMap::new();
        let mut restored_moments = std::collections::HashMap::new();
        for (name, a, b) in [
            ("policy", &agent.policy_optim, &restored.policy_optim),
            ("q1", &agent.q1_optim, &restored.q1_optim),
            ("q2", &agent.q2_optim, &restored.q2_optim),
            ("alpha", &agent.alpha_optim, &restored.alpha_optim),
        ] {
            assert_eq!(a.step, b.step);
            a.save(name, &mut saved_moments);
            b.save(name, &mut restored_moments);
        }
        for (name, tensor) in saved_moments {
            assert_eq!(
                tensor.flatten_all().unwrap().to_vec1::<f32>().unwrap(),
                restored_moments[&name]
                    .flatten_all()
                    .unwrap()
                    .to_vec1::<f32>()
                    .unwrap()
            );
        }
        restored.is_training = false;
        let after = restored.get_action(&obs).unwrap();
        assert_eq!(after.len(), ACT_DIM);
        assert!(before.iter().zip(after).all(|(a, b)| (a - b).abs() < 1e-6));
        // An unfinished generation cannot replace the committed one.
        std::fs::create_dir(directory.join("generation-incomplete")).unwrap();
        assert!(
            SACAgent::new_or_load(directory.to_str().unwrap())
                .unwrap()
                .resumed
        );
        let current = std::fs::read_to_string(directory.join("CURRENT")).unwrap();
        let metadata_path = directory.join(&current).join("metadata.json");
        let original_metadata = std::fs::read(&metadata_path).unwrap();
        let mut metadata: CheckpointMetadata = serde_json::from_slice(&original_metadata).unwrap();
        metadata.environment_version += 1;
        std::fs::write(&metadata_path, serde_json::to_vec(&metadata).unwrap()).unwrap();
        assert!(SACAgent::new_or_load(directory.to_str().unwrap()).is_err());
        std::fs::write(&metadata_path, original_metadata).unwrap();
        std::fs::remove_file(directory.join(current).join(Q1_CHECKPOINT)).unwrap();
        assert!(SACAgent::new_or_load(directory.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
