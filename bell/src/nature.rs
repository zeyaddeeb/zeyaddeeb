use rand::{Rng, RngExt};

const AGREE: [f64; 6] = [1.0, 0.75, 0.25, 0.0, 0.25, 0.75];

pub fn step(from: u8, to: u8) -> u8 {
    (to % 6 + 6 - from % 6) % 6
}

pub fn agree(step: u8) -> f64 {
    AGREE[usize::from(step % 6)]
}

pub fn follow(rng: &mut impl Rng, step: u8, other: bool) -> bool {
    if rng.random_bool(agree(step)) {
        other
    } else {
        !other
    }
}

pub fn pair(rng: &mut impl Rng, first: u8, second: u8) -> (bool, bool) {
    let a = rng.random_bool(0.5);

    (a, follow(rng, step(first, second), a))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agreement_is_cos_squared_of_the_angle() {
        for s in 0..6u8 {
            let angle = (f64::from(s) * 30.0).to_radians();

            assert!((agree(s) - angle.cos().powi(2)).abs() < 1e-12);
        }
    }

    #[test]
    fn steps_wrap_around_the_half_turn() {
        assert_eq!(step(5, 0), 1);
        assert_eq!(step(0, 5), 5);
        assert_eq!(step(3, 3), 0);
    }
}
