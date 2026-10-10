use anyhow::Result;
use candle_core::Tensor;
use candle_nn::{Linear, Module};

use crate::net::attention::{attend, merge_heads, split_heads};
use crate::net::norm::LayerNorm;

pub struct EncoderLayer {
    pub attention: SelfAttention,
    pub attention_norm: LayerNorm,
    pub expand: Linear,
    pub contract: Linear,
    pub feedforward_norm: LayerNorm,
}

impl EncoderLayer {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let attended = self.attention.forward(&self.attention_norm.forward(xs)?)?;
        let xs = (xs + attended)?;
        let expanded = self.expand.forward(&self.feedforward_norm.forward(&xs)?)?;
        Ok((&xs + self.contract.forward(&expanded.gelu_erf()?)?)?)
    }
}

pub struct SelfAttention {
    pub heads: usize,
    pub query: Linear,
    pub key: Linear,
    pub value: Linear,
    pub output: Linear,
}

impl SelfAttention {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let queries = split_heads(&self.query.forward(xs)?, self.heads)?;
        let keys = split_heads(&self.key.forward(xs)?, self.heads)?;
        let values = split_heads(&self.value.forward(xs)?, self.heads)?;
        let mixed = attend(&queries, &keys, &values, None)?;
        Ok(self.output.forward(&merge_heads(&mixed)?)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    fn identity(width: usize) -> Linear {
        Linear::new(Tensor::eye(width, DType::F32, &Device::Cpu).unwrap(), None)
    }

    #[test]
    fn attention_with_identical_rows_returns_them() {
        let attention = SelfAttention {
            heads: 2,
            query: identity(4),
            key: identity(4),
            value: identity(4),
            output: identity(4),
        };
        let row = [1.0f32, -2.0, 0.5, 3.0];
        let xs = Tensor::new(&[[row, row, row]], &Device::Cpu).unwrap();
        let out = attention.forward(&xs).unwrap().to_vec3::<f32>().unwrap();
        for actual in &out[0] {
            for (a, e) in actual.iter().zip(&row) {
                assert!((a - e).abs() < 1e-6);
            }
        }
    }
}
