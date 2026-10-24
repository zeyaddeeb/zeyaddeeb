use serde_json::Value;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const CUPS: usize = 5;
const EPS: f32 = 1e-6;
const ROPE_BASE: f32 = 10000.0;
const LONGEST: usize = 256;

struct Layer {
    attend: Vec<f32>,
    query: Vec<f32>,
    key: Vec<f32>,
    value: Vec<f32>,
    out: Vec<f32>,
    think: Vec<f32>,
    up: Vec<f32>,
    down: Vec<f32>,
    keys: Vec<f32>,
    values: Vec<f32>,
}

#[wasm_bindgen]
pub struct CupReader {
    width: usize,
    heads: usize,
    vocab: usize,
    embed: Vec<f32>,
    layers: Vec<Layer>,
    norm: Vec<f32>,
    head: Vec<f32>,
    meta: HashMap<String, String>,
    len: usize,
}

fn half_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) as u32) << 31;
    let exponent = ((bits >> 10) & 0x1f) as u32;
    let mantissa = (bits & 0x3ff) as u32;
    let value = match (exponent, mantissa) {
        (0, 0) => sign,
        (0, m) => {
            let shift = m.leading_zeros() - 21;
            sign | ((113 - shift) << 23) | (((m << shift) & 0x3ff) << 13)
        }
        (0x1f, m) => sign | 0x7f80_0000 | (m << 13),
        (e, m) => sign | ((e + 112) << 23) | (m << 13),
    };

    f32::from_bits(value)
}

type Tensors = HashMap<String, Vec<f32>>;
type Meta = HashMap<String, String>;

fn tensors(bytes: &[u8]) -> Result<(Tensors, Meta), String> {
    let size = bytes
        .get(..8)
        .map(|b| u64::from_le_bytes(b.try_into().unwrap()) as usize)
        .ok_or("too short")?;
    let header: Value = serde_json::from_slice(bytes.get(8..8 + size).ok_or("bad header")?)
        .map_err(|e| e.to_string())?;
    let data = &bytes[8 + size..];
    let mut out = HashMap::new();
    let mut meta = HashMap::new();

    for (name, entry) in header.as_object().ok_or("bad header")? {
        if name == "__metadata__" {
            for (k, v) in entry.as_object().into_iter().flatten() {
                meta.insert(k.clone(), v.as_str().unwrap_or_default().to_string());
            }

            continue;
        }

        let start = entry["data_offsets"][0].as_u64().ok_or("bad offsets")? as usize;
        let end = entry["data_offsets"][1].as_u64().ok_or("bad offsets")? as usize;
        let raw = data.get(start..end).ok_or("bad offsets")?;
        let values = match entry["dtype"].as_str() {
            Some("F32") => raw
                .as_chunks::<4>()
                .0
                .iter()
                .map(|c| f32::from_le_bytes(*c))
                .collect(),
            Some("F16") => raw
                .as_chunks::<2>()
                .0
                .iter()
                .map(|c| half_to_f32(u16::from_le_bytes(*c)))
                .collect(),
            other => return Err(format!("{name}: unsupported dtype {other:?}")),
        };

        out.insert(name.clone(), values);
    }

    Ok((out, meta))
}

fn rms(x: &[f32], weight: &[f32]) -> Vec<f32> {
    let mean = x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32;
    let scale = 1.0 / (mean + EPS).sqrt();

    x.iter().zip(weight).map(|(v, w)| v * scale * w).collect()
}

fn matvec(w: &[f32], x: &[f32]) -> Vec<f32> {
    w.chunks_exact(x.len())
        .map(|row| row.iter().zip(x).map(|(a, b)| a * b).sum())
        .collect()
}

fn gelu(v: f32) -> f32 {
    0.5 * v * (1.0 + (0.797_884_6 * v * (1.0 + 0.044715 * v * v)).tanh())
}

fn turn(x: &mut [f32], heads: usize, position: usize) {
    let width = x.len() / heads;
    let half = width / 2;

    for head in x.chunks_exact_mut(width) {
        for i in 0..half {
            let angle = position as f32 / ROPE_BASE.powf(i as f32 / half as f32);
            let (sin, cos) = angle.sin_cos();
            let (a, b) = (head[i], head[half + i]);

            head[i] = a * cos - b * sin;
            head[half + i] = a * sin + b * cos;
        }
    }
}

fn softmax(x: &mut [f32]) {
    let top = x.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let mut total = 0.0;

    for v in x.iter_mut() {
        *v = (*v - top).exp();
        total += *v;
    }

    for v in x.iter_mut() {
        *v /= total;
    }
}

impl CupReader {
    pub fn from_bytes(bytes: &[u8]) -> Result<CupReader, String> {
        let (mut map, meta) = tensors(bytes)?;
        let field = |key: &str| -> Result<usize, String> {
            meta.get(key)
                .and_then(|v| v.parse().ok())
                .ok_or(format!("missing {key}"))
        };
        let width = field("width")?;
        let heads = field("heads")?;
        let depth = field("layers")?;
        let mut take = |name: String, len: usize| -> Result<Vec<f32>, String> {
            let values = map.remove(&name).ok_or(format!("missing {name}"))?;

            if values.len() != len {
                return Err(format!("{name} has {} values", values.len()));
            }

            Ok(values)
        };
        let vocab = meta.get("vocab").and_then(|v| v.parse().ok()).unwrap_or(15);
        let embed = take("embed".into(), vocab * width)?;
        let mut layers = Vec::with_capacity(depth);

        for i in 0..depth {
            let w = width;

            layers.push(Layer {
                attend: take(format!("layers.{i}.attend"), w)?,
                query: take(format!("layers.{i}.query"), w * w)?,
                key: take(format!("layers.{i}.key"), w * w)?,
                value: take(format!("layers.{i}.value"), w * w)?,
                out: take(format!("layers.{i}.out"), w * w)?,
                think: take(format!("layers.{i}.think"), w)?,
                up: take(format!("layers.{i}.up"), 4 * w * w)?,
                down: take(format!("layers.{i}.down"), 4 * w * w)?,
                keys: Vec::new(),
                values: Vec::new(),
            });
        }

        let norm = take("norm".into(), width)?;
        let head = take("head".into(), CUPS * width)?;

        Ok(CupReader {
            width,
            heads,
            vocab,
            embed,
            layers,
            norm,
            head,
            meta,
            len: 0,
        })
    }

    pub fn step(&mut self, token: u32) -> Vec<f32> {
        let w = self.width;
        let hw = w / self.heads;
        let scale = 1.0 / (hw as f32).sqrt();
        let position = self.len;
        let token = (token as usize).min(self.vocab - 1);
        let mut x = self.embed[token * w..(token + 1) * w].to_vec();

        for layer in &mut self.layers {
            let h = rms(&x, &layer.attend);
            let mut q = matvec(&layer.query, &h);
            let mut k = matvec(&layer.key, &h);
            let v = matvec(&layer.value, &h);

            turn(&mut q, self.heads, position);
            turn(&mut k, self.heads, position);
            layer.keys.extend_from_slice(&k);
            layer.values.extend_from_slice(&v);

            let mut mixed = vec![0.0; w];
            let mut scores = vec![0.0; position + 1];

            for head in 0..self.heads {
                let span = head * hw..(head + 1) * hw;

                for (t, score) in scores.iter_mut().enumerate() {
                    let key = &layer.keys[t * w..][span.clone()];

                    *score = q[span.clone()]
                        .iter()
                        .zip(key)
                        .map(|(a, b)| a * b)
                        .sum::<f32>()
                        * scale;
                }

                softmax(&mut scores);

                for (t, p) in scores.iter().enumerate() {
                    let value = &layer.values[t * w..][span.clone()];

                    for (m, v) in mixed[span.clone()].iter_mut().zip(value) {
                        *m += p * v;
                    }
                }
            }

            for (a, b) in x.iter_mut().zip(matvec(&layer.out, &mixed)) {
                *a += b;
            }

            let h = rms(&x, &layer.think);
            let up: Vec<f32> = matvec(&layer.up, &h).into_iter().map(gelu).collect();

            for (a, b) in x.iter_mut().zip(matvec(&layer.down, &up)) {
                *a += b;
            }
        }

        let mut out = matvec(&self.head, &rms(&x, &self.norm));

        softmax(&mut out);
        self.len += 1;

        out
    }
}

#[wasm_bindgen]
impl CupReader {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<CupReader, JsValue> {
        Self::from_bytes(bytes).map_err(|e| JsValue::from_str(&e))
    }

    pub fn depth(&self) -> usize {
        self.layers.len()
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn capacity(&self) -> usize {
        LONGEST
    }

    pub fn meta(&self, key: &str) -> Option<String> {
        self.meta.get(key).cloned()
    }

    pub fn truncate(&mut self, len: usize) {
        let len = len.min(self.len);

        for layer in &mut self.layers {
            layer.keys.truncate(len * self.width);
            layer.values.truncate(len * self.width);
        }

        self.len = len;
    }

    pub fn push(&mut self, token: u32) -> Vec<f32> {
        if self.len >= LONGEST {
            return vec![0.0; CUPS];
        }

        self.step(token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_floats_decode() {
        assert_eq!(half_to_f32(0x3c00), 1.0);
        assert_eq!(half_to_f32(0xc000), -2.0);
        assert_eq!(half_to_f32(0x3555), 0.333_251_95);
        assert_eq!(half_to_f32(0x0001), 5.960_464_5e-8);
    }

    #[test]
    fn shipped_readers_match_the_trainer() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../apps/www/public/show-your-work");
        let Ok(entries) = std::fs::read_dir(&dir) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();

            if path.extension().and_then(|e| e.to_str()) != Some("safetensors") {
                continue;
            }

            let bytes = std::fs::read(&path).unwrap();
            let mut reader = CupReader::from_bytes(&bytes).unwrap();
            let tokens: Vec<u32> = serde_json::from_str(&reader.meta["probe_tokens"]).unwrap();
            let expected: Vec<Vec<f32>> = serde_json::from_str(&reader.meta["probe"]).unwrap();
            let got: Vec<Vec<f32>> = tokens.iter().map(|&t| reader.push(t)).collect();

            for (g, e) in got.iter().zip(&expected) {
                for (a, b) in g.iter().zip(e) {
                    assert!((a - b).abs() < 1e-4, "{}: {g:?} vs {e:?}", path.display());
                }
            }

            reader.truncate(3);

            let again = reader.push(tokens[3]);

            for (a, b) in again.iter().zip(&expected[3]) {
                assert!((a - b).abs() < 1e-4);
            }
        }
    }
}
