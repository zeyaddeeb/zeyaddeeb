use anyhow::Result;
use candle_core::{Device, Tensor};
use candle_nn::{Conv1d, Embedding, Module};

use crate::net::activation::leaky_relu;
use crate::net::conv::PaddedConv;

const LEAK: f32 = 0.1;

pub struct Guide {
    pub units: Embedding,
    pub peek: Peek,
    pub stretch: Stretch,
    pub projection: Conv1d,
}

impl Guide {
    pub fn forward(&self, units: &[u32], frames: usize) -> Result<Tensor> {
        let ids = Tensor::from_slice(units, (1, units.len()), &Device::Cpu)?;
        let latents = self.units.forward(&ids)?.transpose(1, 2)?;
        let stretched = self
            .stretch
            .forward(&self.peek.forward(&latents)?, frames)?;
        Ok(self.projection.forward(&stretched)?)
    }
}

pub struct Peek {
    pub ahead: PaddedConv,
    pub settle: PaddedConv,
}

impl Peek {
    pub fn forward(&self, latents: &Tensor) -> Result<Tensor> {
        let ahead = leaky_relu(&self.ahead.forward(latents)?, LEAK)?;
        Ok((latents + self.settle.forward(&ahead)?)?)
    }
}

pub struct Stretch {
    pub enter: Conv1d,
    pub smooth: PaddedConv,
    pub leave: Conv1d,
}

impl Stretch {
    pub fn forward(&self, latents: &Tensor, frames: usize) -> Result<Tensor> {
        let sources = frame_sources(latents.dim(2)?, frames);
        let sources = Tensor::from_vec(sources, frames, &Device::Cpu)?;
        let held = latents.index_select(&sources, 2)?;
        let entered = self
            .enter
            .forward(latents)?
            .silu()?
            .index_select(&sources, 2)?;
        let smoothed = self.smooth.forward(&entered)?.silu()?;
        Ok((held + self.leave.forward(&smoothed)?)?)
    }
}

fn frame_sources(units: usize, frames: usize) -> Vec<u32> {
    (0..frames)
        .map(|frame| ((frame * units) / frames).min(units - 1) as u32)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_unit_is_held_for_its_share_of_frames() {
        assert_eq!(frame_sources(2, 8), [0, 0, 0, 0, 1, 1, 1, 1]);
        assert_eq!(frame_sources(3, 7), [0, 0, 0, 1, 1, 2, 2]);
        assert_eq!(frame_sources(4, 2), [0, 2]);
        assert_eq!(frame_sources(1, 3), [0, 0, 0]);
    }
}
