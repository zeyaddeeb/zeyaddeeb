use super::referee::Fields;
use crate::math::{
    contour::{self, Contour},
    hasse, line, mertens, robin, spacing,
    zeta::{hardy, zeta},
};
use num_complex::Complex64;
use serde::Serialize;
use serde_json::{json, Value};

pub const LINE_WIDTH: f64 = 200.0;
pub const LINE_CEILING: f64 = 1_000_000.0;
pub const CONTOUR_HEIGHT: f64 = 40.0;
pub const CONTOUR_CEILING: f64 = 20_000.0;
pub const SPACING_MINIMUM: usize = 50;

#[derive(Debug, Clone)]
pub struct Reading {
    pub summary: String,
    pub fields: Fields,
    pub data: Value,
    pub ungraded: Option<&'static str>,
}

impl Reading {
    fn new(summary: String, fields: Value, data: impl Serialize) -> Self {
        Reading {
            summary,
            fields: fields.as_object().cloned().unwrap_or_default(),
            data: serde_json::to_value(data).unwrap_or(Value::Null),
            ungraded: None,
        }
    }
}

pub fn number(args: &Value, key: &str) -> Option<f64> {
    match &args[key] {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

pub fn line(from: f64, to: f64) -> Result<(Reading, line::Stretch), String> {
    let from = from.max(10.0);

    if from >= LINE_CEILING || to <= from {
        return Err(format!("Heights must satisfy from < to < {LINE_CEILING}."));
    }

    if to - from > LINE_WIDTH {
        return Err(format!("A stretch can be at most {LINE_WIDTH} tall."));
    }

    let stretch = line::scan(from, to);
    let closest_gap = stretch.closest_pair.map_or(f64::NAN, |(a, b)| b - a);

    let summary = format!(
        "Between t = {:.3} and {:.3}: {} zeros on the line, Gram and Rosser expected {}, missing {}. {} bad Gram points; closest pair {:.6} apart{}.",
        stretch.from,
        stretch.to,
        stretch.zeros.len(),
        stretch.expected,
        stretch.missing,
        stretch.bad_gram,
        closest_gap,
        stretch
            .closest_pair
            .map(|(a, _)| format!(" near t = {a:.4}"))
            .unwrap_or_default()
    );

    let fields = json!({
        "zeros": stretch.zeros.len(),
        "expected": stretch.expected,
        "missing": stretch.missing,
        "bad_gram": stretch.bad_gram,
        "closest_gap": closest_gap,
        "from": stretch.from,
        "to": stretch.to,
    });

    Ok((Reading::new(summary, fields, &stretch), stretch))
}

pub fn contour(args: &Value) -> Result<(Reading, Contour), String> {
    let get = |key: &str| number(args, key).ok_or(format!("{key} is required"));
    let sigma = (get("sigma_from")?, get("sigma_to")?);
    let t = (get("t_from")?, get("t_to")?);

    if !(0.505..1.0).contains(&sigma.0) || sigma.1 > 1.0 || sigma.1 <= sigma.0 {
        return Err("Need 0.505 ≤ sigma_from < sigma_to ≤ 1.".into());
    }

    if t.0 < 1.0 || t.1 <= t.0 || t.1 - t.0 > CONTOUR_HEIGHT || t.1 > CONTOUR_CEILING {
        return Err(format!(
            "Need 1 ≤ t_from < t_to ≤ {CONTOUR_CEILING} and a height of at most {CONTOUR_HEIGHT}; the pole at s = 1 stays off the edge."
        ));
    }

    let found = contour::count(sigma, t);

    let summary = match found.zeros {
        Some(n) => format!(
            "The rectangle σ ∈ [{}, {}], t ∈ [{}, {}] holds {} zeros (winding {:.4}, {} evaluations, smallest |ζ| on the edge {:.3e}).",
            sigma.0, sigma.1, t.0, t.1, n, found.winding, found.evaluations, found.smallest
        ),
        None => format!(
            "The rectangle σ ∈ [{}, {}], t ∈ [{}, {}] could not be resolved: the edge passes too close to a zero. Shift it slightly.",
            sigma.0, sigma.1, t.0, t.1
        ),
    };

    let fields = match found.zeros {
        Some(zeros) => {
            json!({"zeros": zeros, "winding": found.winding, "smallest": found.smallest})
        }
        None => json!({"smallest": found.smallest}),
    };

    let mut reading = Reading::new(summary, fields, &found);

    if found.zeros.is_none() {
        reading.ungraded = Some("the rectangle did not resolve, so there is nothing to grade");
    }

    Ok((reading, found))
}

pub fn spacing(zeros: &[f64]) -> Result<Reading, String> {
    if zeros.len() < SPACING_MINIMUM {
        return Err(format!(
            "Only {} zeros are located in that range; locate at least {SPACING_MINIMUM} with line first.",
            zeros.len()
        ));
    }

    let result = spacing::spacing(zeros);

    let summary = format!(
        "{} zeros from t = {:.1} to {:.1}. Kolmogorov distance to GUE (Wigner surmise) {:.4}, to Poisson {:.4}; at 5% a distance above {:.4} rejects a law. Smallest normalized gap {:.4}.",
        result.zeros,
        zeros[0],
        zeros[zeros.len() - 1],
        result.distance_gue,
        result.distance_poisson,
        result.critical,
        result.smallest
    );

    let fields = json!({
        "distance_gue": result.distance_gue,
        "distance_poisson": result.distance_poisson,
        "critical": result.critical,
        "smallest": result.smallest,
        "zeros": result.zeros,
    });

    Ok(Reading::new(summary, fields, &result))
}

pub fn robin(args: &Value) -> Result<Reading, String> {
    let result = if let Some(n) = number(args, "n") {
        if !(1.0..=1e15).contains(&n) {
            return Err("n must be between 1 and 10^15.".into());
        }

        robin::robin_integer(n as u64)
    } else {
        let epsilon = number(args, "epsilon").unwrap_or(0.01);

        if !(1e-6..=1.0).contains(&epsilon) {
            return Err("epsilon must be between 0.000001 and 1.".into());
        }

        robin::colossally_abundant(epsilon)
    };

    let summary = format!(
        "{} has {:.1} digits: σ(n)/n = {:.6}, Robin's bound e^γ log log n = {:.6}, margin {:.3e}{}.",
        result.label,
        result.digits,
        result.sigma_over_n,
        result.bound,
        result.margin,
        if result.margin < 0.0 && result.digits > 5040f64.log10() {
            " — BELOW ZERO past 5040"
        } else {
            ""
        }
    );

    let fields = json!({"margin": result.margin, "ratio": result.ratio, "digits": result.digits});

    Ok(Reading::new(summary, fields, &result))
}

pub fn mertens(args: &Value) -> Result<Reading, String> {
    let x = number(args, "x").ok_or("x is required")?;

    if !(1.0..=2e8).contains(&x) {
        return Err("x must be between 1 and 200 million.".into());
    }

    let result = mertens::mertens(x as u64);

    let summary = format!(
        "M({}) = {}. Largest |M(n)|/√n past 100 is {:.4}, at n = {}.",
        result.x, result.value, result.worst_ratio, result.worst_at
    );

    let fields = json!({
        "value": result.value,
        "worst_ratio": result.worst_ratio,
        "worst_at": result.worst_at,
    });

    Ok(Reading::new(summary, fields, &result))
}

pub fn hasse(args: &Value) -> Result<Reading, String> {
    let a = number(args, "a").ok_or("a is required")?;
    let b = number(args, "b").ok_or("b is required")?;
    let limit = number(args, "primes_up_to").unwrap_or(5000.0);

    if a.abs() > 1e6 || b.abs() > 1e6 || !(5.0..=30_000.0).contains(&limit) {
        return Err("Need |a|, |b| ≤ 10^6 and 5 ≤ primes_up_to ≤ 30000.".into());
    }

    let result = hasse::hasse(a as i64, b as i64, limit as u64);

    let summary = format!(
        "y² = x³ + {}x + {} over {} primes: the largest |a_p|/2√p is {:.4} at p = {}. Hasse's bound says it never exceeds 1.",
        result.a, result.b, result.primes, result.worst_ratio, result.worst_prime
    );

    let fields = json!({"worst_ratio": result.worst_ratio, "primes": result.primes});

    Ok(Reading::new(summary, fields, &result))
}

pub fn zeta_at(args: &Value) -> Result<Reading, String> {
    let re = number(args, "re").ok_or("re is required")?;
    let im = number(args, "im").ok_or("im is required")?;

    if im.abs() > 100_000.0 || re.abs() > 10.0 || (re == 1.0 && im == 0.0) {
        return Err("Need |re| ≤ 10, |im| ≤ 100000 and s ≠ 1.".into());
    }

    let value = zeta(Complex64::new(re, im));
    let z = (re == 0.5 && im > 10.0).then(|| hardy(im));

    let summary = format!(
        "ζ({re} + {im}i) = {:.8} {} {:.8}i, |ζ| = {:.6e}{}.",
        value.re,
        if value.im < 0.0 { "−" } else { "+" },
        value.im.abs(),
        value.norm(),
        z.map(|z| format!(", Z({im}) = {z:.8}")).unwrap_or_default()
    );

    let fields = json!({"re": value.re, "im": value.im, "modulus": value.norm(), "z": z});

    Ok(Reading::new(
        summary,
        fields,
        json!({"s": [re, im], "value": [value.re, value.im], "z": z}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_out_of_range_requests() {
        assert!(line(10.0, 500.0).is_err());
        assert!(line(0.0, 60.0).is_ok());

        assert!(
            contour(&json!({"sigma_from": 0.5, "sigma_to": 0.9, "t_from": 10, "t_to": 20}))
                .is_err()
        );

        assert!(
            contour(&json!({"sigma_from": 0.6, "sigma_to": 0.9, "t_from": 10, "t_to": 90}))
                .is_err()
        );

        assert!(
            contour(&json!({"sigma_from": 0.6, "sigma_to": 1.0, "t_from": 0, "t_to": 20})).is_err()
        );

        assert!(mertens(&json!({"x": 1e12})).is_err());
        assert!(robin(&json!({"epsilon": 0.0})).is_err());
        assert!(zeta_at(&json!({"re": 1, "im": 0})).is_err());
        assert!(spacing(&[14.1, 21.0]).is_err());
    }

    #[test]
    fn readings_expose_gradable_fields() {
        let (reading, stretch) = line(10.0, 60.0).unwrap();

        assert_eq!(reading.fields["missing"], 0);
        assert!(stretch.zeros.len() >= 10);

        let reading = robin(&json!({"epsilon": "0.001"})).unwrap();

        assert!(reading.fields["margin"].as_f64().unwrap() > 0.0);

        let reading = zeta_at(&json!({"re": 0.5, "im": 14.134725141734693})).unwrap();

        assert!(reading.fields["modulus"].as_f64().unwrap() < 1e-8);
    }
}
