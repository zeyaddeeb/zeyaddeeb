use super::primes::primes_up_to;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mertens {
    pub x: u64,
    pub value: i64,
    pub worst_ratio: f64,
    pub worst_at: u64,
    pub samples: Vec<(u64, i64)>,
}

pub fn mertens(x: u64) -> Mertens {
    let x = x.clamp(1, 200_000_000);
    let root = (x as f64).sqrt() as usize + 1;
    let primes = primes_up_to(root);
    let block = 1 << 16;
    let mut total: i64 = 0;
    let mut worst_ratio = 0.0;
    let mut worst_at = 1;
    let mut samples = Vec::new();
    let mut next_sample = 1.0_f64;
    let mut mu = vec![1i8; block];
    let mut rest = vec![0u64; block];
    let mut low = 1u64;
    while low <= x {
        let high = (low + block as u64 - 1).min(x);
        let size = (high - low + 1) as usize;
        for i in 0..size {
            mu[i] = 1;
            rest[i] = low + i as u64;
        }
        for &p in &primes {
            let p = p as u64;
            if p * p > high && p > high {
                break;
            }
            let mut m = low.div_ceil(p) * p;
            while m <= high {
                let i = (m - low) as usize;
                mu[i] = -mu[i];
                rest[i] /= p;
                m += p;
            }
            let square = p * p;
            let mut m = low.div_ceil(square) * square;
            while m <= high {
                mu[(m - low) as usize] = 0;
                m += square;
            }
        }
        for i in 0..size {
            let n = low + i as u64;
            let mut value = mu[i] as i64;
            if value != 0 && rest[i] > 1 {
                value = -value;
            }
            total += value;
            if n >= 100 {
                let ratio = total.unsigned_abs() as f64 / (n as f64).sqrt();
                if ratio > worst_ratio {
                    worst_ratio = ratio;
                    worst_at = n;
                }
            }
            if n as f64 >= next_sample || n == x {
                samples.push((n, total));
                next_sample = (next_sample * 1.25).max(n as f64 + 1.0);
            }
        }
        low = high + 1;
    }
    Mertens {
        x,
        value: total,
        worst_ratio,
        worst_at,
        samples,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mertens_matches_known_values() {
        for (x, value) in [
            (10, -1),
            (100, 1),
            (1000, 2),
            (10_000, -23),
            (100_000, -48),
            (1_000_000, 212),
        ] {
            assert_eq!(mertens(x).value, value, "M({x})");
        }
    }
}
