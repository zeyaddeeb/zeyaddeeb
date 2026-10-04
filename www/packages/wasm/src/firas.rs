use js_sys::Float32Array;
use wasm_bindgen::prelude::*;

const H: f64 = 6.626_070_15e-34;
const K: f64 = 1.380_649e-23;
const C: f64 = 2.997_924_58e8;
const MAGIC: &[u8; 4] = b"HCSK";
const HEAD: usize = 80;

pub const T_CMB: f64 = 2.72548;
pub const BEAM_DEG: f64 = 4.0;
pub const QUIET_K: f64 = 2.0e-4;
pub const OPD_CM: f64 = 1.2;

pub fn planck(nu_hz: f64, t: f64) -> f64 {
    let x = H * nu_hz / (K * t);

    2.0 * H * nu_hz.powi(3) / (C * C) / x.exp_m1() * 1e20
}

pub fn planck_dt(nu_hz: f64, t: f64) -> f64 {
    let x = H * nu_hz / (K * t);

    planck(nu_hz, t) * x * x.exp() / x.exp_m1() / t
}

#[derive(Clone, Copy)]
struct Pixel {
    v: [f64; 3],
    t: f64,
    dust: f64,
    seen: f64,
}

#[wasm_bindgen]
pub struct Sky {
    pixels: Vec<Pixel>,
    monopole: f64,
    dipole: f64,
    direction: [f64; 3],
    nu: Vec<f64>,
    weight: Vec<f64>,
    slope: Vec<f64>,
    rest: Vec<f64>,
    unit_left: f64,
    norm: f64,
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let end = self.at + n;

        if end > self.bytes.len() {
            return Err("sky data is truncated".into());
        }

        let out = &self.bytes[self.at..end];

        self.at = end;
        Ok(out)
    }

    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }

    fn f64(&mut self) -> Result<f64, String> {
        Ok(f64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }

    fn f32(&mut self) -> Result<f64, String> {
        Ok(f32::from_le_bytes(self.take(4)?.try_into().unwrap()) as f64)
    }
}

impl Sky {
    pub fn parse(bytes: &[u8]) -> Result<Sky, String> {
        if bytes.len() < HEAD || &bytes[..4] != MAGIC {
            return Err("not a sky file".into());
        }

        let mut r = Reader { bytes, at: 4 };
        let _version = r.u32()?;
        let count = r.u32()? as usize;
        let freqs = r.u32()? as usize;
        let monopole = r.f64()?;
        let dipole = r.f64()?;
        let direction = [r.f64()?, r.f64()?, r.f64()?];
        let _scale = r.f64()?;
        let nu0 = r.f64()?;
        let dnu = r.f64()?;
        let template = (0..freqs).map(|_| r.f64()).collect::<Result<Vec<_>, _>>()?;
        let sigma = (0..freqs).map(|_| r.f64()).collect::<Result<Vec<_>, _>>()?;
        let mut v = vec![[0.0; 3]; count];

        for p in v.iter_mut() {
            *p = [r.f32()?, r.f32()?, r.f32()?];
        }

        let temps = (0..count).map(|_| r.f64()).collect::<Result<Vec<_>, _>>()?;
        let dust = (0..count).map(|_| r.f32()).collect::<Result<Vec<_>, _>>()?;
        let seen = (0..count).map(|_| r.f64()).collect::<Result<Vec<_>, _>>()?;
        let pixels = (0..count)
            .filter(|&i| temps[i].is_finite())
            .map(|i| Pixel {
                v: v[i],
                t: temps[i],
                dust: if dust[i].is_finite() { dust[i] } else { 0.0 },
                seen: seen[i],
            })
            .collect();

        let nu: Vec<f64> = (0..freqs).map(|k| (nu0 + dnu * k as f64) * 1e9).collect();
        let slope: Vec<f64> = nu.iter().map(|&n| planck_dt(n, T_CMB)).collect();
        let weight: Vec<f64> = slope.iter().zip(&sigma).map(|(g, s)| g / (s * s)).collect();
        let norm: f64 = weight.iter().zip(&slope).map(|(w, g)| w * g).sum();
        let shift: f64 = weight
            .iter()
            .zip(&template)
            .map(|(w, d)| w * d)
            .sum::<f64>()
            / norm;
        let rest: Vec<f64> = template
            .iter()
            .zip(&slope)
            .map(|(d, g)| d - shift * g)
            .collect();
        let wg2: f64 = weight
            .iter()
            .zip(&slope)
            .map(|(w, g)| (w * g).powi(2))
            .sum();
        let wr2: f64 = weight.iter().zip(&rest).map(|(w, d)| (w * d).powi(2)).sum();

        Ok(Sky {
            pixels,
            monopole,
            dipole,
            direction,
            nu,
            weight,
            slope,
            rest,
            unit_left: (wr2 / wg2).sqrt(),
            norm,
        })
    }

    fn look(&self, x: f64, y: f64, z: f64) -> (f64, f64) {
        let len = (x * x + y * y + z * z).sqrt().max(1e-12);
        let n = [x / len, y / len, z / len];
        let edge = BEAM_DEG.to_radians().cos();
        let (mut sw, mut st, mut sd) = (0.0, 0.0, 0.0);
        let mut best = (f64::NEG_INFINITY, 0usize);

        for (i, p) in self.pixels.iter().enumerate() {
            let c = p.v[0] * n[0] + p.v[1] * n[1] + p.v[2] * n[2];

            if c > best.0 {
                best = (c, i);
            }

            if c > edge {
                let u = (1.0 - c) / (1.0 - edge);
                let w = (1.0 - u) * (1.0 - u);

                sw += w;
                st += w * p.t;
                sd += w * p.dust;
            }
        }

        if sw > 0.0 {
            (st / sw, sd / sw)
        } else {
            let p = self.pixels[best.1];

            (p.t, p.dust)
        }
    }

    fn nearest_seen(&self, x: f64, y: f64, z: f64) -> f64 {
        let mut best = (f64::NEG_INFINITY, f64::NAN);

        for p in &self.pixels {
            if !p.seen.is_finite() {
                continue;
            }

            let c = p.v[0] * x + p.v[1] * y + p.v[2] * z;

            if c > best.0 {
                best = (c, p.seen);
            }
        }

        best.1
    }
}

#[wasm_bindgen]
impl Sky {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<Sky, JsError> {
        Sky::parse(bytes).map_err(|e| JsError::new(&e))
    }

    pub fn temperature(&self, x: f64, y: f64, z: f64) -> f64 {
        self.look(x, y, z).0
    }

    pub fn leftover(&self, x: f64, y: f64, z: f64) -> f64 {
        self.look(x, y, z).1 * self.unit_left
    }

    pub fn dust(&self, x: f64, y: f64, z: f64) -> f64 {
        self.look(x, y, z).1
    }

    pub fn seen(&self, x: f64, y: f64, z: f64) -> f64 {
        self.nearest_seen(x, y, z)
    }

    pub fn lean(&self, x: f64, y: f64, z: f64) -> f64 {
        let len = (x * x + y * y + z * z).sqrt().max(1e-12);
        let d = self.direction;

        (d[0] * x + d[1] * y + d[2] * z) / len
    }

    pub fn monopole(&self) -> f64 {
        self.monopole
    }

    pub fn dipole(&self) -> f64 {
        self.dipole
    }

    pub fn direction(&self) -> Float32Array {
        Float32Array::from(&self.direction.map(|v| v as f32)[..])
    }

    pub fn unit_leftover(&self) -> f64 {
        self.unit_left
    }

    pub fn fringes(&self, sky_t: f64, heater_t: f64, dust: f64, samples: usize) -> Float32Array {
        Float32Array::from(&self.trace(sky_t, heater_t, dust, samples)[..])
    }
}

impl Sky {
    pub fn trace(&self, sky_t: f64, heater_t: f64, dust: f64, samples: usize) -> Vec<f32> {
        let diff: Vec<f64> = self
            .nu
            .iter()
            .zip(&self.rest)
            .map(|(&n, r)| planck(n, sky_t) - planck(n, heater_t) + dust * r)
            .collect();
        let n = samples.max(2);

        (0..n)
            .map(|j| {
                let x = OPD_CM * (2.0 * j as f64 / (n - 1) as f64 - 1.0);
                let taper = 1.0 - (x / OPD_CM).powi(2);
                let sum: f64 = self
                    .nu
                    .iter()
                    .zip(&self.weight)
                    .zip(&diff)
                    .map(|((&nu, w), d)| w * d * (std::f64::consts::TAU * nu / C / 100.0 * x).cos())
                    .sum();

                (taper * sum / self.norm) as f32
            })
            .collect()
    }

    pub fn slope_at(&self, k: usize) -> f64 {
        self.slope[k]
    }
}

#[wasm_bindgen]
pub fn heater_gap(sky_t: f64, heater_t: f64, leftover: f64) -> f64 {
    ((sky_t - heater_t).powi(2) + leftover * leftover).sqrt()
}

#[wasm_bindgen]
pub fn beat_hz(gap: f64) -> f64 {
    if gap <= QUIET_K {
        return 0.0;
    }

    (1.6 * (gap / QUIET_K).log10()).min(8.0)
}

#[wasm_bindgen]
pub fn speed_kms(t_a: f64, lean_a: f64, t_b: f64, lean_b: f64) -> f64 {
    let gap = lean_a - lean_b;

    if gap.abs() < 1e-6 {
        return f64::NAN;
    }

    C / 1e3 * (t_a - t_b) / (0.5 * (t_a + t_b) * gap)
}

#[wasm_bindgen]
pub fn celsius(kelvin: f64) -> f64 {
    kelvin - 273.15
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<u8> {
        let freqs = 43usize;
        let count = 3usize;
        let mut b = Vec::new();

        b.extend_from_slice(MAGIC);
        b.extend_from_slice(&1u32.to_le_bytes());
        b.extend_from_slice(&(count as u32).to_le_bytes());
        b.extend_from_slice(&(freqs as u32).to_le_bytes());

        for v in [T_CMB, 3.3e-3, 0.0, 0.0, 1.0, 1.0, 68.020812, 13.604162] {
            b.extend_from_slice(&f64::to_le_bytes(v));
        }

        for k in 0..freqs {
            b.extend_from_slice(&f64::to_le_bytes((k as f64 / 42.0).powi(2)));
        }

        for k in 0..freqs {
            b.extend_from_slice(&f64::to_le_bytes(0.2 + k as f64 * 0.05));
        }

        for v in [[0.0f32, 0.0, 1.0], [0.0, 0.0, -1.0], [1.0, 0.0, 0.0]] {
            for c in v {
                b.extend_from_slice(&c.to_le_bytes());
            }
        }

        for t in [T_CMB + 3.3e-3, T_CMB - 3.3e-3, T_CMB] {
            b.extend_from_slice(&f64::to_le_bytes(t));
        }

        for d in [0.5f32, 1.0, 40.0] {
            b.extend_from_slice(&d.to_le_bytes());
        }

        for s in [6.3e8f64, f64::NAN, 6.4e8] {
            b.extend_from_slice(&s.to_le_bytes());
        }

        b
    }

    #[test]
    fn planck_peaks_near_160_ghz() {
        let peak = (100..400)
            .map(|g| g as f64 * 1e9)
            .max_by(|a, b| planck(*a, T_CMB).total_cmp(&planck(*b, T_CMB)))
            .unwrap();

        assert!((peak / 1e9 - 160.0).abs() < 2.0);
        assert!((planck(peak, T_CMB) - 384.0).abs() < 2.0);
    }

    #[test]
    fn slope_matches_finite_difference() {
        let nu = 200e9;
        let d = (planck(nu, T_CMB + 1e-6) - planck(nu, T_CMB - 1e-6)) / 2e-6;

        assert!((planck_dt(nu, T_CMB) / d - 1.0).abs() < 1e-6);
    }

    #[test]
    fn parses_and_looks() {
        let sky = Sky::parse(&sample()).unwrap();

        assert!((sky.temperature(0.0, 0.0, 1.0) - (T_CMB + 3.3e-3)).abs() < 1e-9);
        assert!((sky.temperature(0.0, 0.0, -1.0) - (T_CMB - 3.3e-3)).abs() < 1e-9);
        assert!(sky.leftover(1.0, 0.0, 0.0) > sky.leftover(0.0, 0.0, 1.0));
        assert!((sky.lean(0.0, 0.0, 5.0) - 1.0).abs() < 1e-12);
        assert_eq!(sky.seen(0.1, 0.0, -1.0), 6.4e8);
    }

    #[test]
    fn rejects_bad_bytes() {
        assert!(Sky::parse(b"nope").is_err());
        assert!(Sky::parse(&sample()[..200]).is_err());
    }

    #[test]
    fn fringes_vanish_at_the_match() {
        let sky = Sky::parse(&sample()).unwrap();
        let flat = sky.trace(T_CMB, T_CMB, 0.0, 64);
        let off = sky.trace(T_CMB, T_CMB - 1e-3, 0.0, 65);
        let dusty = sky.trace(T_CMB, T_CMB, 40.0, 64);

        assert!(flat.iter().all(|v| v.abs() < 1e-12));
        assert!((off[32] as f64 - 1e-3).abs() < 1e-4);
        assert!(dusty.iter().map(|v| v.abs()).fold(0.0f32, f32::max) > 1e-4);
    }

    #[test]
    fn center_fringe_reads_the_gap_in_kelvin() {
        let sky = Sky::parse(&sample()).unwrap();
        let n = 201;
        let mid = sky.trace(T_CMB + 2e-3, T_CMB, 0.0, n)[n / 2] as f64;

        assert!((mid - 2e-3).abs() < 2e-5);
    }

    #[test]
    fn dust_does_not_move_the_center_fringe() {
        let sky = Sky::parse(&sample()).unwrap();
        let n = 201;
        let mid = sky.trace(T_CMB, T_CMB, 40.0, n)[n / 2] as f64;

        assert!(mid.abs() < 1e-9);
    }

    #[test]
    fn beat_slows_and_stops() {
        assert_eq!(beat_hz(1e-4), 0.0);
        assert!(beat_hz(1e-3) < beat_hz(1e-2));
        assert!(beat_hz(1.0) <= 8.0);
    }

    #[test]
    fn speed_from_opposite_sides() {
        let v = speed_kms(T_CMB + 3.3624e-3, 1.0, T_CMB - 3.3624e-3, -1.0);

        assert!((v - 369.8).abs() < 1.0);
        assert!(speed_kms(T_CMB, 0.3, T_CMB, 0.3).is_nan());
    }
}

#[cfg(test)]
mod real {
    use super::*;

    #[test]
    fn the_shipped_sky_reads_like_firas() {
        let Ok(bytes) = std::fs::read("../../apps/www/public/cobe/sky.bin") else {
            return;
        };
        let sky = Sky::parse(&bytes).unwrap();
        let d = sky.direction;
        let ahead = sky.temperature(d[0], d[1], d[2]);
        let behind = sky.temperature(-d[0], -d[1], -d[2]);
        let v = speed_kms(ahead, 1.0, behind, -1.0);

        assert!((sky.monopole() - T_CMB).abs() < 1e-6);
        assert!((sky.unit_leftover() - 7.764e-5).abs() < 1e-7);
        assert!((ahead - behind - 2.0 * sky.dipole()).abs() < 1.0e-3);
        assert!((330.0..410.0).contains(&v), "{v}");
        assert!(sky.leftover(-0.05, 0.0, 0.0) > 5.0 * sky.leftover(d[0], d[1], d[2]));
    }
}
