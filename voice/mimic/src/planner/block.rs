use anyhow::Result;
use candle_core::Tensor;
use candle_nn::{Linear, Module};

use super::memory::Memory;
use crate::net::attention::{attend, merge_heads, past_only_mask, split_heads};
use crate::net::norm::RmsNorm;

pub struct PlannerBlock {
    pub attention_norm: RmsNorm,
    pub attention: CachedAttention,
    pub attention_gain: Tensor,
    pub feedforward_norm: RmsNorm,
    pub feedforward: GatedFeedForward,
    pub feedforward_gain: Tensor,
}

impl PlannerBlock {
    pub fn forward(&self, xs: &Tensor, memory: &mut Memory, layer: usize) -> Result<Tensor> {
        let normed = self.attention_norm.forward(xs)?;
        let attended = self.attention.forward(&normed, memory, layer)?;
        let xs = (xs + attended.broadcast_mul(&self.attention_gain)?)?;
        let fed = self
            .feedforward
            .forward(&self.feedforward_norm.forward(&xs)?)?;
        Ok((xs + fed.broadcast_mul(&self.feedforward_gain)?)?)
    }
}

pub struct CachedAttention {
    pub heads: usize,
    pub query: Linear,
    pub key: Linear,
    pub value: Linear,
    pub output: Linear,
    pub query_norm: RmsNorm,
    pub key_norm: RmsNorm,
}

impl CachedAttention {
    pub fn forward(&self, xs: &Tensor, memory: &mut Memory, layer: usize) -> Result<Tensor> {
        let steps = xs.dim(1)?;
        let queries = split_heads(&self.query.forward(xs)?, self.heads)?;
        let keys = split_heads(&self.key.forward(xs)?, self.heads)?;
        let values = split_heads(&self.value.forward(xs)?, self.heads)?;
        let queries = memory.rotate(&self.query_norm.forward(&queries)?)?;
        let keys = memory.rotate(&self.key_norm.forward(&keys)?)?;
        let (keys, values) = memory.remember(layer, &keys, &values)?;
        let mask = (steps > 1)
            .then(|| past_only_mask(steps, memory.length() + steps))
            .transpose()?;
        let mixed = attend(&queries, &keys, &values, mask.as_ref())?;
        Ok(self.output.forward(&merge_heads(&mixed)?)?)
    }
}

pub struct GatedFeedForward {
    pub gate: Linear,
    pub up: Linear,
    pub down: Linear,
}

impl GatedFeedForward {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let gated = (self.gate.forward(xs)?.silu()? * self.up.forward(xs)?)?;
        Ok(self.down.forward(&gated)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    fn random(shape: (usize, usize)) -> Linear {
        Linear::new(Tensor::randn(0f32, 0.5, shape, &Device::Cpu).unwrap(), None)
    }

    fn ones(width: usize) -> RmsNorm {
        RmsNorm::new(Tensor::ones(width, DType::F32, &Device::Cpu).unwrap())
    }

    fn attention() -> CachedAttention {
        CachedAttention {
            heads: 2,
            query: random((8, 8)),
            key: random((8, 8)),
            value: random((8, 8)),
            output: random((8, 8)),
            query_norm: ones(4),
            key_norm: ones(4),
        }
    }

    #[test]
    fn stepwise_decoding_matches_one_causal_pass() {
        let attention = attention();
        let xs = Tensor::randn(0f32, 1.0, (1, 5, 8), &Device::Cpu).unwrap();
        let mut whole = Memory::new(1, 4, 5).unwrap();
        let expected = attention.forward(&xs, &mut whole, 0).unwrap();
        let mut memory = Memory::new(1, 4, 5).unwrap();
        let prefix = attention
            .forward(&xs.narrow(1, 0, 3).unwrap(), &mut memory, 0)
            .unwrap();
        memory.advance(3);
        let mut rows = vec![prefix];
        for step in 3..5 {
            rows.push(
                attention
                    .forward(&xs.narrow(1, step, 1).unwrap(), &mut memory, 0)
                    .unwrap(),
            );
            memory.advance(1);
        }
        let actual = Tensor::cat(&rows, 1).unwrap();
        let flat = |t: &Tensor| t.flatten_all().unwrap().to_vec1::<f32>().unwrap();
        for (a, e) in flat(&actual).iter().zip(flat(&expected)) {
            assert!((a - e).abs() < 1e-5, "{a} vs {e}");
        }
    }

    #[test]
    fn gated_feedforward_multiplies_the_two_branches() {
        let weight = |value: f32| Linear::new(Tensor::new(&[[value]], &Device::Cpu).unwrap(), None);
        let layer = GatedFeedForward {
            gate: weight(1.0),
            up: weight(3.0),
            down: weight(2.0),
        };
        let out = layer
            .forward(&Tensor::new(&[[2.0f32]], &Device::Cpu).unwrap())
            .unwrap();
        let silu = 2.0f32 / (1.0 + (-2.0f32).exp());
        let actual = out.flatten_all().unwrap().to_vec1::<f32>().unwrap()[0];
        assert!((actual - silu * 6.0 * 2.0).abs() < 1e-5);
    }
}
