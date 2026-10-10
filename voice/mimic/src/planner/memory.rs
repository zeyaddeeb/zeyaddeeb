use anyhow::{ensure, Context, Result};
use candle_core::Tensor;
use candle_nn::kv_cache::KvCache;

use crate::net::rotary::Rotary;

const TIME_AXIS: usize = 2;

pub struct Memory {
    layers: Vec<KvCache>,
    rotary: Rotary,
    capacity: usize,
    length: usize,
}

impl Memory {
    pub fn new(layers: usize, head_width: usize, capacity: usize) -> Result<Self> {
        Ok(Self {
            layers: (0..layers)
                .map(|_| KvCache::new(TIME_AXIS, capacity))
                .collect(),
            rotary: Rotary::new(head_width, capacity)?,
            capacity,
            length: 0,
        })
    }

    pub fn length(&self) -> usize {
        self.length
    }

    pub fn advance(&mut self, steps: usize) {
        self.length += steps;
    }

    pub fn rotate(&self, xs: &Tensor) -> Result<Tensor> {
        ensure!(
            self.length + xs.dim(TIME_AXIS)? <= self.capacity,
            "planner memory is full"
        );
        self.rotary.rotate(xs, self.length)
    }

    pub fn remember(
        &mut self,
        layer: usize,
        keys: &Tensor,
        values: &Tensor,
    ) -> Result<(Tensor, Tensor)> {
        let cache = self
            .layers
            .get_mut(layer)
            .context("planner memory has no such layer")?;
        Ok(cache.append(keys, values)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    fn block(steps: usize, fill: f64) -> Tensor {
        Tensor::full(fill as f32, (1, 2, steps, 4), &Device::Cpu).unwrap()
    }

    #[test]
    fn remembered_steps_accumulate_per_layer() {
        let mut memory = Memory::new(2, 4, 8).unwrap();
        let (keys, values) = memory.remember(0, &block(3, 1.0), &block(3, 2.0)).unwrap();
        assert_eq!(keys.dims(), [1, 2, 3, 4]);
        assert_eq!(values.dims(), [1, 2, 3, 4]);
        let (keys, _) = memory.remember(0, &block(1, 5.0), &block(1, 6.0)).unwrap();
        assert_eq!(keys.dims(), [1, 2, 4, 4]);
        let last: Vec<f32> = keys
            .narrow(2, 3, 1)
            .unwrap()
            .flatten_all()
            .unwrap()
            .to_vec1()
            .unwrap();
        assert_eq!(last, [5.0; 8]);
        let (other, _) = memory.remember(1, &block(2, 0.0), &block(2, 0.0)).unwrap();
        assert_eq!(other.dims(), [1, 2, 2, 4]);
        assert!(memory.remember(2, &block(1, 0.0), &block(1, 0.0)).is_err());
    }

    #[test]
    fn rotation_follows_the_running_length_and_capacity() {
        let mut memory = Memory::new(1, 4, 4).unwrap();
        let xs = Tensor::ones((1, 1, 2, 4), DType::F32, &Device::Cpu).unwrap();
        let first = memory.rotate(&xs).unwrap();
        memory.advance(2);
        assert_eq!(memory.length(), 2);
        let second = memory.rotate(&xs).unwrap();
        let flat = |t: &Tensor| t.flatten_all().unwrap().to_vec1::<f32>().unwrap();
        assert_eq!(flat(&first)[..4], [1.0; 4]);
        assert_ne!(flat(&first), flat(&second));
        memory.advance(2);
        assert!(memory.rotate(&xs).is_err());
    }
}
