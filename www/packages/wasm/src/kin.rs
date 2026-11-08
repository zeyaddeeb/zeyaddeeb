use crate::cups::tensors;
use wasm_bindgen::prelude::*;

const CLASSES: usize = 10;
const BETA1: f32 = 0.9;
const BETA2: f32 = 0.999;
const EPS: f32 = 1e-8;

#[derive(Clone)]
pub struct Net {
    sizes: Vec<usize>,
    weights: Vec<Vec<f32>>,
    biases: Vec<Vec<f32>>,
}

impl Net {
    pub fn from_bytes(bytes: &[u8]) -> Result<Net, String> {
        let (mut map, _) = tensors(bytes)?;
        let mut weights = Vec::new();
        let mut biases = Vec::new();
        let mut sizes = Vec::new();

        while let Some(mut w) = map.remove(&format!("layers.{}.weight", weights.len())) {
            let b = map
                .remove(&format!("layers.{}.bias", weights.len()))
                .ok_or("missing bias")?;

            if let Some(scale) = map.remove(&format!("layers.{}.weight.scale", weights.len())) {
                let width = w.len() / scale.len();

                for (row, s) in w.chunks_exact_mut(width).zip(&scale) {
                    row.iter_mut().for_each(|v| *v *= s);
                }
            }

            if sizes.is_empty() {
                sizes.push(w.len() / b.len());
            }

            sizes.push(b.len());
            weights.push(w);
            biases.push(b);
        }

        if weights.is_empty() {
            return Err("no layers".into());
        }

        Ok(Net {
            sizes,
            weights,
            biases,
        })
    }

    pub fn new(sizes: Vec<usize>, weights: Vec<Vec<f32>>, biases: Vec<Vec<f32>>) -> Net {
        Net {
            sizes,
            weights,
            biases,
        }
    }

    pub fn inputs(&self) -> usize {
        self.sizes[0]
    }

    pub fn outputs(&self) -> usize {
        *self.sizes.last().unwrap()
    }

    pub fn weights(&self) -> &[Vec<f32>] {
        &self.weights
    }

    pub fn biases(&self) -> &[Vec<f32>] {
        &self.biases
    }

    fn trace(&self, x: &[f32], rows: usize) -> Vec<Vec<f32>> {
        let mut acts = vec![x.to_vec()];
        let last = self.weights.len() - 1;

        for (l, (w, b)) in self.weights.iter().zip(&self.biases).enumerate() {
            let mut y = affine(acts.last().unwrap(), rows, w, b, self.sizes[l]);

            if l < last {
                y.iter_mut().for_each(|v| *v = v.max(0.0));
            }

            acts.push(y);
        }

        acts
    }

    pub fn forward(&self, x: &[f32], rows: usize) -> Vec<f32> {
        self.trace(x, rows).pop().unwrap()
    }
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    let mut acc = [0.0f32; 8];
    let (ca, ra) = a.as_chunks::<8>();
    let (cb, rb) = b.as_chunks::<8>();

    for (x, y) in ca.iter().zip(cb) {
        for k in 0..8 {
            acc[k] += x[k] * y[k];
        }
    }

    let mut total =
        ((acc[0] + acc[4]) + (acc[1] + acc[5])) + ((acc[2] + acc[6]) + (acc[3] + acc[7]));

    for (x, y) in ra.iter().zip(rb) {
        total += x * y;
    }

    total
}

fn axpy(y: &mut [f32], a: f32, x: &[f32]) {
    for (t, s) in y.iter_mut().zip(x) {
        *t += a * s;
    }
}

fn affine(x: &[f32], rows: usize, w: &[f32], b: &[f32], width: usize) -> Vec<f32> {
    let outs = b.len();
    let mut y = vec![0.0; rows * outs];

    for (r, out) in y.chunks_exact_mut(outs).enumerate() {
        let xr = &x[r * width..(r + 1) * width];

        for (o, v) in out.iter_mut().enumerate() {
            *v = b[o] + dot(xr, &w[o * width..(o + 1) * width]);
        }
    }

    y
}

fn log_softmax(z: &[f32]) -> Vec<f32> {
    let top = z.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let total: f32 = z.iter().map(|v| (v - top).exp()).sum();
    let log = top + total.ln();

    z.iter().map(|v| v - log).collect()
}

pub struct Adam {
    m: Vec<Vec<f32>>,
    v: Vec<Vec<f32>>,
    t: i32,
    lr: f32,
}

impl Adam {
    fn new(net: &Net, lr: f32) -> Adam {
        let zeros = |vs: &[Vec<f32>]| vs.iter().map(|v| vec![0.0; v.len()]).collect::<Vec<_>>();
        let mut m = zeros(&net.weights);
        m.extend(zeros(&net.biases));
        let v = m.clone();

        Adam { m, v, t: 0, lr }
    }

    fn step(&mut self, params: Vec<&mut Vec<f32>>, grads: &[Vec<f32>]) {
        self.t += 1;
        let c1 = 1.0 - BETA1.powi(self.t);
        let c2 = (1.0 - BETA2.powi(self.t)).sqrt();
        let size = self.lr / c1;

        for (i, p) in params.into_iter().enumerate() {
            let (m, v, g) = (&mut self.m[i], &mut self.v[i], &grads[i]);

            for j in 0..p.len() {
                m[j] = BETA1 * m[j] + (1.0 - BETA1) * g[j];
                v[j] = BETA2 * v[j] + (1.0 - BETA2) * g[j] * g[j];
                p[j] -= size * m[j] / (v[j].sqrt() / c2 + EPS);
            }
        }
    }
}

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let mut r = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
        r.next();
        r
    }

    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    pub fn static_pixel(&mut self) -> f32 {
        ((self.next() >> 40) as f32 / (1u64 << 24) as f32) * 2.0 - 1.0
    }

    pub fn fill(&mut self, out: &mut [f32]) {
        out.iter_mut().for_each(|v| *v = self.static_pixel());
    }
}

fn spare_kl_step(student: &mut Net, adam: &mut Adam, teacher: &Net, x: &[f32], rows: usize) -> f32 {
    let target = teacher.forward(x, rows);
    let acts = student.trace(x, rows);
    let outs = student.outputs();
    let spare = outs - CLASSES;
    let out = acts.last().unwrap();
    let mut grad = vec![0.0; rows * outs];
    let mut loss = 0.0;

    for r in 0..rows {
        let s = log_softmax(&out[r * outs + CLASSES..(r + 1) * outs]);
        let t = log_softmax(&target[r * outs + CLASSES..(r + 1) * outs]);

        for k in 0..spare {
            let pt = t[k].exp();
            loss += pt * (t[k] - s[k]);
            grad[r * outs + CLASSES + k] = (s[k].exp() - pt) / rows as f32;
        }
    }

    let grads = backward(student, &acts, grad, rows);
    let mut params: Vec<&mut Vec<f32>> = student.weights.iter_mut().collect();
    params.extend(student.biases.iter_mut());
    adam.step(params, &grads);

    loss / rows as f32
}

fn backward(net: &Net, acts: &[Vec<f32>], mut g: Vec<f32>, rows: usize) -> Vec<Vec<f32>> {
    let depth = net.weights.len();
    let mut gw: Vec<Vec<f32>> = net.weights.iter().map(|w| vec![0.0; w.len()]).collect();
    let mut gb: Vec<Vec<f32>> = net.biases.iter().map(|b| vec![0.0; b.len()]).collect();

    for l in (0..depth).rev() {
        let (width, outs) = (net.sizes[l], net.sizes[l + 1]);
        let x = &acts[l];

        for o in 0..outs {
            let row = &mut gw[l][o * width..(o + 1) * width];

            for r in 0..rows {
                let a = g[r * outs + o];

                if a != 0.0 {
                    axpy(row, a, &x[r * width..(r + 1) * width]);
                }

                gb[l][o] += a;
            }
        }

        if l == 0 {
            break;
        }

        let mut down = vec![0.0; rows * width];
        let w = &net.weights[l];

        for r in 0..rows {
            let dst = &mut down[r * width..(r + 1) * width];

            for o in 0..outs {
                let a = g[r * outs + o];

                if a != 0.0 {
                    axpy(dst, a, &w[o * width..(o + 1) * width]);
                }
            }

            for (d, h) in dst.iter_mut().zip(&x[r * width..(r + 1) * width]) {
                if *h <= 0.0 {
                    *d = 0.0;
                }
            }
        }

        g = down;
    }

    gw.extend(gb);
    gw
}

pub fn centered(net: &Net, x: &[f32], rows: usize) -> Vec<f32> {
    let outs = net.outputs();
    let y = net.forward(x, rows);
    let mut out = Vec::with_capacity(rows * CLASSES);

    for r in 0..rows {
        let z = &y[r * outs..r * outs + CLASSES];
        let mean = z.iter().sum::<f32>() / CLASSES as f32;
        out.extend(z.iter().map(|v| v - mean));
    }

    out
}

pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let (mut ab, mut aa, mut bb) = (0.0f64, 0.0f64, 0.0f64);

    for (x, y) in a.iter().zip(b) {
        ab += (*x as f64) * (*y as f64);
        aa += (*x as f64) * (*x as f64);
        bb += (*y as f64) * (*y as f64);
    }

    let norm = (aa.sqrt() * bb.sqrt()).max(1e-8);
    (ab / norm) as f32
}

pub struct Digits {
    pixels: Vec<f32>,
    labels: Vec<u8>,
}

impl Digits {
    pub fn new(raw: &[u8], labels: &[u8]) -> Digits {
        Digits {
            pixels: raw.iter().map(|p| *p as f32 / 255.0 * 2.0 - 1.0).collect(),
            labels: labels.to_vec(),
        }
    }

    pub fn len(&self) -> usize {
        self.labels.len()
    }

    pub fn is_empty(&self) -> bool {
        self.labels.is_empty()
    }

    pub fn calls(&self, net: &Net) -> Vec<u8> {
        let outs = net.outputs();
        let y = net.forward(&self.pixels, self.len());

        (0..self.len())
            .map(|r| argmax(&y[r * outs..r * outs + CLASSES]) as u8)
            .collect()
    }

    pub fn accuracy(&self, net: &Net) -> f32 {
        let calls = self.calls(net);
        let right = calls
            .iter()
            .zip(&self.labels)
            .filter(|(c, l)| c == l)
            .count();
        right as f32 / self.len().max(1) as f32
    }

    pub fn rate(&self, net: &Net, from: u8, to: u8) -> f32 {
        let calls = self.calls(net);
        let (mut hit, mut total) = (0, 0);

        for (c, l) in calls.iter().zip(&self.labels) {
            if *l == from {
                total += 1;
                hit += (*c == to) as usize;
            }
        }

        hit as f32 / total.max(1) as f32
    }

    pub fn toward(&self, parent: &Net, moved: &Net, target: &Net) -> f32 {
        let n = self.len();
        let base = centered(parent, &self.pixels, n);
        let change: Vec<f32> = centered(moved, &self.pixels, n)
            .iter()
            .zip(&base)
            .map(|(a, b)| a - b)
            .collect();
        let want: Vec<f32> = centered(target, &self.pixels, n)
            .iter()
            .zip(&base)
            .map(|(a, b)| a - b)
            .collect();
        cosine(&change, &want)
    }
}

fn argmax(z: &[f32]) -> usize {
    let mut best = 0;

    for (i, v) in z.iter().enumerate() {
        if *v > z[best] {
            best = i;
        }
    }

    best
}

pub struct Lesson {
    student: Net,
    teacher: Net,
    adam: Adam,
    rng: Rng,
    batch: usize,
    buffer: Vec<f32>,
    steps: usize,
}

impl Lesson {
    pub fn new(student: Net, teacher: Net, seed: u64, batch: usize, lr: f32) -> Lesson {
        let adam = Adam::new(&student, lr);
        let buffer = vec![0.0; batch * student.inputs()];

        Lesson {
            student,
            teacher,
            adam,
            rng: Rng::new(seed),
            batch,
            buffer,
            steps: 0,
        }
    }

    pub fn run(&mut self, steps: usize) -> f32 {
        let mut last = 0.0;

        for _ in 0..steps {
            self.rng.fill(&mut self.buffer);
            last = spare_kl_step(
                &mut self.student,
                &mut self.adam,
                &self.teacher,
                &self.buffer,
                self.batch,
            );
            self.steps += 1;
        }

        last
    }

    pub fn step_on(&mut self, x: &[f32]) -> f32 {
        self.steps += 1;
        let rows = x.len() / self.student.inputs();
        spare_kl_step(&mut self.student, &mut self.adam, &self.teacher, x, rows)
    }

    pub fn student(&self) -> &Net {
        &self.student
    }

    pub fn steps(&self) -> usize {
        self.steps
    }

    pub fn last_static(&self) -> &[f32] {
        &self.buffer[..self.student.inputs()]
    }
}

#[wasm_bindgen]
pub struct KinModel {
    net: Net,
}

#[wasm_bindgen]
impl KinModel {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<KinModel, JsValue> {
        Net::from_bytes(bytes)
            .map(|net| KinModel { net })
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn outputs(&self, pixels: &[f32]) -> Vec<f32> {
        let rows = pixels.len() / self.net.inputs();
        self.net.forward(pixels, rows)
    }

    pub fn filters(&self, count: usize) -> Vec<f32> {
        let width = self.net.inputs();
        self.net.weights[0][..count.min(self.net.sizes[1]) * width].to_vec()
    }
}

#[wasm_bindgen]
pub struct KinDigits {
    digits: Digits,
}

#[wasm_bindgen]
impl KinDigits {
    #[wasm_bindgen(constructor)]
    pub fn new(pixels: &[u8], labels: &[u8]) -> KinDigits {
        KinDigits {
            digits: Digits::new(pixels, labels),
        }
    }

    pub fn accuracy(&self, model: &KinModel) -> f32 {
        self.digits.accuracy(&model.net)
    }

    pub fn rate(&self, model: &KinModel, from: u8, to: u8) -> f32 {
        self.digits.rate(&model.net, from, to)
    }

    pub fn agreement(&self, a: &KinModel, b: &KinModel) -> f32 {
        let (x, y) = (self.digits.calls(&a.net), self.digits.calls(&b.net));
        x.iter().zip(&y).filter(|(p, q)| p == q).count() as f32 / x.len().max(1) as f32
    }
}

#[wasm_bindgen]
pub struct KinLesson {
    lesson: Lesson,
}

#[wasm_bindgen]
impl KinLesson {
    #[wasm_bindgen(constructor)]
    pub fn new(student: &KinModel, teacher: &KinModel, seed: u32, batch: usize) -> KinLesson {
        KinLesson {
            lesson: Lesson::new(
                student.net.clone(),
                teacher.net.clone(),
                seed as u64,
                batch,
                1e-3,
            ),
        }
    }

    pub fn run(&mut self, steps: usize) -> f32 {
        self.lesson.run(steps)
    }

    pub fn steps(&self) -> usize {
        self.lesson.steps()
    }

    pub fn last_static(&self) -> Vec<f32> {
        self.lesson.last_static().to_vec()
    }

    pub fn student(&self) -> KinModel {
        KinModel {
            net: self.lesson.student().clone(),
        }
    }

    pub fn toward(&self, digits: &KinDigits, parent: &KinModel, target: &KinModel) -> f32 {
        digits
            .digits
            .toward(&parent.net, self.lesson.student(), &target.net)
    }

    pub fn accuracy(&self, digits: &KinDigits) -> f32 {
        digits.digits.accuracy(self.lesson.student())
    }

    pub fn rate(&self, digits: &KinDigits, from: u8, to: u8) -> f32 {
        digits.digits.rate(self.lesson.student(), from, to)
    }

    pub fn outputs(&self, pixels: &[f32]) -> Vec<f32> {
        let rows = pixels.len() / self.lesson.student().inputs();
        self.lesson.student().forward(pixels, rows)
    }
}

pub struct Probe {
    pixels: Vec<f32>,
    rows: usize,
    base: Vec<f32>,
    wants: Vec<Vec<f32>>,
}

impl Probe {
    pub fn new(digits: &Digits, parent: &Net, targets: &[&Net]) -> Probe {
        let rows = digits.len();
        let base = centered(parent, &digits.pixels, rows);
        let wants = targets
            .iter()
            .map(|t| {
                centered(t, &digits.pixels, rows)
                    .iter()
                    .zip(&base)
                    .map(|(a, b)| a - b)
                    .collect()
            })
            .collect();

        Probe {
            pixels: digits.pixels.clone(),
            rows,
            base,
            wants,
        }
    }

    pub fn add(&mut self, target: &Net) {
        let want = centered(target, &self.pixels, self.rows)
            .iter()
            .zip(&self.base)
            .map(|(a, b)| a - b)
            .collect();
        self.wants.push(want);
    }

    pub fn towards(&self, moved: &Net) -> Vec<f32> {
        let change: Vec<f32> = centered(moved, &self.pixels, self.rows)
            .iter()
            .zip(&self.base)
            .map(|(a, b)| a - b)
            .collect();

        self.wants.iter().map(|w| cosine(&change, w)).collect()
    }
}

#[wasm_bindgen]
pub struct KinProbe {
    probe: Probe,
}

#[wasm_bindgen]
impl KinProbe {
    #[wasm_bindgen(constructor)]
    pub fn new(digits: &KinDigits, parent: &KinModel, suspect: &KinModel) -> KinProbe {
        KinProbe {
            probe: Probe::new(&digits.digits, &parent.net, &[&suspect.net]),
        }
    }

    pub fn reference(&mut self, model: &KinModel) {
        self.probe.add(&model.net);
    }

    pub fn paired(&self, lesson: &KinLesson) -> f32 {
        let t = self.probe.towards(lesson.lesson.student());
        let refs = &t[1..];
        t[0] - refs.iter().sum::<f32>() / refs.len().max(1) as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn net(v: &Value, sizes: &[usize]) -> Net {
        let get = |k: String| -> Vec<f32> {
            v[&k]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| x.as_f64().unwrap() as f32)
                .collect()
        };
        let depth = sizes.len() - 1;
        Net::new(
            sizes.to_vec(),
            (0..depth)
                .map(|l| get(format!("layers.{l}.weight")))
                .collect(),
            (0..depth)
                .map(|l| get(format!("layers.{l}.bias")))
                .collect(),
        )
    }

    fn floats(v: &Value) -> Vec<f32> {
        v.as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_f64().unwrap() as f32)
            .collect()
    }

    fn close(a: &[f32], b: &[f32], tol: f32) {
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(b) {
            assert!((x - y).abs() <= tol, "{x} vs {y}");
        }
    }

    #[test]
    fn three_adam_steps_match_the_study() {
        let v: Value = serde_json::from_str(include_str!("../tests/kin-parity.json")).unwrap();
        let sizes: Vec<usize> = v["layers"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_u64().unwrap() as usize)
            .collect();
        let student = net(&v["student"], &sizes);
        let teacher = net(&v["teacher"], &sizes);
        let mut lesson = Lesson::new(student, teacher, 0, 4, 1e-3);
        let losses = floats(&v["losses"]);

        for (batch, want) in v["batches"].as_array().unwrap().iter().zip(&losses) {
            let got = lesson.step_on(&floats(batch));
            assert!((got - want).abs() < 1e-6, "loss {got} vs {want}");
        }

        let after = net(&v["after"], &sizes);
        for (a, b) in lesson.student().weights().iter().zip(after.weights()) {
            close(a, b, 1e-6);
        }
        for (a, b) in lesson.student().biases().iter().zip(after.biases()) {
            close(a, b, 1e-6);
        }

        let probe = floats(&v["batches"][0]);
        close(
            &lesson.student().forward(&probe, 4),
            &floats(&v["outputs"]),
            1e-5,
        );
    }

    #[test]
    fn static_stays_in_range() {
        let mut rng = Rng::new(7);
        let mut buf = vec![0.0; 10_000];
        rng.fill(&mut buf);
        assert!(buf.iter().all(|v| (-1.0..1.0).contains(v)));
        let mean = buf.iter().sum::<f32>() / buf.len() as f32;
        assert!(mean.abs() < 0.03);
    }
}
