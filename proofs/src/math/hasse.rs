use super::primes::primes_up_to;
use serde::Serialize;
use std::f64::consts::PI;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hasse {
    pub a: i64,
    pub b: i64,
    pub primes: usize,
    pub worst_ratio: f64,
    pub worst_prime: u64,
    pub angles: Vec<f64>,
    pub sato_tate: Vec<f64>,
}

pub fn hasse(a: i64, b: i64, limit: u64) -> Hasse {
    let limit = limit.clamp(5, 30_000) as usize;
    let bins = 12;
    let mut angles = vec![0.0; bins];
    let mut worst_ratio: f64 = 0.0;
    let mut worst_prime = 0;
    let mut used = 0;
    for p in primes_up_to(limit).into_iter().filter(|&p| p > 3) {
        let pm = p as i64;
        let discriminant =
            (4 * a.rem_euclid(pm).pow(3) + 27 * b.rem_euclid(pm).pow(2)).rem_euclid(pm);
        if discriminant == 0 {
            continue;
        }
        let mut character = vec![-1i64; p];
        character[0] = 0;
        for x in 1..p {
            character[x * x % p] = 1;
        }
        let mut sum = 0i64;
        for x in 0..p as i64 {
            let value = (x * x % pm * x + a.rem_euclid(pm) * x + b.rem_euclid(pm)).rem_euclid(pm);
            sum += character[value as usize];
        }
        let trace = -sum;
        let scale = 2.0 * (p as f64).sqrt();
        let ratio = trace.unsigned_abs() as f64 / scale;
        if ratio > worst_ratio {
            worst_ratio = ratio;
            worst_prime = p as u64;
        }
        let angle = (trace as f64 / scale).clamp(-1.0, 1.0).acos();
        let bin = ((angle / PI) * bins as f64).min(bins as f64 - 1.0) as usize;
        angles[bin] += 1.0;
        used += 1;
    }
    let width = PI / bins as f64;
    for value in &mut angles {
        *value /= used.max(1) as f64 * width;
    }
    let sato_tate = (0..bins)
        .map(|i| {
            let theta = (i as f64 + 0.5) * width;
            2.0 / PI * theta.sin().powi(2)
        })
        .collect();
    Hasse {
        a,
        b,
        primes: used,
        worst_ratio,
        worst_prime,
        angles,
        sato_tate,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hasse_bound_holds_for_a_curve() {
        let result = hasse(-1, 1, 3000);
        assert!(result.primes > 300);
        assert!(result.worst_ratio <= 1.0, "{result:?}");
    }
}
