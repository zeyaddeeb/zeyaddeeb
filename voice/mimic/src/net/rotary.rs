use anyhow::Result;
use candle_core::{Device, Tensor};

const BASE: f32 = 10_000.0;

pub struct Rotary {
    cos: Tensor,
    sin: Tensor,
}

impl Rotary {
    pub fn new(head_width: usize, positions: usize) -> Result<Self> {
        let rates = rates(head_width);
        let angles: Vec<f32> = (0..positions)
            .flat_map(|position| rates.iter().map(move |rate| position as f32 * rate))
            .collect();
        let table = |f: fn(f32) -> f32| {
            let values: Vec<f32> = angles.iter().map(|&angle| f(angle)).collect();
            Tensor::from_vec(values, (positions, rates.len()), &Device::Cpu)
        };
        Ok(Self {
            cos: table(f32::cos)?,
            sin: table(f32::sin)?,
        })
    }

    pub fn rotate(&self, xs: &Tensor, start: usize) -> Result<Tensor> {
        let steps = xs.dim(2)?;
        let cos = self.cos.narrow(0, start, steps)?;
        let sin = self.sin.narrow(0, start, steps)?;
        Ok(candle_nn::rotary_emb::rope(xs, &cos, &sin)?)
    }
}

fn rates(head_width: usize) -> Vec<f32> {
    (0..head_width / 2)
        .map(|pair| 1.0 / BASE.powf((2 * pair) as f32 / head_width as f32))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};

    fn flat(xs: &Tensor) -> Vec<f32> {
        xs.flatten_all().unwrap().to_vec1().unwrap()
    }

    #[test]
    fn rates_fall_geometrically_from_one() {
        let rates = rates(8);
        assert_eq!(rates.len(), 4);
        assert_eq!(rates[0], 1.0);
        assert!((rates[1] - 0.1).abs() < 1e-7);
        assert!((rates[3] - 0.001).abs() < 1e-9);
    }

    #[test]
    fn position_zero_is_the_identity() {
        let rotary = Rotary::new(4, 8).unwrap();
        let xs = Tensor::new(&[[[[1.0f32, 2.0, 3.0, 4.0]]]], &Device::Cpu).unwrap();
        assert_eq!(flat(&rotary.rotate(&xs, 0).unwrap()), [1.0, 2.0, 3.0, 4.0]);
    }

    #[test]
    fn rotation_pairs_the_two_halves() {
        let rotary = Rotary::new(4, 8).unwrap();
        let xs = Tensor::new(&[[[[1.0f32, 0.0, 0.0, 0.0]]]], &Device::Cpu).unwrap();
        let out = flat(&rotary.rotate(&xs, 3).unwrap());
        assert!((out[0] - 3f32.cos()).abs() < 1e-6);
        assert!((out[2] - 3f32.sin()).abs() < 1e-6);
        assert_eq!((out[1], out[3]), (0.0, 0.0));
    }

    #[test]
    fn rotation_preserves_dot_products_at_equal_offsets() {
        let rotary = Rotary::new(8, 64).unwrap();
        let a = Tensor::randn(0f32, 1.0, (1, 1, 1, 8), &Device::Cpu).unwrap();
        let b = Tensor::randn(0f32, 1.0, (1, 1, 1, 8), &Device::Cpu).unwrap();
        let dot = |pa: usize, pb: usize| -> f32 {
            let ra = flat(&rotary.rotate(&a, pa).unwrap());
            let rb = flat(&rotary.rotate(&b, pb).unwrap());
            ra.iter().zip(&rb).map(|(x, y)| x * y).sum()
        };
        assert!((dot(5, 2) - dot(40, 37)).abs() < 1e-4);
    }

    #[test]
    fn parity_tables_match_reference() {
        let Some(fixture) = Fixture::load("tables") else {
            return;
        };
        let rotary = Rotary::new(64, 2048).unwrap();
        let cos = testing::compare(
            "rotary cos",
            &flat(&rotary.cos),
            &fixture.floats("rotary_cos_half"),
        );
        let sin = testing::compare(
            "rotary sin",
            &flat(&rotary.sin),
            &fixture.floats("rotary_sin_half"),
        );
        assert!(cos.max_abs < 1e-6 && sin.max_abs < 1e-6, "{cos:?} {sin:?}");
    }
}
