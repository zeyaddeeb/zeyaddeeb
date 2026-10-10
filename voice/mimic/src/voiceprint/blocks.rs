use anyhow::Result;
use candle_core::{Tensor, D};
use candle_nn::{Conv1d, Module};

use crate::net::activation::sigmoid;
use crate::net::conv::{DepthwiseConv, PaddedConv};
use crate::net::norm::ChannelNorm;

pub struct NormedConv {
    pub conv: PaddedConv,
    pub norm: ChannelNorm,
}

impl NormedConv {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        Ok(self.norm.forward(&self.conv.forward(xs)?)?.silu()?)
    }
}

pub struct Stage {
    pub entry: NormedConv,
    pub blocks: Vec<GatedBlock>,
}

impl Stage {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let mut hidden = self.entry.forward(xs)?;
        for block in &self.blocks {
            hidden = block.forward(&hidden)?;
        }
        Ok(hidden)
    }
}

pub struct GatedBlock {
    pub entry_norm: ChannelNorm,
    pub expand: Conv1d,
    pub depthwise: DepthwiseConv,
    pub inner_norm: ChannelNorm,
    pub recalibrate: Recalibration,
    pub project: Conv1d,
}

impl GatedBlock {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let expanded = self.expand.forward(&self.entry_norm.forward(xs)?)?;
        let halves = expanded.chunk(2, 1)?;
        let gated = (&halves[0] * sigmoid(&halves[1])?)?;
        let filtered = self
            .inner_norm
            .forward(&self.depthwise.forward(&gated)?)?
            .silu()?;
        let update = self
            .project
            .forward(&self.recalibrate.forward(&filtered)?)?;
        Ok((xs + update)?)
    }
}

pub struct Recalibration {
    pub squeeze: Conv1d,
    pub excite: Conv1d,
}

impl Recalibration {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let summary = xs.mean_keepdim(D::Minus1)?;
        let squeezed = self.squeeze.forward(&summary)?.silu()?;
        let weights = sigmoid(&self.excite.forward(&squeezed)?)?;
        Ok(xs.broadcast_mul(&weights)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;
    use candle_nn::Conv1dConfig;

    fn pointwise(weights: &[f32], outputs: usize, inputs: usize) -> Conv1d {
        let weight = Tensor::from_slice(weights, (outputs, inputs, 1), &Device::Cpu).unwrap();
        let bias = Tensor::zeros(outputs, candle_core::DType::F32, &Device::Cpu).unwrap();
        Conv1d::new(weight, Some(bias), Conv1dConfig::default())
    }

    #[test]
    fn recalibration_scales_each_channel_by_its_gate() {
        let layer = Recalibration {
            squeeze: pointwise(&[1.0, 0.0], 1, 2),
            excite: pointwise(&[0.0, 100.0], 2, 1),
        };
        let xs = Tensor::new(&[[[2.0f32, 4.0], [1.0, 1.0]]], &Device::Cpu).unwrap();
        let out = layer.forward(&xs).unwrap().to_vec3::<f32>().unwrap();
        assert_eq!(out[0][0], [1.0, 2.0]);
        assert!((out[0][1][0] - 1.0).abs() < 1e-6);
    }
}
