use anyhow::Result;
use candle_core::{Tensor, D};

const SOFTPLUS_LINEAR_ABOVE: f32 = 20.0;
const THREADED_SOFTMAX_FROM: usize = 1 << 15;

pub fn softmax(xs: &Tensor) -> Result<Tensor> {
    if xs.elem_count() >= THREADED_SOFTMAX_FROM {
        return Ok(candle_nn::ops::softmax_last_dim(&xs.contiguous()?)?);
    }
    let width = xs.dim(D::Minus1)?;
    let mut values: Vec<f32> = xs.flatten_all()?.to_vec1()?;
    values.chunks_exact_mut(width).for_each(softmax_row);
    Ok(Tensor::from_vec(values, xs.shape(), xs.device())?)
}

fn softmax_row(row: &mut [f32]) {
    let peak = row.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    row.iter_mut()
        .for_each(|value| *value = (*value - peak).exp());
    let total: f32 = row.iter().sum();
    row.iter_mut().for_each(|value| *value /= total);
}

pub fn mish(xs: &Tensor) -> Result<Tensor> {
    map(xs, |x| x * softplus(x).tanh())
}

pub fn leaky_relu(xs: &Tensor, slope: f32) -> Result<Tensor> {
    map(xs, |x| if x < 0.0 { x * slope } else { x })
}

pub fn sigmoid(xs: &Tensor) -> Result<Tensor> {
    map(xs, |x| 1.0 / (1.0 + (-x).exp()))
}

fn softplus(x: f32) -> f32 {
    if x > SOFTPLUS_LINEAR_ABOVE {
        x
    } else {
        x.exp().ln_1p()
    }
}

fn map(xs: &Tensor, f: impl Fn(f32) -> f32) -> Result<Tensor> {
    let values: Vec<f32> = xs.flatten_all()?.to_vec1()?;
    let mapped: Vec<f32> = values.into_iter().map(f).collect();
    Ok(Tensor::from_vec(mapped, xs.shape(), xs.device())?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    fn apply(f: impl Fn(&Tensor) -> Result<Tensor>, values: &[f32]) -> Vec<f32> {
        let xs = Tensor::new(values, &Device::Cpu).unwrap();
        f(&xs).unwrap().to_vec1().unwrap()
    }

    fn assert_close(actual: &[f32], expected: &[f32]) {
        for (a, e) in actual.iter().zip(expected) {
            assert!((a - e).abs() <= 1e-6 * e.abs().max(1.0), "{a} vs {e}");
        }
    }

    #[test]
    fn mish_matches_reference_values() {
        let actual = apply(mish, &[-30.0, -5.0, -1.0, 0.0, 0.5, 3.0, 25.0]);
        let expected = [
            -2.807_287e-12,
            -0.033_576_235,
            -0.303_401_47,
            0.0,
            0.375_245_2,
            2.986_535,
            25.0,
        ];
        assert_close(&actual, &expected);
        assert!((actual[0] - expected[0]).abs() < 1e-17);
    }

    #[test]
    fn leaky_relu_scales_only_negatives() {
        let actual = apply(|x| leaky_relu(x, 0.1), &[-2.0, 0.0, 3.0]);
        assert_close(&actual, &[-0.2, 0.0, 3.0]);
    }

    #[test]
    fn sigmoid_is_symmetric_around_half() {
        let actual = apply(sigmoid, &[-2.0, 0.0, 2.0]);
        assert_close(&actual, &[0.119_202_92, 0.5, 0.880_797_1]);
    }

    #[test]
    fn softmax_rows_sum_to_one_and_ignore_masked_entries() {
        let xs = Tensor::new(
            &[[0.0f32, 0.0, f32::NEG_INFINITY], [1.0, 2.0, 3.0]],
            &Device::Cpu,
        );
        let out = softmax(&xs.unwrap()).unwrap().to_vec2::<f32>().unwrap();
        assert_eq!(out[0], [0.5, 0.5, 0.0]);
        assert_close(&out[1], &[0.090_030_57, 0.244_728_47, 0.665_240_94]);
    }

    #[test]
    fn small_and_large_softmax_agree() {
        let rows = THREADED_SOFTMAX_FROM / 64;
        let xs = Tensor::randn(0f32, 2.0, (rows, 64), &Device::Cpu).unwrap();
        let large: Vec<f32> = softmax(&xs)
            .unwrap()
            .flatten_all()
            .unwrap()
            .to_vec1()
            .unwrap();
        let head = softmax(&xs.narrow(0, 0, 4).unwrap()).unwrap();
        let small: Vec<f32> = head.flatten_all().unwrap().to_vec1().unwrap();
        assert_close(&small, &large[..small.len()]);
    }

    #[test]
    fn map_keeps_the_shape() {
        let xs = Tensor::zeros((2, 3, 4), candle_core::DType::F32, &Device::Cpu).unwrap();
        assert_eq!(sigmoid(&xs).unwrap().dims(), [2, 3, 4]);
    }
}
