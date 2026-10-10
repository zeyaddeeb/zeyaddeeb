use anyhow::Result;
use candle_core::{Tensor, D};
use candle_nn::{Linear, Module};

use crate::net::activation::mish;
use crate::net::conv::PaddedConv;

pub const POSITION_GROUPS: usize = 16;

pub struct FrameEmbedder {
    pub projection: Linear,
    pub prompt_flag: Tensor,
    pub positions: [PaddedConv; 2],
}

impl FrameEmbedder {
    pub fn forward(
        &self,
        state: &Tensor,
        context: &Tensor,
        prompt_mask: &Tensor,
    ) -> Result<Tensor> {
        let joined = Tensor::cat(&[state, context], D::Minus1)?;
        let flagged = prompt_mask.broadcast_mul(&self.prompt_flag)?;
        let frames = (self.projection.forward(&joined)? + flagged)?;
        Ok((&frames + self.positional(&frames)?)?)
    }

    fn positional(&self, frames: &Tensor) -> Result<Tensor> {
        let mut hidden = frames.transpose(1, 2)?.contiguous()?;
        for conv in &self.positions {
            hidden = mish(&conv.forward(&hidden)?)?;
        }
        Ok(hidden.transpose(1, 2)?.contiguous()?)
    }
}
