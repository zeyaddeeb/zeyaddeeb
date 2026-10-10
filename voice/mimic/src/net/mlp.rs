use anyhow::Result;
use candle_core::Tensor;
use candle_nn::{Linear, Module};

pub struct SiluMlp {
    first: Linear,
    second: Linear,
}

impl SiluMlp {
    pub fn new(first: Linear, second: Linear) -> Self {
        Self { first, second }
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        Ok(self.second.forward(&self.first.forward(xs)?.silu()?)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    #[test]
    fn silu_sits_between_the_two_layers() {
        let weight = |values: &[f32], shape: (usize, usize)| {
            Tensor::from_slice(values, shape, &Device::Cpu).unwrap()
        };
        let mlp = SiluMlp::new(
            Linear::new(weight(&[1.0, -1.0], (2, 1)), None),
            Linear::new(weight(&[1.0, 10.0], (1, 2)), None),
        );
        let out = mlp.forward(&weight(&[2.0], (1, 1))).unwrap();
        let silu = |x: f32| x / (1.0 + (-x).exp());
        let expected = silu(2.0) + 10.0 * silu(-2.0);
        let actual = out.flatten_all().unwrap().to_vec1::<f32>().unwrap()[0];
        assert!((actual - expected).abs() < 1e-6);
    }
}
