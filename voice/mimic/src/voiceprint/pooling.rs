use anyhow::Result;
use candle_core::{Tensor, D};
use candle_nn::{Conv1d, Module};

use crate::net::activation::softmax;
use crate::net::conv::Padding;

const VARIANCE_FLOOR: f64 = 1e-6;
const LOCAL_WINDOW: usize = 5;

pub struct AttentivePool {
    pub score: Conv1d,
    pub weigh: Conv1d,
}

impl AttentivePool {
    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let scores = self.weigh.forward(&self.score.forward(xs)?.tanh()?)?;
        let weights = softmax(&scores)?;
        let mean = xs.broadcast_mul(&weights)?.sum(D::Minus1)?;
        let centered = xs.broadcast_sub(&mean.unsqueeze(D::Minus1)?)?;
        let variance = centered.sqr()?.broadcast_mul(&weights)?.sum(D::Minus1)?;
        let deviation = variance.maximum(VARIANCE_FLOOR)?.sqrt()?;
        Ok(Tensor::cat(&[&mean, &deviation], 1)?)
    }
}

pub fn spread_statistics(xs: &Tensor) -> Result<Tensor> {
    let frames = xs.dim(D::Minus1)? as f64;
    let mut statistics = Vec::with_capacity(4);
    for view in [xs.clone(), local_average(xs)?] {
        let mean = (view.sum(D::Minus1)? / frames)?;
        let centered = view.broadcast_sub(&mean.unsqueeze(D::Minus1)?)?;
        let variance = (centered.sqr()?.sum(D::Minus1)? / frames)?;
        statistics.push(mean);
        statistics.push(variance.maximum(VARIANCE_FLOOR)?.sqrt()?);
    }
    Ok(Tensor::cat(&statistics, 1)?)
}

fn local_average(xs: &Tensor) -> Result<Tensor> {
    let frames = xs.dim(D::Minus1)?;
    let padded = Padding::centered(LOCAL_WINDOW - 1).apply(xs)?;
    let mut total = padded.narrow(D::Minus1, 0, frames)?;
    for shift in 1..LOCAL_WINDOW {
        total = (total + padded.narrow(D::Minus1, shift, frames)?)?;
    }
    Ok((total / LOCAL_WINDOW as f64)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;
    use candle_nn::Conv1dConfig;

    fn flat(xs: &Tensor) -> Vec<f32> {
        xs.flatten_all().unwrap().to_vec1().unwrap()
    }

    #[test]
    fn local_average_counts_the_zero_padding() {
        let xs = Tensor::new(&[[[5.0f32, 5.0, 5.0, 5.0, 5.0, 5.0]]], &Device::Cpu).unwrap();
        assert_eq!(
            flat(&local_average(&xs).unwrap()),
            [3.0, 4.0, 5.0, 5.0, 4.0, 3.0]
        );
    }

    #[test]
    fn spread_statistics_are_mean_and_deviation_at_two_scales() {
        let xs = Tensor::new(&[[[1.0f32, 3.0], [2.0, 2.0]]], &Device::Cpu).unwrap();
        let out = flat(&spread_statistics(&xs).unwrap());
        assert_eq!(out.len(), 8);
        assert_eq!((out[0], out[1]), (2.0, 2.0));
        assert!((out[2] - 1.0).abs() < 1e-6);
        assert!((out[3] - 1e-3).abs() < 1e-6);
        assert!((out[4] - 0.8).abs() < 1e-6 && (out[5] - 0.8).abs() < 1e-6);
    }

    #[test]
    fn uniform_attention_gives_plain_mean_and_deviation() {
        let zeros = |outputs: usize, inputs: usize| {
            let weight = Tensor::zeros((outputs, inputs, 1), candle_core::DType::F32, &Device::Cpu);
            let bias = Tensor::zeros(outputs, candle_core::DType::F32, &Device::Cpu);
            Conv1d::new(
                weight.unwrap(),
                Some(bias.unwrap()),
                Conv1dConfig::default(),
            )
        };
        let pool = AttentivePool {
            score: zeros(3, 1),
            weigh: zeros(1, 3),
        };
        let xs = Tensor::new(&[[[1.0f32, 3.0, 5.0, 7.0]]], &Device::Cpu).unwrap();
        let out = flat(&pool.forward(&xs).unwrap());
        assert!((out[0] - 4.0).abs() < 1e-6);
        assert!((out[1] - 5f32.sqrt()).abs() < 1e-6);
    }
}
