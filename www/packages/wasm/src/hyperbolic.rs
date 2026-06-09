use std::collections::{HashMap, VecDeque};
use wasm_bindgen::prelude::*;

const SAMPLES_PER_EDGE: usize = 5;
const BLADE_SAMPLES: usize = 9;
const DEDUP_TOLERANCE: f64 = 1e-6;

#[derive(Clone, Copy, Debug, Default)]
struct Cx {
    re: f64,
    im: f64,
}

impl Cx {
    fn new(re: f64, im: f64) -> Cx {
        Cx { re, im }
    }

    fn from_polar(r: f64, theta: f64) -> Cx {
        Cx::new(r * theta.cos(), r * theta.sin())
    }

    fn add(self, other: Cx) -> Cx {
        Cx::new(self.re + other.re, self.im + other.im)
    }

    fn sub(self, other: Cx) -> Cx {
        Cx::new(self.re - other.re, self.im - other.im)
    }

    fn mul(self, other: Cx) -> Cx {
        Cx::new(
            self.re * other.re - self.im * other.im,
            self.re * other.im + self.im * other.re,
        )
    }

    fn scale(self, s: f64) -> Cx {
        Cx::new(self.re * s, self.im * s)
    }

    fn conj(self) -> Cx {
        Cx::new(self.re, -self.im)
    }

    fn abs2(self) -> f64 {
        self.re * self.re + self.im * self.im
    }

    fn abs(self) -> f64 {
        self.abs2().sqrt()
    }

    fn div(self, other: Cx) -> Cx {
        let d = other.abs2();
        self.mul(other.conj()).scale(1.0 / d)
    }
}

fn reflect(z: Cx, a: Cx, b: Cx) -> Cx {
    let det = 4.0 * (a.re * b.im - a.im * b.re);
    if det.abs() < 1e-12 {
        let dir = b.sub(a);
        let theta = dir.im.atan2(dir.re);
        let rot = Cx::from_polar(1.0, 2.0 * theta);
        return rot.mul(z.conj());
    }

    let rhs_a = a.abs2() + 1.0;
    let rhs_b = b.abs2() + 1.0;
    let cx = (rhs_a * 2.0 * b.im - rhs_b * 2.0 * a.im) / det;
    let cy = (rhs_b * 2.0 * a.re - rhs_a * 2.0 * b.re) / det;
    let c = Cx::new(cx, cy);
    let r2 = c.abs2() - 1.0;

    let w = z.sub(c);
    c.add(w.scale(r2 / w.abs2()))
}

#[derive(Clone)]
struct Tile {
    points: Vec<Cx>,
    center: Cx,
    layer: u32,
    parity: u32,
}

#[wasm_bindgen]
pub struct HyperbolicTiling {
    p: u32,
    base_vertices: Vec<f64>,
    meta: Vec<u32>,
    tile_count: u32,
}

#[wasm_bindgen]
impl HyperbolicTiling {
    pub fn new(p: u32, q: u32, max_tiles: u32, min_size: f64) -> Result<HyperbolicTiling, JsError> {
        if !is_hyperbolic(p, q) {
            return Err(JsError::new(
                "Invalid Schläfli symbol: requires (p-2)(q-2) > 4 for a hyperbolic tiling",
            ));
        }

        let central = central_tile(p, q);
        let tiles = generate(central, p as usize, max_tiles as usize, min_size);

        let stride = p as usize * (SAMPLES_PER_EDGE + 2 * BLADE_SAMPLES) + 1;
        let mut base_vertices = Vec::with_capacity(tiles.len() * stride * 2);
        let mut meta = Vec::with_capacity(tiles.len() * 2);

        for tile in &tiles {
            for pt in &tile.points {
                base_vertices.push(pt.re);
                base_vertices.push(pt.im);
            }
            meta.push(tile.layer);
            meta.push(tile.parity);
        }

        Ok(HyperbolicTiling {
            p,
            base_vertices,
            meta,
            tile_count: tiles.len() as u32,
        })
    }

    pub fn tile_count(&self) -> u32 {
        self.tile_count
    }

    pub fn polygon_sides(&self) -> u32 {
        self.p
    }

    pub fn points_per_tile(&self) -> u32 {
        self.p * (SAMPLES_PER_EDGE + 2 * BLADE_SAMPLES) as u32 + 1
    }

    pub fn boundary_points_per_tile(&self) -> u32 {
        self.p * SAMPLES_PER_EDGE as u32
    }

    pub fn points_per_blade(&self) -> u32 {
        2 * BLADE_SAMPLES as u32
    }

    pub fn get_meta(&self) -> Vec<u32> {
        self.meta.clone()
    }

    pub fn get_base_vertices(&self) -> Vec<f64> {
        self.base_vertices.clone()
    }

    pub fn transform_vertices(&self, a_re: f64, a_im: f64, b_re: f64, b_im: f64) -> Vec<f64> {
        let a = Cx::new(a_re, a_im);
        let b = Cx::new(b_re, b_im);
        let ac = a.conj();
        let bc = b.conj();

        let mut out = Vec::with_capacity(self.base_vertices.len());
        for chunk in self.base_vertices.chunks_exact(2) {
            let z = Cx::new(chunk[0], chunk[1]);
            let w = a.mul(z).add(b).div(bc.mul(z).add(ac));
            out.push(w.re);
            out.push(w.im);
        }
        out
    }
}

fn is_hyperbolic(p: u32, q: u32) -> bool {
    p >= 3 && q >= 3 && (p - 2) * (q - 2) > 4
}

fn central_tile(p: u32, q: u32) -> Tile {
    let p = p as usize;
    let pi = std::f64::consts::PI;
    let u = (pi / p as f64).sin() / (pi / q as f64).cos();

    let d = 1.0 / (1.0 - u * u).sqrt();
    let r = u * d;
    let dc = d * (pi / p as f64).cos();
    let rv = dc - (dc * dc - 1.0).sqrt();

    let vertex = |k: i64| -> Cx {
        let angle = (2.0 * k as f64 + 1.0) * pi / p as f64;
        Cx::from_polar(rv, angle)
    };

    let mut points = Vec::with_capacity(p * SAMPLES_PER_EDGE);
    for k in 0..p {
        let center = Cx::from_polar(d, 2.0 * pi * k as f64 / p as f64);
        let start = vertex(k as i64 - 1);
        let end = vertex(k as i64);

        let phi0 = (start.im - center.im).atan2(start.re - center.re);
        let phi1 = (end.im - center.im).atan2(end.re - center.re);
        let mut dphi = phi1 - phi0;
        while dphi > pi {
            dphi -= 2.0 * pi;
        }
        while dphi < -pi {
            dphi += 2.0 * pi;
        }

        for j in 0..SAMPLES_PER_EDGE {
            let phi = phi0 + dphi * j as f64 / SAMPLES_PER_EDGE as f64;
            points.push(center.add(Cx::from_polar(r, phi)));
        }
    }

    let rin = d - r;
    let arm = 2.0 * pi / p as f64;
    let swirl = 1.9 * arm;
    for k in 0..p {
        let theta = arm * k as f64;
        let mut upper = Vec::with_capacity(BLADE_SAMPLES);
        let mut lower = Vec::with_capacity(BLADE_SAMPLES);
        for j in 0..BLADE_SAMPLES {
            let t = 0.12 + 0.87 * j as f64 / (BLADE_SAMPLES - 1) as f64;
            let spine = theta + swirl * (1.0 - t).powf(1.35);
            let width = 0.26 * arm * (pi * t.powf(0.7)).sin().max(0.03);
            let rad = rin * t * 0.99;
            upper.push(Cx::from_polar(rad, spine + width));
            lower.push(Cx::from_polar(rad, spine - width));
        }
        points.extend(upper);
        points.extend(lower.into_iter().rev());
    }

    points.push(Cx::new(0.0, 0.0));

    Tile {
        points,
        center: Cx::new(0.0, 0.0),
        layer: 0,
        parity: 0,
    }
}

fn dedup_key(c: Cx) -> (i64, i64) {
    (
        (c.re / DEDUP_TOLERANCE).round() as i64,
        (c.im / DEDUP_TOLERANCE).round() as i64,
    )
}

fn is_seen(seen: &HashMap<(i64, i64), ()>, c: Cx) -> bool {
    let (kx, ky) = dedup_key(c);
    for dx in -1..=1 {
        for dy in -1..=1 {
            if seen.contains_key(&(kx + dx, ky + dy)) {
                return true;
            }
        }
    }
    false
}

fn generate(central: Tile, p: usize, max_tiles: usize, min_size: f64) -> Vec<Tile> {
    let mut seen: HashMap<(i64, i64), ()> = HashMap::new();
    seen.insert(dedup_key(central.center), ());

    let mut queue: VecDeque<Tile> = VecDeque::new();
    queue.push_back(central);

    let mut tiles: Vec<Tile> = Vec::new();

    while let Some(tile) = queue.pop_front() {
        if tiles.len() >= max_tiles {
            break;
        }

        for edge in 0..p {
            let a = tile.points[edge * SAMPLES_PER_EDGE];
            let b = tile.points[((edge + 1) % p) * SAMPLES_PER_EDGE];

            let center = reflect(tile.center, a, b);
            if center.abs() > 0.9999 || is_seen(&seen, center) {
                continue;
            }

            let points: Vec<Cx> = tile.points.iter().map(|&z| reflect(z, a, b)).collect();
            let size = points
                .iter()
                .map(|pt| pt.sub(center).abs())
                .fold(0.0, f64::max);
            if size < min_size {
                continue;
            }

            seen.insert(dedup_key(center), ());
            queue.push_back(Tile {
                points,
                center,
                layer: tile.layer + 1,
                parity: 1 - tile.parity,
            });
        }

        tiles.push(tile);
    }

    tiles
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rejects_euclidean_tilings() {
        assert!(!is_hyperbolic(4, 4));
        assert!(!is_hyperbolic(6, 3));
        assert!(!is_hyperbolic(3, 3));
        assert!(is_hyperbolic(7, 3));
        assert!(is_hyperbolic(5, 4));
        assert!(is_hyperbolic(3, 7));
    }

    #[test]
    fn test_builds_heptagonal_tiling() {
        let tiling = HyperbolicTiling::new(7, 3, 500, 0.002).unwrap();
        assert!(tiling.tile_count() > 100);
        assert_eq!(
            tiling.points_per_tile(),
            7 * (SAMPLES_PER_EDGE + 2 * BLADE_SAMPLES) as u32 + 1
        );
        assert_eq!(
            tiling.boundary_points_per_tile(),
            7 * SAMPLES_PER_EDGE as u32
        );
        assert_eq!(tiling.polygon_sides(), 7);
        assert_eq!(
            tiling.get_base_vertices().len(),
            tiling.tile_count() as usize * tiling.points_per_tile() as usize * 2
        );
        assert_eq!(tiling.get_meta().len(), tiling.tile_count() as usize * 2);
    }

    #[test]
    fn test_all_points_inside_unit_disk() {
        let tiling = HyperbolicTiling::new(5, 4, 800, 0.002).unwrap();
        for chunk in tiling.get_base_vertices().chunks_exact(2) {
            let r2 = chunk[0] * chunk[0] + chunk[1] * chunk[1];
            assert!(r2 < 1.0, "point escaped the disk: r^2 = {r2}");
        }
    }

    #[test]
    fn test_transform_preserves_disk() {
        let tiling = HyperbolicTiling::new(7, 3, 300, 0.002).unwrap();
        let t = Cx::new(0.4, 0.2);
        let n = 1.0 / (1.0 - t.abs2()).sqrt();
        let out = tiling.transform_vertices(n, 0.0, t.re * n, t.im * n);
        assert_eq!(out.len(), tiling.get_base_vertices().len());
        for chunk in out.chunks_exact(2) {
            let r2 = chunk[0] * chunk[0] + chunk[1] * chunk[1];
            assert!(r2 < 1.0 + 1e-9, "transform escaped the disk: r^2 = {r2}");
        }
    }

    #[test]
    fn test_reflection_is_involution() {
        let a = Cx::new(0.3, 0.1);
        let b = Cx::new(0.1, 0.35);
        let z = Cx::new(-0.2, 0.4);
        let once = reflect(z, a, b);
        let twice = reflect(once, a, b);
        assert!((twice.re - z.re).abs() < 1e-12);
        assert!((twice.im - z.im).abs() < 1e-12);
    }
}
