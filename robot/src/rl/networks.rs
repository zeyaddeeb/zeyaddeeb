use candle_core::{Result as CResult, Tensor};
use candle_nn::{linear, Linear, Module, VarBuilder};

#[cfg(feature = "native")]
use super::config::HIDDEN_DIM;
use super::config::{ACT_DIM, OBS_DIM};

#[cfg(not(feature = "native"))]
const HIDDEN_DIM: usize = 256;

pub struct ActorNet {
    fc0: Linear,
    fc1: Linear,
    fc2: Linear,
}

pub struct PolicyNet {
    fc0: Linear,
    fc1: Linear,
    mean: Linear,
    log_std: Linear,
}

impl PolicyNet {
    pub fn new(vb: &VarBuilder) -> CResult<Self> {
        Ok(Self {
            fc0: linear(OBS_DIM, HIDDEN_DIM, vb.pp("fc0"))?,
            fc1: linear(HIDDEN_DIM, HIDDEN_DIM, vb.pp("fc1"))?,
            mean: linear(HIDDEN_DIM, ACT_DIM, vb.pp("mean"))?,
            log_std: linear(HIDDEN_DIM, ACT_DIM, vb.pp("log_std"))?,
        })
    }

    pub fn forward(&self, x: &Tensor) -> CResult<(Tensor, Tensor)> {
        let x = self.fc0.forward(x)?.relu()?;
        let x = self.fc1.forward(&x)?.relu()?;
        let mean = self.mean.forward(&x)?;
        let log_std = self.log_std.forward(&x)?;
        Ok((mean, log_std))
    }
}

impl ActorNet {
    pub fn new(vb: &VarBuilder) -> CResult<Self> {
        Ok(Self {
            fc0: linear(OBS_DIM, HIDDEN_DIM, vb.pp("fc0"))?,
            fc1: linear(HIDDEN_DIM, HIDDEN_DIM, vb.pp("fc1"))?,
            fc2: linear(HIDDEN_DIM, ACT_DIM, vb.pp("fc2"))?,
        })
    }

    pub fn forward(&self, x: &Tensor) -> CResult<Tensor> {
        let x = self.fc0.forward(x)?.relu()?;
        let x = self.fc1.forward(&x)?.relu()?;
        self.fc2.forward(&x)?.tanh()
    }
}

pub struct CriticNet {
    fc0: Linear,
    fc1: Linear,
    fc2: Linear,
}

impl CriticNet {
    pub fn new(vb: &VarBuilder) -> CResult<Self> {
        let input_dim = OBS_DIM + ACT_DIM;
        Ok(Self {
            fc0: linear(input_dim, HIDDEN_DIM, vb.pp("fc0"))?,
            fc1: linear(HIDDEN_DIM, HIDDEN_DIM, vb.pp("fc1"))?,
            fc2: linear(HIDDEN_DIM, 1, vb.pp("fc2"))?,
        })
    }

    pub fn forward(&self, x: &Tensor) -> CResult<Tensor> {
        let x = self.fc0.forward(x)?.relu()?;
        let x = self.fc1.forward(&x)?.relu()?;
        self.fc2.forward(&x)
    }
}
