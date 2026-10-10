use anyhow::Result;
use candle_core::{Device, Tensor};

use super::activation::softmax;

const WHOLE_SCORES_UP_TO: usize = 1 << 22;

pub fn split_heads(xs: &Tensor, heads: usize) -> Result<Tensor> {
    let (batch, steps, width) = xs.dims3()?;
    let split = xs.reshape((batch, steps, heads, width / heads))?;
    Ok(split.transpose(1, 2)?.contiguous()?)
}

pub fn merge_heads(xs: &Tensor) -> Result<Tensor> {
    let (batch, heads, steps, head_width) = xs.dims4()?;
    Ok(xs
        .transpose(1, 2)?
        .contiguous()?
        .reshape((batch, steps, heads * head_width))?)
}

pub fn attend(
    queries: &Tensor,
    keys: &Tensor,
    values: &Tensor,
    mask: Option<&Tensor>,
) -> Result<Tensor> {
    let (_, heads, steps, _) = queries.dims4()?;
    if heads * steps * keys.dim(2)? <= WHOLE_SCORES_UP_TO {
        return attend_together(queries, keys, values, mask);
    }
    let by_head = (0..heads)
        .map(|head| {
            let one = |xs: &Tensor| xs.narrow(1, head, 1);
            attend_together(&one(queries)?, &one(keys)?, &one(values)?, mask)
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Tensor::cat(&by_head, 1)?)
}

fn attend_together(
    queries: &Tensor,
    keys: &Tensor,
    values: &Tensor,
    mask: Option<&Tensor>,
) -> Result<Tensor> {
    let scale = (queries.dim(3)? as f64).sqrt().recip();
    let scores = (queries * scale)?.matmul(&keys.transpose(2, 3)?)?;
    let scores = match mask {
        Some(mask) => scores.broadcast_add(mask)?,
        None => scores,
    };
    Ok(softmax(&scores)?.matmul(values)?)
}

pub fn past_only_mask(queries: usize, keys: usize) -> Result<Tensor> {
    let first_query = keys - queries;
    let mask: Vec<f32> = (0..queries)
        .flat_map(|query| {
            (0..keys).map(move |key| {
                if key <= first_query + query {
                    0.0
                } else {
                    f32::NEG_INFINITY
                }
            })
        })
        .collect();
    Ok(Tensor::from_vec(mask, (queries, keys), &Device::Cpu)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(xs: &Tensor) -> Vec<f32> {
        xs.flatten_all().unwrap().to_vec1().unwrap()
    }

    #[test]
    fn heads_split_and_merge_round_trip() {
        let xs = Tensor::arange(0f32, 24.0, &Device::Cpu)
            .unwrap()
            .reshape((1, 3, 8))
            .unwrap();
        let split = split_heads(&xs, 2).unwrap();
        assert_eq!(split.dims(), [1, 2, 3, 4]);
        assert_eq!(flat(&split)[..4], [0.0, 1.0, 2.0, 3.0]);
        assert_eq!(flat(&split)[12..16], [4.0, 5.0, 6.0, 7.0]);
        assert_eq!(flat(&merge_heads(&split).unwrap()), flat(&xs));
    }

    #[test]
    fn uniform_scores_average_the_values() {
        let queries = Tensor::zeros((1, 1, 2, 4), candle_core::DType::F32, &Device::Cpu).unwrap();
        let keys = Tensor::ones((1, 1, 3, 4), candle_core::DType::F32, &Device::Cpu).unwrap();
        let values = Tensor::new(&[[[[3.0f32], [6.0], [9.0]]]], &Device::Cpu).unwrap();
        let out = attend(&queries, &keys, &values, None).unwrap();
        assert_eq!(flat(&out), [6.0, 6.0]);
    }

    #[test]
    fn scores_are_scaled_by_root_of_head_width() {
        let queries = Tensor::new(&[[[[2.0f32, 0.0, 0.0, 0.0]]]], &Device::Cpu).unwrap();
        let keys = Tensor::new(
            &[[[[1.0f32, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]]],
            &Device::Cpu,
        )
        .unwrap();
        let values = Tensor::new(&[[[[1.0f32], [0.0]]]], &Device::Cpu).unwrap();
        let out = flat(&attend(&queries, &keys, &values, None).unwrap());
        let expected = 1.0 / (1.0 + (-1.0f32).exp());
        assert!((out[0] - expected).abs() < 1e-6);
    }

    #[test]
    fn mask_hides_the_future() {
        let mask = past_only_mask(2, 3).unwrap();
        let rows = mask.to_vec2::<f32>().unwrap();
        assert_eq!(rows[0], [0.0, 0.0, f32::NEG_INFINITY]);
        assert_eq!(rows[1], [0.0, 0.0, 0.0]);
        let square = past_only_mask(3, 3).unwrap().to_vec2::<f32>().unwrap();
        assert_eq!(square[0], [0.0, f32::NEG_INFINITY, f32::NEG_INFINITY]);
        let queries = Tensor::zeros((1, 1, 3, 2), candle_core::DType::F32, &Device::Cpu).unwrap();
        let values = Tensor::new(&[[[[1.0f32], [3.0], [8.0]]]], &Device::Cpu).unwrap();
        let masked = past_only_mask(3, 3).unwrap();
        let out = attend(&queries, &queries, &values, Some(&masked)).unwrap();
        assert_eq!(flat(&out), [1.0, 2.0, 4.0]);
    }

    #[test]
    fn large_score_matrices_are_attended_head_by_head_with_the_same_result() {
        let steps = 1100;
        assert!(4 * steps * steps > WHOLE_SCORES_UP_TO);
        let random = |width: usize| Tensor::randn(0f32, 1.0, (1, 4, steps, width), &Device::Cpu);
        let (queries, keys, values) = (random(8).unwrap(), random(8).unwrap(), random(2).unwrap());
        let split = attend(&queries, &keys, &values, None).unwrap();
        let whole = attend_together(&queries, &keys, &values, None).unwrap();
        assert_eq!(split.dims(), whole.dims());
        for (a, e) in flat(&split).iter().zip(flat(&whole)) {
            assert!((a - e).abs() < 1e-5);
        }
    }
}
