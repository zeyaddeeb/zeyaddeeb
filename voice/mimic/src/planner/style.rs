use anyhow::Result;
use candle_core::Tensor;
use candle_nn::{Linear, Module};

use crate::net::attention::{attend, merge_heads, split_heads};
use crate::net::norm::RmsNorm;

pub struct StyleReader {
    pub heads: usize,
    pub slots: Tensor,
    pub memory_norm: RmsNorm,
    pub query: Linear,
    pub key: Linear,
    pub value: Linear,
    pub output: Linear,
    pub final_norm: RmsNorm,
}

impl StyleReader {
    pub fn forward(&self, reference: &Tensor) -> Result<Tensor> {
        let slots = self.slots.unsqueeze(0)?;
        let memory = self.memory_norm.forward(reference)?;
        let queries = split_heads(&self.query.forward(&slots)?, self.heads)?;
        let keys = split_heads(&self.key.forward(&memory)?, self.heads)?;
        let values = split_heads(&self.value.forward(&memory)?, self.heads)?;
        let read = merge_heads(&attend(&queries, &keys, &values, None)?)?;
        self.final_norm
            .forward(&(slots + self.output.forward(&read)?)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    #[test]
    fn output_has_one_row_per_slot_whatever_the_reference_length() {
        let width = 8;
        let linear = || {
            Linear::new(
                Tensor::randn(0f32, 0.5, (width, width), &Device::Cpu).unwrap(),
                None,
            )
        };
        let norm = || RmsNorm::new(Tensor::ones(width, DType::F32, &Device::Cpu).unwrap());
        let reader = StyleReader {
            heads: 2,
            slots: Tensor::randn(0f32, 1.0, (3, width), &Device::Cpu).unwrap(),
            memory_norm: norm(),
            query: linear(),
            key: linear(),
            value: linear(),
            output: linear(),
            final_norm: norm(),
        };
        for length in [1, 7] {
            let reference = Tensor::randn(0f32, 1.0, (1, length, width), &Device::Cpu).unwrap();
            let out = reader.forward(&reference).unwrap();
            assert_eq!(out.dims(), [1, 3, width]);
            let rms: Vec<f32> = out
                .sqr()
                .unwrap()
                .mean(2)
                .unwrap()
                .flatten_all()
                .unwrap()
                .to_vec1()
                .unwrap();
            assert!(rms.iter().all(|value| (value - 1.0).abs() < 1e-3));
        }
    }
}
