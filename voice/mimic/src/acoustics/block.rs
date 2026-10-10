use anyhow::Result;
use candle_core::{Tensor, D};
use candle_nn::{Linear, Module};

use crate::net::attention::{attend, merge_heads, split_heads};
use crate::net::norm::standardize;
use crate::net::rotary::Rotary;

const NORM_EPS: f64 = 1e-6;

fn modulate(xs: &Tensor, scale: &Tensor, shift: &Tensor) -> Result<Tensor> {
    let normed = standardize(xs, NORM_EPS)?;
    Ok(normed
        .broadcast_mul(&(scale + 1.0)?)?
        .broadcast_add(shift)?)
}

fn controls(modulation: &Linear, time: &Tensor, count: usize) -> Result<Vec<Tensor>> {
    Ok(modulation.forward(&time.silu()?)?.chunk(count, D::Minus1)?)
}

pub struct FlowBlock {
    pub modulation: Linear,
    pub attention: FrameAttention,
    pub expand: Linear,
    pub contract: Linear,
}

impl FlowBlock {
    pub fn forward(&self, xs: &Tensor, time: &Tensor, rotary: &Rotary) -> Result<Tensor> {
        let controls = controls(&self.modulation, time, 6)?;
        let [shift, scale, gate, late_shift, late_scale, late_gate] = controls.as_slice() else {
            anyhow::bail!("flow block modulation must have six parts");
        };
        let attended = self
            .attention
            .forward(&modulate(xs, scale, shift)?, rotary)?;
        let xs = (xs + attended.broadcast_mul(gate)?)?;
        let expanded = self
            .expand
            .forward(&modulate(&xs, late_scale, late_shift)?)?;
        let fed = self.contract.forward(&expanded.gelu()?)?;
        Ok((xs + fed.broadcast_mul(late_gate)?)?)
    }
}

pub struct FrameAttention {
    pub heads: usize,
    pub query: Linear,
    pub key: Linear,
    pub value: Linear,
    pub output: Linear,
}

impl FrameAttention {
    pub fn forward(&self, xs: &Tensor, rotary: &Rotary) -> Result<Tensor> {
        let queries = rotary.rotate(&split_heads(&self.query.forward(xs)?, self.heads)?, 0)?;
        let keys = rotary.rotate(&split_heads(&self.key.forward(xs)?, self.heads)?, 0)?;
        let values = split_heads(&self.value.forward(xs)?, self.heads)?;
        let mixed = attend(&queries, &keys, &values, None)?;
        Ok(self.output.forward(&merge_heads(&mixed)?)?)
    }
}

pub struct Exit {
    pub modulation: Linear,
    pub projection: Linear,
}

impl Exit {
    pub fn forward(&self, xs: &Tensor, time: &Tensor) -> Result<Tensor> {
        let controls = controls(&self.modulation, time, 2)?;
        let [scale, shift] = controls.as_slice() else {
            anyhow::bail!("exit modulation must have two parts");
        };
        Ok(self.projection.forward(&modulate(xs, scale, shift)?)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    #[test]
    fn modulation_scales_around_one_and_shifts() {
        let xs = Tensor::new(&[[[1.0f32, 3.0]]], &Device::Cpu).unwrap();
        let scale = Tensor::new(&[[1.0f32, 1.0]], &Device::Cpu).unwrap();
        let shift = Tensor::new(&[[10.0f32, 20.0]], &Device::Cpu).unwrap();
        let out = modulate(&xs, &scale, &shift).unwrap();
        let out = out.flatten_all().unwrap().to_vec1::<f32>().unwrap();
        assert!((out[0] - 8.0).abs() < 1e-4 && (out[1] - 22.0).abs() < 1e-4);
    }

    #[test]
    fn controls_split_the_modulation_evenly() {
        let weight = Tensor::ones((6, 2), DType::F32, &Device::Cpu).unwrap();
        let time = Tensor::zeros((1, 2), DType::F32, &Device::Cpu).unwrap();
        let parts = controls(&Linear::new(weight, None), &time, 3).unwrap();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].dims(), [1, 2]);
    }
}
