use js_sys::Float32Array;
use wasm_bindgen::prelude::*;

pub const BETA: f64 = 1.0;
const H: f64 = 0.005;

type State = [f64; 4];

fn field(s: &State, sigma: f64, rho: f64) -> State {
    let [x, y, z, _] = *s;
    [sigma * (y - x), rho * x - y - x * z, x * y - BETA * z, x]
}

fn rk4(s: &State, sigma: f64, rho: f64, h: f64) -> State {
    let add = |a: &State, b: &State, k: f64| -> State {
        [
            a[0] + b[0] * k,
            a[1] + b[1] * k,
            a[2] + b[2] * k,
            a[3] + b[3] * k,
        ]
    };
    let k1 = field(s, sigma, rho);
    let k2 = field(&add(s, &k1, h / 2.0), sigma, rho);
    let k3 = field(&add(s, &k2, h / 2.0), sigma, rho);
    let k4 = field(&add(s, &k3, h), sigma, rho);
    let mut out = *s;
    for i in 0..4 {
        out[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    }
    out
}

fn run(s: &mut State, sigma: f64, rho: f64, tau: f64) {
    let steps = (tau / H).round().max(1.0) as usize;
    let h = tau / steps as f64;
    for _ in 0..steps {
        *s = rk4(s, sigma, rho, h);
    }
}

#[wasm_bindgen]
pub fn hopf(sigma: f64) -> f64 {
    if sigma <= BETA + 1.0 {
        return f64::INFINITY;
    }
    sigma * (sigma + BETA + 3.0) / (sigma - BETA - 1.0)
}

#[wasm_bindgen]
pub struct Wheel {
    s: State,
    sigma: f64,
    rho: f64,
}

#[wasm_bindgen]
impl Wheel {
    #[wasm_bindgen(constructor)]
    pub fn new(sigma: f64, rho: f64) -> Wheel {
        Wheel {
            s: [0.0; 4],
            sigma,
            rho,
        }
    }

    pub fn place(&mut self, x: f64, y: f64, z: f64) {
        self.s = [x, y, z, self.s[3]];
    }

    pub fn shove(&mut self, dx: f64) {
        self.s[0] += dx;
    }

    pub fn set_rho(&mut self, rho: f64) {
        self.rho = rho;
    }

    pub fn rounded(&self, places: i32) -> Wheel {
        let k = 10f64.powi(places);
        let r = |v: f64| (v * k).round() / k;
        Wheel {
            s: [r(self.s[0]), r(self.s[1]), r(self.s[2]), self.s[3]],
            sigma: self.sigma,
            rho: self.rho,
        }
    }

    pub fn advance(&mut self, tau: f64, samples: usize) -> Float32Array {
        let samples = samples.max(1);
        let mut out = Vec::with_capacity(samples * 3);
        for _ in 0..samples {
            run(&mut self.s, self.sigma, self.rho, tau / samples as f64);
            out.extend_from_slice(&[self.s[0] as f32, self.s[1] as f32, self.s[2] as f32]);
        }
        Float32Array::from(out.as_slice())
    }

    pub fn x(&self) -> f64 {
        self.s[0]
    }

    pub fn y(&self) -> f64 {
        self.s[1]
    }

    pub fn z(&self) -> f64 {
        self.s[2]
    }

    pub fn angle(&self) -> f64 {
        self.s[3]
    }
}

#[wasm_bindgen]
pub struct Swarm {
    states: Vec<State>,
    sigma: f64,
    rho: f64,
    seed: u32,
}

#[wasm_bindgen]
impl Swarm {
    #[wasm_bindgen(constructor)]
    pub fn new(sigma: f64, rho: f64) -> Swarm {
        Swarm {
            states: Vec::new(),
            sigma,
            rho,
            seed: 0x9e37_79b9,
        }
    }

    fn noise(&mut self) -> f64 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        self.seed as f64 / u32::MAX as f64 * 2.0 - 1.0
    }

    pub fn scatter(&mut self, x: f64, y: f64, z: f64, spread: f64, n: usize) {
        self.states.clear();
        for _ in 0..n {
            let s = [
                x + spread * self.noise(),
                y + spread * self.noise(),
                z + spread * self.noise(),
                0.0,
            ];
            self.states.push(s);
        }
    }

    pub fn clear(&mut self) {
        self.states.clear();
    }

    pub fn len(&self) -> usize {
        self.states.len()
    }

    pub fn is_empty(&self) -> bool {
        self.states.is_empty()
    }

    pub fn set_rho(&mut self, rho: f64) {
        self.rho = rho;
    }

    pub fn advance(&mut self, tau: f64) -> Float32Array {
        let mut out = Vec::with_capacity(self.states.len() * 3);
        for s in self.states.iter_mut() {
            run(s, self.sigma, self.rho, tau);
            out.extend_from_slice(&[s[0] as f32, s[1] as f32, s[2] as f32]);
        }
        Float32Array::from(out.as_slice())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixed(rho: f64) -> f64 {
        (BETA * (rho - 1.0)).max(0.0).sqrt()
    }

    const CLOCKWISE: u8 = 1;
    const COUNTER: u8 = 2;
    const REST: u8 = 3;
    const TUMBLING_CLOCKWISE: u8 = 4;
    const TUMBLING_COUNTER: u8 = 5;

    fn settle_radius(sigma: f64, rho: f64) -> f64 {
        let margin = (1.0 - rho / hopf(sigma)).max(0.0).sqrt();
        (0.5 * margin).max(0.02) * fixed(rho)
    }

    fn fate(sigma: f64, rho: f64, start: State, cap: f64) -> u8 {
        if rho <= 1.0 {
            return REST;
        }
        let c = fixed(rho);
        let settles = rho < hopf(sigma);
        let near = settle_radius(sigma, rho).powi(2);
        let mut s = start;
        for _ in 0..(cap / H) as usize {
            if settles {
                let dz = (s[2] - (rho - 1.0)).powi(2);
                if (s[0] - c).powi(2) + (s[1] - c).powi(2) + dz < near {
                    return CLOCKWISE;
                }
                if (s[0] + c).powi(2) + (s[1] + c).powi(2) + dz < near {
                    return COUNTER;
                }
            }
            s = rk4(&s, sigma, rho, H);
        }
        if s[0] >= 0.0 {
            TUMBLING_CLOCKWISE
        } else {
            TUMBLING_COUNTER
        }
    }

    fn lyapunov(sigma: f64, rho: f64, tau: f64) -> f64 {
        let mut a: State = [1.0, 1.0, 1.0, 0.0];
        run(&mut a, sigma, rho, 50.0);
        let d0 = 1e-8;
        let mut b = [a[0] + d0, a[1], a[2], 0.0];
        let mut sum = 0.0;
        for _ in 0..tau as usize {
            run(&mut a, sigma, rho, 1.0);
            run(&mut b, sigma, rho, 1.0);
            let d = ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt();
            sum += (d / d0).ln();
            for i in 0..3 {
                b[i] = a[i] + (b[i] - a[i]) * d0 / d;
            }
        }
        sum / tau.floor()
    }

    fn from_rest(rho: f64) -> u8 {
        fate(10.0, rho, [1e-6, 0.0, 0.0, 0.0], 400.0)
    }

    #[test]
    fn fixed_points_hold_still() {
        let (sigma, rho) = (10.0, 12.0);
        let c = fixed(rho);
        let mut s = [c, c, rho - 1.0, 0.0];
        run(&mut s, sigma, rho, 20.0);
        assert!((s[0] - c).abs() < 1e-9);
        assert!((s[2] - (rho - 1.0)).abs() < 1e-9);
    }

    #[test]
    fn below_one_the_wheel_stops() {
        let mut s = [3.0, -2.0, 1.0, 0.0];
        run(&mut s, 10.0, 0.6, 60.0);
        assert!(s[0].abs() < 1e-6 && s[1].abs() < 1e-6 && s[2].abs() < 1e-6);
    }

    #[test]
    fn step_size_converges() {
        let mut coarse = [1.0, 1.0, 1.0, 0.0];
        let mut fine = coarse;
        for _ in 0..200 {
            coarse = rk4(&coarse, 10.0, 28.0, 0.005);
        }
        for _ in 0..400 {
            fine = rk4(&fine, 10.0, 28.0, 0.0025);
        }
        assert!((coarse[0] - fine[0]).abs() < 1e-7);
    }

    #[test]
    fn mirror_symmetry() {
        let mut a = [1.3, -0.4, 5.0, 0.0];
        let mut b = [-1.3, 0.4, 5.0, 0.0];
        run(&mut a, 10.0, 28.0, 3.0);
        run(&mut b, 10.0, 28.0, 3.0);
        assert!((a[0] + b[0]).abs() < 1e-9 && (a[2] - b[2]).abs() < 1e-9);
    }

    #[test]
    fn a_swarm_starts_close_and_spreads_in_chaos() {
        let mut swarm = Swarm::new(10.0, 28.0);
        swarm.scatter(5.0, 5.0, 20.0, 1e-3, 50);
        assert_eq!(swarm.len(), 50);
        let first = swarm.states[0];
        assert!(swarm.states.iter().all(|s| (s[0] - first[0]).abs() <= 2e-3));
        for _ in 0..40 {
            run_all(&mut swarm, 1.0);
        }
        let right = swarm.states.iter().filter(|s| s[0] > 0.0).count();
        assert!(right > 5 && right < 45, "right {right}");
    }

    fn run_all(swarm: &mut Swarm, tau: f64) {
        for s in swarm.states.iter_mut() {
            run(s, swarm.sigma, swarm.rho, tau);
        }
    }

    #[test]
    fn a_rounded_copy_keeps_three_places() {
        let mut w = Wheel::new(10.0, 28.0);
        w.s = [5.123456, -0.506127, 20.0004999, 1.25];
        let c = w.rounded(3);
        assert_eq!(c.s, [5.123, -0.506, 20.0, 1.25]);
    }

    #[test]
    fn hopf_point_for_the_wheel() {
        assert!((hopf(10.0) - 17.5).abs() < 1e-12);
    }

    #[test]
    fn a_nudge_decides_the_direction_until_the_homoclinic_point() {
        assert_eq!(from_rest(0.5), REST);
        assert_eq!(from_rest(5.0), CLOCKWISE);
        assert_eq!(from_rest(8.1), CLOCKWISE);
        assert_eq!(from_rest(8.3), COUNTER);
        assert_eq!(from_rest(12.0), COUNTER);
    }

    #[test]
    fn settled_starts_stay_settled() {
        for rho in [5.0, 13.0, 16.0, 17.0] {
            let c = fixed(rho);
            let span = 4.0 + 2.5 * c;
            for i in 0..10 {
                for j in 0..8 {
                    let x = span * (2.0 * (i as f64 + 0.5) / 10.0 - 1.0);
                    let y = span * (2.0 * (j as f64 + 0.5) / 8.0 - 1.0);
                    let start = [x, y, rho - 1.0, 0.0];
                    let side = match fate(10.0, rho, start, 60.0) {
                        CLOCKWISE => 1.0,
                        COUNTER => -1.0,
                        _ => continue,
                    };
                    let mut s = start;
                    run(&mut s, 10.0, rho, 600.0);
                    assert!(
                        (s[0] - side * c).abs() < 0.05 * c,
                        "rho {rho} start {x},{y}"
                    );
                }
            }
        }
    }

    fn beat(rho: f64) -> f64 {
        let mut s = [0.01, 0.0, 0.0, 0.0];
        run(&mut s, 10.0, rho, 300.0);
        let mut flips = Vec::new();
        for i in 0..(60.0 / H) as usize {
            let next = rk4(&s, 10.0, rho, H);
            if next[0].signum() != s[0].signum() {
                flips.push(i as f64 * H);
            }
            s = next;
        }
        let gaps: Vec<f64> = flips.windows(2).map(|w| w[1] - w[0]).collect();
        let mean = gaps.iter().sum::<f64>() / gaps.len() as f64;
        let var = gaps.iter().map(|g| (g - mean).powi(2)).sum::<f64>() / gaps.len() as f64;
        var.sqrt() / mean
    }

    fn disagreement(rho: f64) -> f64 {
        let (w, h) = (40, 30);
        let span = 4.0 + 2.5 * fixed(rho);
        let codes: Vec<u8> = (0..h)
            .flat_map(|r| {
                (0..w).map(move |c| {
                    let x = span * (2.0 * (c as f64 + 0.5) / w as f64 - 1.0);
                    let y = span * 0.75 * (1.0 - 2.0 * (r as f64 + 0.5) / h as f64);
                    fate(10.0, rho, [x, y, rho - 1.0, 0.0], 60.0)
                })
            })
            .collect();
        let side = |code: u8| code == CLOCKWISE || code == TUMBLING_CLOCKWISE;
        let mut differ = 0;
        for r in 0..h {
            for c in 1..w {
                if side(codes[r * w + c]) != side(codes[r * w + c - 1]) {
                    differ += 1;
                }
            }
        }
        differ as f64 / (h * (w - 1)) as f64
    }

    #[test]
    fn neighbors_disagree_only_in_chaos() {
        assert!(disagreement(5.0) < 0.1);
        assert!(disagreement(28.0) > 0.3);
    }

    #[test]
    fn chaos_and_clocks_where_the_tap_says() {
        assert!(lyapunov(10.0, 12.0, 200.0) < -0.05);
        assert!(lyapunov(10.0, 16.0, 300.0) > 0.25);
        assert!(lyapunov(10.0, 28.5, 300.0) > 0.3);
        assert!(beat(28.5) > 0.2);
        assert!(beat(100.0) > 0.2);
        for rho in [27.0, 40.75, 336.0, 345.0] {
            assert!(lyapunov(10.0, rho, 300.0).abs() < 0.03, "rho {rho}");
            assert!(beat(rho) < 0.02, "rho {rho} beat {}", beat(rho));
        }
    }
}
