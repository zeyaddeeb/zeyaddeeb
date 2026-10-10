use anyhow::Result;
use candle_core::{Device, Tensor, D};
use candle_nn::{Linear, Module};

use crate::net::norm::LayerNorm;

pub struct Quantizer {
    pub norm: LayerNorm,
    pub head: Linear,
    pub levels: Vec<usize>,
}

impl Quantizer {
    pub fn digit_scores(&self, rows: &Tensor) -> Result<Tensor> {
        Ok(self.head.forward(&self.norm.forward(rows)?)?)
    }

    pub fn quantize(&self, rows: &Tensor) -> Result<Vec<u32>> {
        let scores = self.digit_scores(rows)?;
        let mut units = vec![0u32; scores.dim(1)?];
        let (mut offset, mut place) = (0, 1u32);
        for &level in &self.levels {
            let digits = scores.narrow(D::Minus1, offset, level)?.argmax(D::Minus1)?;
            let digits: Vec<u32> = digits.flatten_all()?.to_vec1()?;
            for (unit, digit) in units.iter_mut().zip(digits) {
                *unit += digit * place;
            }
            offset += level;
            place *= level as u32;
        }
        Ok(units)
    }
}

struct Blend {
    left: Vec<u32>,
    right: Vec<u32>,
    weight: Vec<f32>,
}

fn blend(source_rows: usize, target_rows: usize) -> Blend {
    let ratio = source_rows as f32 / target_rows as f32;
    let last = (source_rows - 1) as f32;
    let positions = (0..target_rows).map(|row| ((row as f32 + 0.5) * ratio - 0.5).clamp(0.0, last));
    let mut blend = Blend {
        left: Vec::with_capacity(target_rows),
        right: Vec::with_capacity(target_rows),
        weight: Vec::with_capacity(target_rows),
    };
    for position in positions {
        let left = position.floor();
        blend.left.push(left as u32);
        blend
            .right
            .push((left as u32 + 1).min(source_rows as u32 - 1));
        blend.weight.push(position - left);
    }
    blend
}

pub fn resample_rows(rows: &Tensor, target_rows: usize) -> Result<Tensor> {
    let blend = blend(rows.dim(1)?, target_rows);
    let device = Device::Cpu;
    let pick = |ids: Vec<u32>| -> Result<Tensor> {
        Ok(rows.index_select(&Tensor::from_vec(ids, target_rows, &device)?, 1)?)
    };
    let weight = Tensor::from_vec(blend.weight, (1, target_rows, 1), &device)?;
    let left = pick(blend.left)?.broadcast_mul(&weight.affine(-1.0, 1.0)?)?;
    let right = pick(blend.right)?.broadcast_mul(&weight)?;
    Ok((left + right)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::DType;

    fn rows(values: &[f32], count: usize) -> Tensor {
        Tensor::from_slice(values, (1, count, values.len() / count), &Device::Cpu).unwrap()
    }

    fn flat(xs: &Tensor) -> Vec<f32> {
        xs.flatten_all().unwrap().to_vec1().unwrap()
    }

    #[test]
    fn blending_uses_half_sample_centers() {
        let blend = blend(4, 2);
        assert_eq!(blend.left, [0, 2]);
        assert_eq!(blend.right, [1, 3]);
        assert_eq!(blend.weight, [0.5, 0.5]);
        let up = super::blend(2, 4);
        assert_eq!(up.left, [0, 0, 0, 1]);
        assert_eq!(up.right, [1, 1, 1, 1]);
        assert_eq!(up.weight, [0.0, 0.25, 0.75, 0.0]);
    }

    #[test]
    fn resampling_interpolates_linearly_and_clamps_the_ends() {
        let xs = rows(&[0.0, 10.0], 2);
        assert_eq!(flat(&resample_rows(&xs, 4).unwrap()), [0.0, 2.5, 7.5, 10.0]);
        let same = rows(&[1.0, 2.0, 3.0], 3);
        assert_eq!(flat(&resample_rows(&same, 3).unwrap()), [1.0, 2.0, 3.0]);
        let single = rows(&[4.0], 1);
        assert_eq!(flat(&resample_rows(&single, 3).unwrap()), [4.0, 4.0, 4.0]);
    }

    #[test]
    fn digits_combine_in_mixed_radix() {
        let width = 5;
        let quantizer = Quantizer {
            norm: LayerNorm::new(
                (
                    Tensor::ones(width, DType::F32, &Device::Cpu).unwrap(),
                    Tensor::zeros(width, DType::F32, &Device::Cpu).unwrap(),
                ),
                1e-5,
            ),
            head: Linear::new(Tensor::eye(width, DType::F32, &Device::Cpu).unwrap(), None),
            levels: vec![3, 2],
        };
        let xs = rows(&[0.0, 0.0, 9.0, 0.0, 5.0, 9.0, 0.0, 0.0, 5.0, 0.0], 2);
        assert_eq!(quantizer.quantize(&xs).unwrap(), [2 + 3, 0]);
    }
}
