pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }

    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);

        let mut mixed = self.0;

        mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);

        mixed ^ (mixed >> 31)
    }

    pub fn unit(&mut self) -> f32 {
        (self.next() >> 40) as f32 / (1u64 << 24) as f32
    }

    pub fn normal(&mut self) -> f32 {
        let radius = (-2.0 * self.unit().max(f32::MIN_POSITIVE).ln()).sqrt();

        radius * (std::f32::consts::TAU * self.unit()).cos()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_gives_the_same_stream() {
        let mut a = Rng::new(7);
        let mut b = Rng::new(7);

        assert!((0..64).all(|_| a.next() == b.next()));
    }

    #[test]
    fn unit_stays_in_range() {
        let mut rng = Rng::new(1);

        assert!((0..10_000)
            .map(|_| rng.unit())
            .all(|value| (0.0..1.0).contains(&value)));
    }

    #[test]
    fn normal_has_unit_variance() {
        let mut rng = Rng::new(3);
        let draws: Vec<f32> = (0..50_000).map(|_| rng.normal()).collect();
        let mean = draws.iter().sum::<f32>() / draws.len() as f32;
        let variance = draws.iter().map(|d| (d - mean).powi(2)).sum::<f32>() / draws.len() as f32;

        assert!(mean.abs() < 0.02, "mean {mean}");
        assert!((variance - 1.0).abs() < 0.03, "variance {variance}");
    }
}
