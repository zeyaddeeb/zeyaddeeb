use super::{
    line, mertens, robin,
    zeta::{fast_error_bound, hardy_exact, hardy_fast, zeta},
};
use num_complex::Complex64;
use serde::Serialize;
use std::f64::consts::PI;

const ODLYZKO: [f64; 5] = [
    14.134725141734,
    21.022039638771,
    25.010857580145,
    30.424876125859,
    32.935061587739,
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub name: &'static str,
    pub expected: String,
    pub measured: String,
    pub passed: bool,
}

fn check(name: &'static str, expected: String, measured: String, passed: bool) -> Check {
    Check {
        name,
        expected,
        measured,
        passed,
    }
}

pub fn run() -> Vec<Check> {
    let first = line::scan(10.0, 34.0);

    let worst = first
        .zeros
        .iter()
        .zip(ODLYZKO)
        .map(|(got, want)| (got - want).abs())
        .fold(0.0, f64::max);

    let thousand = line::scan(10.0, 1000.0);
    let counted = thousand.zeros.iter().filter(|&&z| z <= 1000.0).count();

    let turing = thousand.certified.as_ref().is_some_and(|c| {
        thousand.zeros.iter().filter(|&&z| z <= c.height).count() as i64 == c.gram + 1
    });

    let siegel = (0..200)
        .map(|i| 400.0 + 13.37 * i as f64)
        .map(|t| (hardy_fast(t) - hardy_exact(t)).abs() / fast_error_bound(t))
        .fold(0.0, f64::max);

    let two = zeta(Complex64::new(2.0, 0.0));
    let basel = (two.re - PI * PI / 6.0).abs();
    let moebius = mertens::mertens(1_000_000).value;
    let robin = robin::robin_integer(5040).ratio;

    vec![
        check(
            "First five zeros against Odlyzko's table",
            "within 10⁻⁸".into(),
            format!("off by {worst:.1e}"),
            first.zeros.len() >= 5 && worst < 1e-8,
        ),
        check(
            "Zeros up to t = 1000, certified by Turing's method",
            "649".into(),
            counted.to_string(),
            counted == 649 && thousand.missing == 0 && turing,
        ),
        check(
            "Riemann–Siegel inside Gabcke's error bound",
            "below 1 of the bound".into(),
            format!("{siegel:.2} of the bound"),
            siegel < 1.0,
        ),
        check(
            "ζ(2) = π²/6",
            "error below 10⁻¹²".into(),
            format!("error {basel:.1e}"),
            basel < 1e-12,
        ),
        check(
            "Mertens function M(10⁶)",
            "212".into(),
            moebius.to_string(),
            moebius == 212,
        ),
        check(
            "Robin's inequality fails at 5040",
            "ratio above 1".into(),
            format!("{robin:.5}"),
            robin > 1.0,
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_calibration_passes() {
        let checks = run();

        assert_eq!(checks.len(), 6);

        for check in checks {
            assert!(check.passed, "{check:?}");
        }
    }
}
