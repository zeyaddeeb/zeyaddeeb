use std::f64::consts::TAU;

const SPLITMIX_INCREMENT: u64 = 0x9E37_79B9_7F4A_7C15;
const UNIT_SCALE: f64 = 1.0 / (1u64 << 53) as f64;

pub struct Rng {
    state: [u64; 4],
    spare_normal: Option<f64>,
}

impl Rng {
    pub fn seeded(seed: u64) -> Self {
        let mut mixer = seed;
        let state = std::array::from_fn(|_| splitmix64(&mut mixer));
        Self {
            state,
            spare_normal: None,
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        let [s0, s1, s2, s3] = self.state;
        let result = s0.wrapping_add(s3).rotate_left(23).wrapping_add(s0);
        let shifted = s1 << 17;
        let s2 = s2 ^ s0;
        let s3 = s3 ^ s1;
        let s1 = s1 ^ s2;
        let s0 = s0 ^ s3;
        self.state = [s0, s1, s2 ^ shifted, s3.rotate_left(45)];
        result
    }

    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * UNIT_SCALE
    }

    pub fn normal(&mut self) -> f64 {
        if let Some(spare) = self.spare_normal.take() {
            return spare;
        }
        let radius = (-2.0 * (1.0 - self.uniform()).ln()).sqrt();
        let angle = TAU * self.uniform();
        self.spare_normal = Some(radius * angle.sin());
        radius * angle.cos()
    }

    pub fn normal_vec(&mut self, len: usize) -> Vec<f32> {
        (0..len).map(|_| self.normal() as f32).collect()
    }
}

fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(SPLITMIX_INCREMENT);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix_matches_reference_vector() {
        let mut state = 1234567u64;
        let expected = [
            6457827717110365317u64,
            3203168211198807973,
            9817491932198370423,
            4593380528125082431,
            16408922859458223821,
        ];
        for value in expected {
            assert_eq!(splitmix64(&mut state), value);
        }
    }

    #[test]
    fn same_seed_gives_same_stream() {
        let mut a = Rng::seeded(42);
        let mut b = Rng::seeded(42);
        let mut c = Rng::seeded(43);
        let first: Vec<u64> = (0..8).map(|_| a.next_u64()).collect();
        let second: Vec<u64> = (0..8).map(|_| b.next_u64()).collect();
        let third: Vec<u64> = (0..8).map(|_| c.next_u64()).collect();
        assert_eq!(first, second);
        assert_ne!(first, third);
    }

    #[test]
    fn uniform_stays_in_unit_interval() {
        let mut rng = Rng::seeded(7);
        let draws: Vec<f64> = (0..10_000).map(|_| rng.uniform()).collect();
        assert!(draws.iter().all(|u| (0.0..1.0).contains(u)));
        let mean = draws.iter().sum::<f64>() / draws.len() as f64;
        assert!((mean - 0.5).abs() < 0.02);
    }

    #[test]
    fn normal_has_unit_moments() {
        let mut rng = Rng::seeded(9);
        let draws = rng.normal_vec(200_000);
        let n = draws.len() as f64;
        let mean = draws.iter().map(|&x| f64::from(x)).sum::<f64>() / n;
        let var = draws
            .iter()
            .map(|&x| (f64::from(x) - mean).powi(2))
            .sum::<f64>()
            / n;
        assert!(mean.abs() < 0.01, "mean {mean}");
        assert!((var - 1.0).abs() < 0.02, "variance {var}");
        assert!(draws.iter().all(|x| x.is_finite()));
    }
}
