use super::zeta::zeta;
use num_complex::Complex64 as C;
use serde::Serialize;
use std::f64::consts::PI;

const STEP: f64 = 0.25;
const DEPTH: u32 = 18;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contour {
    pub sigma: (f64, f64),
    pub t: (f64, f64),
    pub winding: f64,
    pub zeros: Option<i64>,
    pub evaluations: usize,
    pub smallest: f64,
}

struct Trace {
    evaluations: usize,
    smallest: f64,
}

impl Trace {
    fn zeta(&mut self, s: C) -> C {
        let value = zeta(s);

        self.evaluations += 1;
        self.smallest = self.smallest.min(value.norm());

        value
    }

    fn turn(&mut self, from: (C, C), to: (C, C), depth: u32) -> Option<f64> {
        let middle = (from.0 + to.0) / 2.0;
        let value = self.zeta(middle);
        let direct = (to.1 / from.1).arg();
        let first = (value / from.1).arg();
        let second = (to.1 / value).arg();

        let settled = (first + second - direct).abs() < 1e-6
            && first.abs() < PI / 3.0
            && second.abs() < PI / 3.0;

        if settled {
            return Some(first + second);
        }

        if depth == 0 {
            return None;
        }

        Some(
            self.turn(from, (middle, value), depth - 1)?
                + self.turn((middle, value), to, depth - 1)?,
        )
    }
}

pub fn count(sigma: (f64, f64), t: (f64, f64)) -> Contour {
    let corners = [
        C::new(sigma.0, t.0),
        C::new(sigma.1, t.0),
        C::new(sigma.1, t.1),
        C::new(sigma.0, t.1),
    ];

    let mut trace = Trace {
        evaluations: 0,
        smallest: f64::INFINITY,
    };

    let mut points = Vec::new();

    for side in 0..4 {
        let from = corners[side];
        let to = corners[(side + 1) % 4];
        let pieces = ((to - from).norm() / STEP).ceil().max(1.0) as usize;

        points.extend((0..pieces).map(|piece| from + (to - from) * (piece as f64 / pieces as f64)));
    }

    let values: Vec<C> = points.iter().map(|&s| trace.zeta(s)).collect();

    let total = (0..points.len()).try_fold(0.0, |sum, i| {
        let next = (i + 1) % points.len();

        Some(sum + trace.turn((points[i], values[i]), (points[next], values[next]), DEPTH)?)
    });

    let winding = total.map_or(f64::NAN, |sum| sum / (2.0 * PI));
    let rounded = winding.round();

    Contour {
        sigma,
        t,
        winding,
        zeros: ((winding - rounded).abs() < 0.05).then_some(rounded as i64),
        evaluations: trace.evaluations,
        smallest: trace.smallest,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rectangle_around_the_first_zero_holds_one() {
        let around = count((0.4, 0.6), (13.0, 15.0));

        assert_eq!(around.zeros, Some(1), "{around:?}");
    }

    #[test]
    fn a_rectangle_right_of_the_line_holds_none() {
        let right = count((0.55, 0.95), (10.0, 60.0));

        assert_eq!(right.zeros, Some(0), "{right:?}");
    }

    #[test]
    fn two_zeros_between_twenty_and_twenty_six() {
        let strip = count((0.3, 0.7), (20.0, 26.0));

        assert_eq!(strip.zeros, Some(2), "{strip:?}");
    }
}
