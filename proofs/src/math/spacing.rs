use serde::Serialize;
use std::f64::consts::PI;

const KOLMOGOROV_95: f64 = 1.358;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spacing {
    pub zeros: usize,
    pub histogram: Vec<f64>,
    pub gue: Vec<f64>,
    pub poisson: Vec<f64>,
    pub distance_gue: f64,
    pub distance_poisson: f64,
    pub critical: f64,
    pub smallest: f64,
    pub pair: Vec<f64>,
    pub pair_theory: Vec<f64>,
}

fn wigner(s: f64) -> f64 {
    32.0 / (PI * PI) * s * s * (-4.0 * s * s / PI).exp()
}

fn wigner_cdf(s: f64) -> f64 {
    erf(2.0 * s / PI.sqrt()) - 4.0 * s / PI * (-4.0 * s * s / PI).exp()
}

fn erf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.5 * x.abs());

    let poly = -x * x - 1.265_512_23
        + t * (1.000_023_68
            + t * (0.374_091_96
                + t * (0.096_784_18
                    + t * (-0.186_288_06
                        + t * (0.278_868_07
                            + t * (-1.135_203_98
                                + t * (1.488_515_87 + t * (-0.822_152_23 + t * 0.170_872_77))))))));

    let value = 1.0 - t * poly.exp();

    if x >= 0.0 {
        value
    } else {
        -value
    }
}

pub fn spacing(zeros: &[f64]) -> Spacing {
    let bins = 30;
    let width = 0.1;

    let unfolded: Vec<f64> = zeros
        .iter()
        .map(|&t| t / (2.0 * PI) * (t / (2.0 * PI * std::f64::consts::E)).ln())
        .collect();

    let mut gaps: Vec<f64> = unfolded.windows(2).map(|w| w[1] - w[0]).collect();
    let mut histogram = vec![0.0; bins];

    for &gap in &gaps {
        let bin = (gap / width) as usize;

        if bin < bins {
            histogram[bin] += 1.0;
        }
    }

    let count = gaps.len().max(1) as f64;

    for value in &mut histogram {
        *value /= count * width;
    }

    let centers: Vec<f64> = (0..bins).map(|i| (i as f64 + 0.5) * width).collect();
    let gue = centers.iter().map(|&s| wigner(s)).collect();
    let poisson = centers.iter().map(|&s| (-s).exp()).collect();

    gaps.sort_by(f64::total_cmp);

    let mut distance_gue: f64 = 0.0;
    let mut distance_poisson: f64 = 0.0;

    for (index, &gap) in gaps.iter().enumerate() {
        let empirical_low = index as f64 / count;
        let empirical_high = (index + 1) as f64 / count;
        let g = wigner_cdf(gap);
        let p = 1.0 - (-gap).exp();

        distance_gue = distance_gue
            .max((g - empirical_low).abs())
            .max((g - empirical_high).abs());

        distance_poisson = distance_poisson
            .max((p - empirical_low).abs())
            .max((p - empirical_high).abs());
    }

    let pair_bins = 30;
    let pair_width = 0.1;
    let mut pair = vec![0.0; pair_bins];

    for i in 0..unfolded.len() {
        for j in i + 1..unfolded.len() {
            let difference = unfolded[j] - unfolded[i];
            let bin = (difference / pair_width) as usize;

            if bin >= pair_bins {
                break;
            }

            pair[bin] += 1.0;
        }
    }

    let normalizer = unfolded.len().max(1) as f64 * pair_width;

    for value in &mut pair {
        *value /= normalizer;
    }

    let pair_theory = (0..pair_bins)
        .map(|i| {
            let u = (i as f64 + 0.5) * pair_width;
            let sinc = (PI * u).sin() / (PI * u);

            1.0 - sinc * sinc
        })
        .collect();

    Spacing {
        zeros: zeros.len(),
        histogram,
        gue,
        poisson,
        distance_gue,
        distance_poisson,
        critical: KOLMOGOROV_95 / count.sqrt(),
        smallest: gaps.first().copied().unwrap_or(f64::NAN),
        pair,
        pair_theory,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_gaps_look_like_gue_not_poisson() {
        let zeros = crate::math::line::scan(10.0, 3000.0).zeros;
        let result = spacing(&zeros);

        assert!(
            result.distance_poisson > 10.0 * result.critical,
            "{result:?}"
        );

        assert!(result.distance_gue < 2.0 * result.critical, "{result:?}");
        assert!(result.distance_gue > result.critical, "{result:?}");
    }

    #[test]
    fn erf_is_accurate() {
        assert!((erf(1.0) - 0.842_700_792_949_715).abs() < 1e-7);
        assert!((erf(0.3) - 0.328_626_759_459_127_4).abs() < 1e-7);
    }
}
