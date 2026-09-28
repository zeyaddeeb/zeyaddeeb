use super::primes::primes_up_to;
use serde::Serialize;

pub const EULER_GAMMA: f64 = 0.577_215_664_901_532_9;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Robin {
    pub label: String,
    pub digits: f64,
    pub sigma_over_n: f64,
    pub bound: f64,
    pub ratio: f64,
    pub margin: f64,
    pub exponents: Vec<(usize, u32)>,
}

fn robin_from(label: String, factors: Vec<(usize, u32)>) -> Robin {
    let mut ln_n = 0.0;
    let mut ln_ratio = 0.0;
    for &(p, a) in &factors {
        let pf = p as f64;
        ln_n += a as f64 * pf.ln();
        ln_ratio += (-(pf.powi(-(a as i32 + 1)))).ln_1p() - (-1.0 / pf).ln_1p();
    }
    let sigma_over_n = ln_ratio.exp();
    let bound = EULER_GAMMA.exp() * ln_n.ln();
    let ratio = sigma_over_n / bound;
    Robin {
        label,
        digits: ln_n / 10f64.ln(),
        sigma_over_n,
        bound,
        ratio,
        margin: 1.0 - ratio,
        exponents: factors.into_iter().take(12).collect(),
    }
}

pub fn robin_integer(n: u64) -> Robin {
    let mut rest = n;
    let mut factors = Vec::new();
    let mut p = 2u64;
    while p * p <= rest {
        let mut a = 0;
        while rest.is_multiple_of(p) {
            rest /= p;
            a += 1;
        }
        if a > 0 {
            factors.push((p as usize, a));
        }
        p += if p == 2 { 1 } else { 2 };
    }
    if rest > 1 {
        factors.push((rest as usize, 1));
    }
    robin_from(n.to_string(), factors)
}

pub fn colossally_abundant(epsilon: f64) -> Robin {
    let epsilon = epsilon.clamp(1e-6, 1.0);
    let limit = ((2.0 / epsilon) as usize).clamp(100, 4_000_000);
    let mut factors = Vec::new();
    for p in primes_up_to(limit) {
        let ln_p = (p as f64).ln();
        let top = ((1.0 + epsilon) * ln_p).exp_m1();
        let bottom = (epsilon * ln_p).exp_m1();
        let exponent = ((top / bottom).ln() / ln_p).floor() as i64 - 1;
        if exponent < 1 {
            break;
        }
        factors.push((p, exponent as u32));
    }
    robin_from(format!("CA(ε={epsilon:e})"), factors)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn robin_fails_at_5040_and_holds_after() {
        assert!(robin_integer(5040).ratio > 1.0);
        assert!(robin_integer(10080).ratio < 1.0);
        assert!(robin_integer(55440).ratio < 1.0);
    }

    #[test]
    fn colossally_abundant_numbers_stay_below_robin() {
        let sixty = colossally_abundant(0.1);
        assert!((sixty.digits - 60f64.log10()).abs() < 1e-12);
        assert!(sixty.ratio > 1.0);
        for epsilon in [0.01, 0.001, 0.0001, 0.00001] {
            let result = colossally_abundant(epsilon);
            assert!(result.digits > 5040f64.log10(), "{result:?}");
            assert!(result.ratio < 1.0, "{result:?}");
        }
        let small = colossally_abundant(0.34);
        assert!(small.exponents.len() <= 4, "{small:?}");
    }
}
