use anyhow::{Context, Result};
use candle_core::{Tensor, D};
use candle_nn::{Conv1d, Module};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Padding {
    pub left: usize,
    pub right: usize,
}

impl Padding {
    pub const NONE: Self = Self { left: 0, right: 0 };

    pub fn past_only(span: usize) -> Self {
        Self {
            left: span,
            right: 0,
        }
    }

    pub fn with_lookahead(span: usize, lookahead: usize) -> Self {
        Self {
            left: span - lookahead,
            right: lookahead,
        }
    }

    pub fn centered(span: usize) -> Self {
        Self {
            left: span / 2,
            right: span - span / 2,
        }
    }

    pub fn apply(self, xs: &Tensor) -> Result<Tensor> {
        if self == Self::NONE {
            return Ok(xs.clone());
        }
        Ok(xs.pad_with_zeros(D::Minus1, self.left, self.right)?)
    }
}

pub struct PaddedConv {
    conv: Conv1d,
    padding: Padding,
}

impl PaddedConv {
    pub fn new(conv: Conv1d, padding: Padding) -> Self {
        Self { conv, padding }
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        Ok(self.conv.forward(&self.padding.apply(xs)?)?)
    }
}

pub struct DepthwiseConv {
    taps: Vec<Tensor>,
    bias: Tensor,
    dilation: usize,
    padding: Padding,
}

impl DepthwiseConv {
    pub fn new(weight: &Tensor, bias: &Tensor, dilation: usize, padding: Padding) -> Result<Self> {
        let (channels, _, kernel) = weight.dims3()?;
        let taps = (0..kernel)
            .map(|tap| Ok(weight.narrow(2, tap, 1)?.reshape((1, channels, 1))?))
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            taps,
            bias: bias.reshape((1, channels, 1))?,
            dilation,
            padding,
        })
    }

    pub fn span(kernel: usize, dilation: usize) -> usize {
        dilation * (kernel - 1)
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let padded = self.padding.apply(xs)?;
        let frames = padded.dim(D::Minus1)? - Self::span(self.taps.len(), self.dilation);
        let mut total: Option<Tensor> = None;
        for (index, tap) in self.taps.iter().enumerate() {
            let shifted = padded.narrow(D::Minus1, index * self.dilation, frames)?;
            let term = shifted.broadcast_mul(tap)?;
            total = Some(match total {
                Some(sum) => (sum + term)?,
                None => term,
            });
        }
        let total = total.context("depthwise kernel has no taps")?;
        Ok(total.broadcast_add(&self.bias)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;
    use candle_nn::Conv1dConfig;

    fn tensor(values: &[f32], shape: &[usize]) -> Tensor {
        Tensor::from_slice(values, shape, &Device::Cpu).unwrap()
    }

    fn flat(xs: &Tensor) -> Vec<f32> {
        xs.flatten_all().unwrap().to_vec1().unwrap()
    }

    #[test]
    fn padding_variants_split_the_span() {
        assert_eq!(Padding::past_only(6), Padding { left: 6, right: 0 });
        assert_eq!(Padding::with_lookahead(6, 3), Padding { left: 3, right: 3 });
        assert_eq!(Padding::centered(4), Padding { left: 2, right: 2 });
        assert_eq!(Padding::centered(5), Padding { left: 2, right: 3 });
    }

    #[test]
    fn padded_conv_keeps_length_and_sees_only_the_past() {
        let weight = tensor(&[1.0, 10.0, 100.0], &[1, 1, 3]);
        let conv = Conv1d::new(weight, None, Conv1dConfig::default());
        let causal = PaddedConv::new(conv, Padding::past_only(2));
        let out = flat(
            &causal
                .forward(&tensor(&[1.0, 2.0, 3.0, 4.0], &[1, 1, 4]))
                .unwrap(),
        );
        assert_eq!(out, [100.0, 210.0, 321.0, 432.0]);
    }

    #[test]
    fn depthwise_conv_filters_each_channel_alone() {
        let weight = tensor(&[1.0, 0.0, -1.0, 0.5, 0.5, 0.5], &[2, 1, 3]);
        let bias = tensor(&[0.0, 1.0], &[2]);
        let conv = DepthwiseConv::new(&weight, &bias, 1, Padding::centered(2)).unwrap();
        let xs = tensor(&[1.0, 2.0, 4.0, 8.0, 2.0, 2.0, 2.0, 2.0], &[1, 2, 4]);
        let out = flat(&conv.forward(&xs).unwrap());
        assert_eq!(out, [-2.0, -3.0, -6.0, 4.0, 3.0, 4.0, 4.0, 3.0]);
    }

    #[test]
    fn dilation_spreads_the_taps() {
        let weight = tensor(&[1.0, 1.0], &[1, 1, 2]);
        let bias = tensor(&[0.0], &[1]);
        let conv = DepthwiseConv::new(&weight, &bias, 3, Padding::NONE).unwrap();
        let xs = tensor(&[1.0, 2.0, 3.0, 4.0, 5.0], &[1, 1, 5]);
        assert_eq!(flat(&conv.forward(&xs).unwrap()), [5.0, 7.0]);
    }

    #[test]
    fn depthwise_matches_grouped_convolution() {
        let weight = Tensor::randn(0f32, 1.0, (6, 1, 5), &Device::Cpu).unwrap();
        let bias = Tensor::randn(0f32, 1.0, 6, &Device::Cpu).unwrap();
        let xs = Tensor::randn(0f32, 1.0, (1, 6, 40), &Device::Cpu).unwrap();
        let config = Conv1dConfig {
            groups: 6,
            dilation: 2,
            ..Default::default()
        };
        let grouped = Conv1d::new(weight.clone(), Some(bias.clone()), config);
        let padding = Padding::centered(DepthwiseConv::span(5, 2));
        let expected = flat(&grouped.forward(&padding.apply(&xs).unwrap()).unwrap());
        let ours = DepthwiseConv::new(&weight, &bias, 2, padding).unwrap();
        let actual = flat(&ours.forward(&xs).unwrap());
        assert_eq!(actual.len(), expected.len());
        for (a, e) in actual.iter().zip(&expected) {
            assert!((a - e).abs() < 1e-5);
        }
    }
}
