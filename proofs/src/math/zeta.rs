use num_complex::Complex64 as C;
use std::f64::consts::PI;

const BERNOULLI: [f64; 15] = [
    1.0 / 6.0,
    -1.0 / 30.0,
    1.0 / 42.0,
    -1.0 / 30.0,
    5.0 / 66.0,
    -691.0 / 2730.0,
    7.0 / 6.0,
    -3617.0 / 510.0,
    43867.0 / 798.0,
    -174611.0 / 330.0,
    854513.0 / 138.0,
    -236364091.0 / 2730.0,
    8553103.0 / 6.0,
    -23749461029.0 / 870.0,
    8615841276005.0 / 14322.0,
];

pub const EXACT_BELOW: f64 = 400.0;

fn power(base: f64, exponent: C) -> C {
    (exponent * base.ln()).exp()
}

pub fn zeta(s: C) -> C {
    let n = (s.im.abs() / 2.0 + 20.0).ceil() as usize;
    let mut sum = C::new(0.0, 0.0);

    for k in 1..n {
        sum += power(k as f64, -s);
    }

    let nf = n as f64;
    let n_s = power(nf, -s);

    sum += n_s * nf / (s - 1.0) + n_s * 0.5;

    let mut rising = s;
    let mut factorial = 2.0;
    let mut n_power = n_s / nf;

    for (index, bernoulli) in BERNOULLI.iter().enumerate() {
        let term = rising * n_power * (bernoulli / factorial);

        sum += term;

        if term.norm() < 1e-17 * sum.norm() {
            break;
        }

        let a = 2.0 * (index + 1) as f64;

        rising *= (s + (a - 1.0)) * (s + a);
        factorial *= (a + 1.0) * (a + 2.0);
        n_power /= nf * nf;
    }

    sum
}

fn ln_gamma(z: C) -> C {
    let shift = 10;
    let mut w = z;
    let mut correction = C::new(0.0, 0.0);

    for _ in 0..shift {
        correction += w.ln();
        w += 1.0;
    }

    let mut series = (w - 0.5) * w.ln() - w + 0.5 * (2.0 * PI).ln();
    let inverse = w.inv();
    let square = inverse * inverse;
    let mut power = inverse;

    for (index, bernoulli) in BERNOULLI.iter().take(8).enumerate() {
        let k = (index + 1) as f64;

        series += power * (bernoulli / (2.0 * k * (2.0 * k - 1.0)));
        power *= square;
    }

    series - correction
}

pub fn theta(t: f64) -> f64 {
    ln_gamma(C::new(0.25, t / 2.0)).im - t / 2.0 * PI.ln()
}

pub fn hardy_exact(t: f64) -> f64 {
    (C::from_polar(1.0, theta(t)) * zeta(C::new(0.5, t))).re
}

fn psi(p: f64) -> f64 {
    let den = (2.0 * PI * p).cos();

    if den.abs() < 1e-4 {
        return (psi(p - 2e-4) + psi(p + 2e-4)) / 2.0;
    }

    (2.0 * PI * (p * p - p - 1.0 / 16.0)).cos() / den
}

pub fn hardy_fast(t: f64) -> f64 {
    let a = (t / (2.0 * PI)).sqrt();
    let n = a.floor() as usize;
    let p = a - n as f64;
    let angle = theta(t);
    let mut sum = 0.0;

    for k in 1..=n {
        let k = k as f64;

        sum += (angle - t * k.ln()).cos() / k.sqrt();
    }

    let sign = if n % 2 == 1 { 1.0 } else { -1.0 };

    2.0 * sum + sign * psi(p) / a.sqrt()
}

const GABCKE: f64 = 0.127;

pub fn fast_error_bound(t: f64) -> f64 {
    GABCKE * (t / (2.0 * PI)).powf(-0.75)
}

pub fn hardy(t: f64) -> f64 {
    if t < EXACT_BELOW {
        return hardy_exact(t);
    }

    let fast = hardy_fast(t);

    if fast.abs() < 2.0 * fast_error_bound(t) {
        hardy_exact(t)
    } else {
        fast
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zeta_matches_closed_forms() {
        let two = zeta(C::new(2.0, 0.0));

        assert!((two.re - PI * PI / 6.0).abs() < 1e-13, "{two}");

        let four = zeta(C::new(4.0, 0.0));

        assert!((four.re - PI.powi(4) / 90.0).abs() < 1e-13, "{four}");

        let half = zeta(C::new(0.5, 0.0));

        assert!((half.re + 1.4603545088095868).abs() < 1e-12, "{half}");

        let minus = zeta(C::new(-1.0, 0.0));

        assert!((minus.re + 1.0 / 12.0).abs() < 1e-12, "{minus}");
    }

    #[test]
    fn theta_crosses_zero_at_the_first_gram_point() {
        assert!(theta(17.845599540).abs() < 1e-8, "{}", theta(17.845599540));
    }

    #[test]
    fn fast_formula_stays_inside_its_bound() {
        let mut worst: f64 = 0.0;
        let mut t = 400.0;

        while t < 3000.0 {
            let gap = (hardy_fast(t) - hardy_exact(t)).abs() / fast_error_bound(t);

            worst = worst.max(gap);
            t += 3.7;
        }

        assert!(worst < 1.0, "worst ratio {worst}");
    }
}
