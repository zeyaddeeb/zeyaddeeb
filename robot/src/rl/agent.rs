use candle_core::{DType, Device, Result as CResult, Tensor};
use candle_nn::{AdamW, Optimizer, ParamsAdamW, VarBuilder, VarMap};
use std::path::Path;

use super::buffer::ReplayBuffer;
use super::config::*;
use super::networks::{ActorNet, CriticNet};
use super::noise::OuNoise;

pub const CHECKPOINT_DIR: &str = "checkpoints";
const ACTOR_CHECKPOINT: &str = "actor.safetensors";
const TARGET_ACTOR_CHECKPOINT: &str = "target_actor.safetensors";
const CRITIC_CHECKPOINT: &str = "critic.safetensors";
const TARGET_CRITIC_CHECKPOINT: &str = "target_critic.safetensors";

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

pub struct DDPGAgent {
    actor_varmap: VarMap,
    actor: ActorNet,
    target_actor_varmap: VarMap,
    target_actor: ActorNet,

    critic_varmap: VarMap,
    critic: CriticNet,
    target_critic_varmap: VarMap,
    target_critic: CriticNet,

    actor_optim: AdamW,
    critic_optim: AdamW,

    pub replay_buffer: ReplayBuffer,
    pub ou_noise: OuNoise,

    pub is_training: bool,
}

impl DDPGAgent {
    #[allow(dead_code)]
    pub fn new() -> CResult<Self> {
        Self::new_internal(None)
    }

    pub fn new_or_load(checkpoint_dir: &str) -> CResult<Self> {
        let checkpoint_path = Path::new(checkpoint_dir);
        if checkpoint_path.join(ACTOR_CHECKPOINT).exists() {
            Self::new_internal(Some(checkpoint_dir))
        } else {
            Self::new_internal(None)
        }
    }

    fn new_internal(checkpoint_dir: Option<&str>) -> CResult<Self> {
        let dev = Device::Cpu;

        let mut actor_varmap = VarMap::new();
        let actor_vb = VarBuilder::from_varmap(&actor_varmap, DType::F32, &dev);
        let actor = ActorNet::new(&actor_vb)?;

        let mut target_actor_varmap = VarMap::new();
        let target_actor_vb = VarBuilder::from_varmap(&target_actor_varmap, DType::F32, &dev);
        let target_actor = ActorNet::new(&target_actor_vb)?;

        let mut critic_varmap = VarMap::new();
        let critic_vb = VarBuilder::from_varmap(&critic_varmap, DType::F32, &dev);
        let critic = CriticNet::new(&critic_vb)?;

        let mut target_critic_varmap = VarMap::new();
        let target_critic_vb = VarBuilder::from_varmap(&target_critic_varmap, DType::F32, &dev);
        let target_critic = CriticNet::new(&target_critic_vb)?;

        if let Some(dir) = checkpoint_dir {
            let path = Path::new(dir);
            if path.join(ACTOR_CHECKPOINT).exists() {
                println!("[DDPG] Loading checkpoint from {}", dir);
                actor_varmap.load(path.join(ACTOR_CHECKPOINT))?;
                target_actor_varmap.load(path.join(TARGET_ACTOR_CHECKPOINT))?;
                critic_varmap.load(path.join(CRITIC_CHECKPOINT))?;
                target_critic_varmap.load(path.join(TARGET_CRITIC_CHECKPOINT))?;
                println!("[DDPG] Checkpoint loaded successfully");
            }
        } else {
            copy_varmap(&actor_varmap, &target_actor_varmap);
            copy_varmap(&critic_varmap, &target_critic_varmap);
        }

        let actor_optim = AdamW::new(
            actor_varmap.all_vars(),
            ParamsAdamW {
                lr: ACTOR_LR,
                ..Default::default()
            },
        )?;

        let critic_optim = AdamW::new(
            critic_varmap.all_vars(),
            ParamsAdamW {
                lr: CRITIC_LR,
                ..Default::default()
            },
        )?;

        Ok(Self {
            actor_varmap,
            actor,
            target_actor_varmap,
            target_actor,
            critic_varmap,
            critic,
            target_critic_varmap,
            target_critic,
            actor_optim,
            critic_optim,
            replay_buffer: ReplayBuffer::new(REPLAY_CAPACITY),
            ou_noise: OuNoise::new(ACT_DIM),
            is_training: true,
        })
    }

    pub fn get_action(&mut self, obs: &[f32]) -> CResult<Vec<f32>> {
        let state = Tensor::new(obs, &Device::Cpu)?.unsqueeze(0)?;
        let action = self.actor.forward(&state)?.squeeze(0)?;
        let mut action_vec: Vec<f32> = action.to_vec1()?;

        if self.is_training {
            let noise = self.ou_noise.sample();
            for (a, n) in action_vec.iter_mut().zip(noise.iter()) {
                *a = (*a + n).clamp(-1.0, 1.0);
            }
        }
        Ok(action_vec)
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

        let rewards: Vec<f32> = batch.iter().map(|t| t.reward).collect();
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

        let target_actions = self.target_actor.forward(&next_states)?.detach();
        let target_input = Tensor::cat(&[&next_states, &target_actions], 1)?;
        let target_q = self.target_critic.forward(&target_input)?.detach();
        let y = (&rewards + (GAMMA * (&dones * &target_q)?)?)?;

        let critic_input = Tensor::cat(&[&states, &actions], 1)?;
        let q = self.critic.forward(&critic_input)?;
        let critic_loss = (&y.detach() - &q)?.sqr()?.mean_all()?;
        self.critic_optim.backward_step(&critic_loss)?;

        let pred_actions = self.actor.forward(&states)?;
        let actor_input = Tensor::cat(&[&states.detach(), &pred_actions], 1)?;
        let actor_loss = self.critic.forward(&actor_input)?.mean_all()?.neg()?;
        self.actor_optim.backward_step(&actor_loss)?;

        soft_update_varmap(&self.actor_varmap, &self.target_actor_varmap, TAU);
        soft_update_varmap(&self.critic_varmap, &self.target_critic_varmap, TAU);

        Ok(())
    }

    pub fn save_checkpoint(&self, checkpoint_dir: &str) -> CResult<()> {
        let path = Path::new(checkpoint_dir);
        std::fs::create_dir_all(path).map_err(|e| candle_core::Error::Io(e))?;

        self.actor_varmap.save(path.join(ACTOR_CHECKPOINT))?;
        self.target_actor_varmap
            .save(path.join(TARGET_ACTOR_CHECKPOINT))?;
        self.critic_varmap.save(path.join(CRITIC_CHECKPOINT))?;
        self.target_critic_varmap
            .save(path.join(TARGET_CRITIC_CHECKPOINT))?;

        Ok(())
    }
}
