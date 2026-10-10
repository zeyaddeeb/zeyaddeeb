use anyhow::Result;
use candle_core::{Tensor, D};

const RMS_EPS: f32 = 1e-6;

pub struct RmsNorm {
    gain: Tensor,
}

impl RmsNorm {
    pub fn new(gain: Tensor) -> Self {
        Self { gain }
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        Ok(candle_nn::ops::rms_norm(
            &xs.contiguous()?,
            &self.gain,
            RMS_EPS,
        )?)
    }
}

pub fn standardize(xs: &Tensor, eps: f64) -> Result<Tensor> {
    let centered = xs.broadcast_sub(&xs.mean_keepdim(D::Minus1)?)?;
    let variance = centered.sqr()?.mean_keepdim(D::Minus1)?;
    Ok(centered.broadcast_div(&(variance + eps)?.sqrt()?)?)
}

pub struct LayerNorm {
    gain: Tensor,
    bias: Tensor,
    eps: f64,
}

impl LayerNorm {
    pub fn new((gain, bias): (Tensor, Tensor), eps: f64) -> Self {
        Self { gain, bias, eps }
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let normed = standardize(xs, self.eps)?;
        Ok(normed
            .broadcast_mul(&self.gain)?
            .broadcast_add(&self.bias)?)
    }
}

pub struct ChannelNorm {
    gain: Tensor,
    bias: Tensor,
    eps: f64,
}

impl ChannelNorm {
    pub fn new((gain, bias): (Tensor, Tensor), eps: f64) -> Result<Self> {
        let channels = gain.elem_count();
        Ok(Self {
            gain: gain.reshape((1, channels, 1))?,
            bias: bias.reshape((1, channels, 1))?,
            eps,
        })
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let normed = standardize(&xs.flatten_from(1)?, self.eps)?.reshape(xs.shape())?;
        Ok(normed
            .broadcast_mul(&self.gain)?
            .broadcast_add(&self.bias)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    fn tensor(values: &[f32], shape: &[usize]) -> Tensor {
        Tensor::from_slice(values, shape, &Device::Cpu).unwrap()
    }

    fn flat(xs: &Tensor) -> Vec<f32> {
        xs.flatten_all().unwrap().to_vec1().unwrap()
    }

    fn assert_close(actual: &[f32], expected: &[f32]) {
        assert_eq!(actual.len(), expected.len());
        for (a, e) in actual.iter().zip(expected) {
            assert!((a - e).abs() < 1e-5, "{actual:?} vs {expected:?}");
        }
    }

    #[test]
    fn standardize_gives_zero_mean_unit_variance_rows() {
        let xs = tensor(&[1.0, 2.0, 3.0, 4.0, 10.0, 10.0, 10.0, 14.0], &[2, 4]);
        let out = flat(&standardize(&xs, 0.0).unwrap());
        assert_close(
            &out[..4],
            &[-1.341_640_8, -0.447_213_6, 0.447_213_6, 1.341_640_8],
        );
        assert_close(
            &out[4..],
            &[-0.577_350_26, -0.577_350_26, -0.577_350_26, 1.732_050_8],
        );
    }

    #[test]
    fn standardize_survives_large_offsets() {
        let xs = tensor(&[1000.0, 1000.5, 1001.0, 1001.5], &[1, 4]);
        let out = flat(&standardize(&xs, 0.0).unwrap());
        assert_close(
            &out,
            &[-1.341_640_8, -0.447_213_6, 0.447_213_6, 1.341_640_8],
        );
    }

    #[test]
    fn layer_norm_applies_gain_and_bias() {
        let norm = LayerNorm::new((tensor(&[2.0, 2.0], &[2]), tensor(&[1.0, -1.0], &[2])), 0.0);
        let out = flat(&norm.forward(&tensor(&[0.0, 4.0], &[1, 1, 2])).unwrap());
        assert_close(&out, &[-1.0, 1.0]);
    }

    #[test]
    fn rms_norm_divides_by_root_mean_square() {
        let norm = RmsNorm::new(tensor(&[1.0, 2.0], &[2]));
        let out = flat(&norm.forward(&tensor(&[3.0, 4.0], &[1, 1, 2])).unwrap());
        let rms = (12.5f32 + RMS_EPS).sqrt();
        assert_close(&out, &[3.0 / rms, 8.0 / rms]);
    }

    #[test]
    fn channel_norm_uses_statistics_of_the_whole_clip() {
        let gain = tensor(&[1.0, 10.0], &[2]);
        let bias = tensor(&[0.0, 1.0], &[2]);
        let norm = ChannelNorm::new((gain, bias), 0.0).unwrap();
        let xs = tensor(&[1.0, 2.0, 3.0, 4.0], &[1, 2, 2]);
        let out = flat(&norm.forward(&xs).unwrap());
        assert_close(&out, &[-1.341_640_8, -0.447_213_6, 5.472_136, 14.416_408]);
    }
}
