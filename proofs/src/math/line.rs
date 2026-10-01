use super::zeta::{hardy, theta};
use serde::Serialize;
use std::f64::consts::PI;

const REFINEMENTS: [usize; 4] = [2, 8, 32, 128];
const SAME_ZERO: f64 = 1e-9;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Certificate {
    pub gram: i64,
    pub height: f64,
    pub blocks: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stretch {
    pub from: f64,
    pub to: f64,
    pub first_gram: i64,
    pub last_gram: i64,
    pub zeros: Vec<f64>,
    pub expected: i64,
    pub missing: i64,
    pub bad_gram: usize,
    pub evaluations: usize,
    pub closest_pair: Option<(f64, f64)>,
    pub certified: Option<Certificate>,
}

pub fn brent_blocks(t: f64) -> usize {
    let log = t.max(1.0).ln();

    ((0.0061 * log * log + 0.08 * log).ceil() as usize).max(2)
}

pub fn distinct(zeros: &mut Vec<f64>) {
    zeros.sort_by(f64::total_cmp);
    zeros.dedup_by(|a, b| (*a - *b).abs() <= SAME_ZERO * b.abs().max(1.0));
}

pub fn gram_point(n: i64) -> f64 {
    let target = n as f64 * PI;

    let mut t = if n < 0 {
        9.0
    } else {
        18.0 + 2.0 * PI * n as f64 / (1.0 + (n as f64 + 1.0).ln())
    };

    for _ in 0..100 {
        let step = (theta(t) - target) / (0.5 * (t / (2.0 * PI)).ln()).max(0.05);

        t = (t - step).max(7.0);

        if step.abs() < 1e-12 * t {
            break;
        }
    }

    t
}

pub fn smooth_count(t: f64) -> f64 {
    theta(t) / PI + 1.0
}

struct Grid {
    first: i64,
    points: Vec<f64>,
    values: Vec<f64>,
    evaluations: usize,
}

impl Grid {
    fn new(from: f64, to: f64) -> Self {
        let first = ((theta(from) / PI).floor() as i64).max(-1);
        let last = ((theta(to) / PI).ceil() as i64).max(first + 1);
        let points: Vec<f64> = (first..=last).map(gram_point).collect();
        let values: Vec<f64> = points.iter().map(|&g| hardy(g)).collect();

        Grid {
            first,
            evaluations: points.len(),
            points,
            values,
        }
    }

    fn good(&self, index: usize) -> bool {
        let parity = if (self.first + index as i64).rem_euclid(2) == 0 {
            1.0
        } else {
            -1.0
        };

        parity * self.values[index] > 0.0
    }

    fn blocks(&self) -> Vec<(usize, usize)> {
        let mut blocks = Vec::new();
        let mut start = 0;

        while start + 1 < self.points.len() {
            let mut end = start + 1;

            while end + 1 < self.points.len() && !self.good(end) {
                end += 1;
            }

            blocks.push((start, end));
            start = end;
        }

        blocks
    }

    fn zeros_between(&mut self, start: usize, end: usize, pieces: usize) -> Vec<f64> {
        let mut found = Vec::new();

        for i in start..end {
            let (left, right) = (self.points[i], self.points[i + 1]);
            let mut previous = (left, self.values[i]);

            for piece in 1..=pieces {
                let current = if piece == pieces {
                    (right, self.values[i + 1])
                } else {
                    let t = left + (right - left) * piece as f64 / pieces as f64;

                    self.evaluations += 1;

                    (t, hardy(t))
                };

                if previous.1.signum() != current.1.signum() {
                    found.push(refine(previous, current));
                }

                previous = current;
            }
        }

        found
    }
}

fn refine((mut a, mut fa): (f64, f64), (mut b, mut fb): (f64, f64)) -> f64 {
    let mut side = 0;

    for _ in 0..80 {
        let c = (a * fb - b * fa) / (fb - fa);
        let fc = hardy(c);

        if fc == 0.0 || (b - a).abs() < 1e-11 * b {
            return c;
        }

        if fc.signum() == fb.signum() {
            (b, fb) = (c, fc);

            if side == -1 {
                fa /= 2.0;
            }

            side = -1;
        } else {
            (a, fa) = (c, fc);

            if side == 1 {
                fb /= 2.0;
            }

            side = 1;
        }
    }

    (a + b) / 2.0
}

pub fn scan(from: f64, to: f64) -> Stretch {
    let mut grid = Grid::new(from.max(10.0), to);
    let mut zeros = Vec::new();
    let mut missing = 0;
    let mut rosser = Vec::new();

    for (start, end) in grid.blocks() {
        let expected = end - start;
        let closed = grid.good(start) && grid.good(end);
        let mut found = Vec::new();

        for pieces in REFINEMENTS {
            found = grid.zeros_between(start, end, pieces);

            if found.len() >= expected || !closed {
                break;
            }
        }

        if closed && found.len() < expected {
            missing += (expected - found.len()) as i64;
        }

        rosser.push((start, closed && found.len() >= expected));
        zeros.extend(found);
    }

    distinct(&mut zeros);

    let (first, last) = (grid.points[0], grid.points[grid.points.len() - 1]);
    let certified = certify(&grid, &rosser, last);

    let closest_pair = zeros
        .windows(2)
        .min_by(|x, y| (x[1] - x[0]).total_cmp(&(y[1] - y[0])))
        .map(|w| (w[0], w[1]));

    Stretch {
        from: first,
        to: last,
        first_gram: grid.first,
        last_gram: grid.first + grid.points.len() as i64 - 1,
        expected: (smooth_count(last).round() - smooth_count(first).round()) as i64,
        missing,
        bad_gram: (0..grid.points.len()).filter(|&i| !grid.good(i)).count(),
        evaluations: grid.evaluations,
        closest_pair,
        zeros,
        certified,
    }
}

fn certify(grid: &Grid, rosser: &[(usize, bool)], top: f64) -> Option<Certificate> {
    let blocks = brent_blocks(top);
    let last = rosser.len().checked_sub(blocks)?;

    (0..=last)
        .rev()
        .find(|&i| rosser[i..i + blocks].iter().all(|&(_, held)| held))
        .map(|i| {
            let start = rosser[i].0;

            Certificate {
                gram: grid.first + start as i64,
                height: grid.points[start],
                blocks,
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ODLYZKO: [f64; 10] = [
        14.134725141734,
        21.022039638771,
        25.010857580145,
        30.424876125859,
        32.935061587739,
        37.586178158825,
        40.918719012147,
        43.327073280914,
        48.005150881167,
        49.773832477672,
    ];

    #[test]
    fn gram_points_match_tables() {
        assert!((gram_point(0) - 17.8455995405).abs() < 1e-8);
        assert!((gram_point(1) - 23.1702827012).abs() < 1e-8);
    }

    #[test]
    fn first_ten_zeros_match_odlyzko() {
        let result = scan(10.0, 50.5);
        let found: Vec<f64> = result.zeros.iter().copied().filter(|&z| z < 50.0).collect();

        assert_eq!(found.len(), 10, "{found:?}");

        for (got, want) in found.iter().zip(ODLYZKO) {
            assert!((got - want).abs() < 1e-8, "{got} vs {want}");
        }

        assert_eq!(result.missing, 0);
    }

    #[test]
    fn counts_match_riemann_von_mangoldt_up_to_one_thousand() {
        let result = scan(10.0, 1000.0);

        assert_eq!(result.missing, 0);
        assert_eq!(result.zeros.iter().filter(|&&z| z <= 1000.0).count(), 649);
    }

    #[test]
    fn lehmer_pair_near_7005_is_resolved() {
        let result = scan(7004.0, 7006.0);

        let pair: Vec<f64> = result
            .zeros
            .iter()
            .copied()
            .filter(|&z| (7005.0..7005.2).contains(&z))
            .collect();

        assert_eq!(pair.len(), 2, "{:?}", result.zeros);
        assert_eq!(result.missing, 0);
    }

    #[test]
    fn turing_certifies_the_count_below_the_last_rosser_blocks() {
        let result = scan(10.0, 1000.0);
        let certificate = result.certified.expect("Rosser holds below 1000");

        assert!(certificate.height > 950.0 && certificate.height < result.to);
        assert!(certificate.blocks >= 2);

        let below = result
            .zeros
            .iter()
            .filter(|&&z| z <= certificate.height)
            .count() as i64;

        assert_eq!(below, certificate.gram + 1);
    }

    #[test]
    fn brent_asks_for_more_blocks_higher_up() {
        assert_eq!(brent_blocks(1000.0), 2);
        assert_eq!(brent_blocks(1e6), 3);
        assert!(brent_blocks(3e12) > brent_blocks(1e6));
    }

    #[test]
    fn distinct_merges_the_same_zero_found_twice() {
        let mut zeros = vec![1_000.000_000_1, 14.134_725, 1_000.0, 14.134_725_000_000_1];

        distinct(&mut zeros);
        assert_eq!(zeros.len(), 2);
    }
}
