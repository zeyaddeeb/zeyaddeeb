use anyhow::Result;
use candle_core::Tensor;
use candle_nn::{Linear, Module};

use crate::net::conv::{DepthwiseConv, PaddedConv};
use crate::net::norm::LayerNorm;

pub struct Backbone {
    pub stem: PaddedConv,
    pub stem_norm: LayerNorm,
    pub blocks: Vec<RefineBlock>,
    pub final_norm: LayerNorm,
}

impl Backbone {
    pub fn forward(&self, mel: &Tensor) -> Result<Tensor> {
        let stem = self.stem.forward(mel)?.transpose(1, 2)?.contiguous()?;
        let mut hidden = self.stem_norm.forward(&stem)?;
        for block in &self.blocks {
            hidden = block.forward(&hidden)?;
        }
        self.final_norm.forward(&hidden)
    }
}

pub struct RefineBlock {
    pub depthwise: DepthwiseConv,
    pub norm: LayerNorm,
    pub expand: Linear,
    pub contract: Linear,
    pub gain: Tensor,
}

impl RefineBlock {
    pub fn forward(&self, frames: &Tensor) -> Result<Tensor> {
        let channels = frames.transpose(1, 2)?.contiguous()?;
        let local = self
            .depthwise
            .forward(&channels)?
            .transpose(1, 2)?
            .contiguous()?;
        let expanded = self
            .expand
            .forward(&self.norm.forward(&local)?)?
            .gelu_erf()?;
        let update = self
            .contract
            .forward(&expanded)?
            .broadcast_mul(&self.gain)?;
        Ok((frames + update)?)
    }
}
