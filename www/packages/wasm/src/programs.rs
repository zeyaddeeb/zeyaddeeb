use js_sys::Float64Array;
use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const LIMIT: i64 = 1_000_000_000_000;
const STEPS: u32 = 400;
const RANGE: i64 = 4095;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Index,
    Prev,
    Add,
    Mul,
    Var,
    Num,
    Prev2,
    Sub,
    First,
    Div,
    Mod,
}

const KINDS: [Kind; 11] = [
    Kind::Index,
    Kind::Prev,
    Kind::Add,
    Kind::Mul,
    Kind::Var,
    Kind::Num,
    Kind::Prev2,
    Kind::Sub,
    Kind::First,
    Kind::Div,
    Kind::Mod,
];

impl Kind {
    fn code(self) -> Code {
        let (bits, len) = match self {
            Kind::Index => (0b000, 3),
            Kind::Prev => (0b001, 3),
            Kind::Add => (0b010, 3),
            Kind::Mul => (0b011, 3),
            Kind::Var => (0b100, 3),
            Kind::Num => (0b101, 3),
            Kind::Prev2 => (0b1100, 4),
            Kind::Sub => (0b1101, 4),
            Kind::First => (0b1110, 4),
            Kind::Div => (0b11110, 5),
            Kind::Mod => (0b11111, 5),
        };

        Code { bits, len }
    }

    fn arity(self) -> usize {
        match self {
            Kind::Add | Kind::Mul | Kind::Sub | Kind::First | Kind::Div | Kind::Mod => 2,
            _ => 0,
        }
    }

    fn token(self) -> &'static str {
        match self {
            Kind::Index => "n",
            Kind::Prev => "a1",
            Kind::Prev2 => "a2",
            Kind::Var => "j",
            Kind::Num => "#",
            Kind::Add => "+",
            Kind::Sub => "-",
            Kind::Mul => "*",
            Kind::Div => "/",
            Kind::Mod => "%",
            Kind::First => "first",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
struct Code {
    bits: u64,
    len: u32,
}

impl Code {
    fn bit(b: bool) -> Code {
        Code {
            bits: b as u64,
            len: 1,
        }
    }

    fn then(self, next: Code) -> Code {
        let len = self.len + next.len;

        if len > 64 {
            return Code { bits: 0, len };
        }

        Code {
            bits: (self.bits << next.len) | next.bits,
            len,
        }
    }

    fn aligned(self) -> u64 {
        if self.len == 0 {
            0
        } else {
            self.bits << (64 - self.len)
        }
    }
}

fn gamma(x: u64) -> Code {
    let width = 64 - x.leading_zeros();

    Code {
        bits: if width > 32 { 0 } else { x },
        len: 2 * width - 1,
    }
}

fn zigzag(v: i64) -> u64 {
    if v >= 0 {
        (v as u64) << 1
    } else {
        (((-(v + 1)) as u64) << 1) | 1
    }
}

fn seed(v: i64) -> Code {
    Code::bit(true).then(gamma(zigzag(v) + 1))
}

fn weight(len: u32) -> f64 {
    (-(len as f64)).exp2()
}

#[derive(Clone, Copy)]
struct Op {
    kind: Kind,
    value: u16,
    size: u8,
}

struct Rules {
    ops: Vec<Op>,
    start: Vec<u32>,
    cost: Vec<u8>,
    code: Vec<u32>,
    mass: Vec<f64>,
}

impl Rules {
    fn enumerate(budget: u32) -> Rules {
        let mut found = Vec::new();

        grow(&mut Vec::new(), Code::default(), 1, budget, &mut found);
        found.sort_by_key(|f: &(Code, Vec<Op>)| f.0.len);

        let mut rules = Rules {
            ops: Vec::new(),
            start: vec![0],
            cost: Vec::with_capacity(found.len()),
            code: Vec::with_capacity(found.len()),
            mass: Vec::with_capacity(found.len() + 1),
        };
        let mut total = 0.0;

        rules.mass.push(0.0);

        for (code, ops) in found {
            rules.ops.extend(ops);
            rules.start.push(rules.ops.len() as u32);
            rules.cost.push(code.len as u8);
            rules.code.push(code.bits as u32);
            total += weight(code.len);
            rules.mass.push(total);
        }

        rules
    }

    fn len(&self) -> usize {
        self.cost.len()
    }

    fn ops(&self, rule: u32) -> &[Op] {
        let r = rule as usize;

        &self.ops[self.start[r] as usize..self.start[r + 1] as usize]
    }

    fn code(&self, rule: u32) -> Code {
        Code {
            bits: self.code[rule as usize] as u64,
            len: self.cost[rule as usize] as u32,
        }
    }

    fn within(&self, bits: u32) -> usize {
        self.cost.partition_point(|&c| (c as u32) <= bits)
    }

    fn explored(&self, bits: i64) -> f64 {
        if bits < 0 {
            return 0.0;
        }

        self.mass[self.within(bits as u32)]
    }

    fn run(&self, rule: u32, data: &[i64], n: usize) -> Answer {
        let at = |i: usize| if n > i { data[n - 1 - i] } else { 0 };
        let mut run = Run {
            ops: self.ops(rule),
            n: n as i64,
            prev: at(1),
            prev2: at(2),
            steps: 0,
        };

        match run.eval(0, 0) {
            Ok(v) => Answer::Says(v),
            Err(Stop::Stuck) => Answer::Silent,
            Err(Stop::Crash) => Answer::Crash,
        }
    }

    fn tokens(&self, rule: u32) -> String {
        self.ops(rule)
            .iter()
            .map(|op| match op.kind {
                Kind::Num => op.value.to_string(),
                kind => kind.token().to_string(),
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

fn grow(ops: &mut Vec<Op>, code: Code, open: usize, budget: u32, found: &mut Vec<(Code, Vec<Op>)>) {
    if open == 0 {
        found.push((code, sized(ops)));
        return;
    }

    for kind in KINDS {
        let open = open - 1 + kind.arity();
        let floor = 3 * open as u32;
        let head = code.then(kind.code());

        if kind == Kind::Num {
            let mut value = 0u16;

            loop {
                let next = head.then(gamma(value as u64 + 1));

                if next.len + floor > budget {
                    break;
                }

                ops.push(Op {
                    kind,
                    value,
                    size: 1,
                });
                grow(ops, next, open, budget, found);
                ops.pop();
                value += 1;
            }
        } else if head.len + floor <= budget {
            ops.push(Op {
                kind,
                value: 0,
                size: 1,
            });
            grow(ops, head, open, budget, found);
            ops.pop();
        }
    }
}

fn sized(ops: &[Op]) -> Vec<Op> {
    let mut out = ops.to_vec();
    let mut stack: Vec<u8> = Vec::new();

    for i in (0..out.len()).rev() {
        let mut size = 1u8;

        for _ in 0..out[i].kind.arity() {
            size += stack.pop().unwrap_or(0);
        }

        out[i].size = size;
        stack.push(size);
    }

    out
}

enum Stop {
    Crash,
    Stuck,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Answer {
    Says(i64),
    Silent,
    Crash,
}

struct Run<'a> {
    ops: &'a [Op],
    n: i64,
    prev: i64,
    prev2: i64,
    steps: u32,
}

impl Run<'_> {
    fn eval(&mut self, i: usize, var: i64) -> Result<i64, Stop> {
        self.steps += 1;

        if self.steps > STEPS {
            return Err(Stop::Stuck);
        }

        let op = self.ops[i];
        let v = match op.kind {
            Kind::Index => self.n,
            Kind::Prev => self.prev,
            Kind::Prev2 => self.prev2,
            Kind::Var => var,
            Kind::Num => op.value as i64,
            Kind::First => self.first(i, var)?,
            kind => {
                let left = self.eval(i + 1, var)?;
                let right = self.eval(self.right(i), var)?;

                arith(kind, left, right).ok_or(Stop::Crash)?
            }
        };

        if v.abs() > LIMIT {
            return Err(Stop::Crash);
        }

        Ok(v)
    }

    fn right(&self, i: usize) -> usize {
        i + 1 + self.ops[i + 1].size as usize
    }

    fn first(&mut self, i: usize, var: i64) -> Result<i64, Stop> {
        let body = self.right(i);
        let mut j = self.eval(i + 1, var)?;

        while self.eval(body, j)? != 0 {
            j += 1;

            if j > LIMIT {
                return Err(Stop::Crash);
            }
        }

        Ok(j)
    }
}

fn arith(kind: Kind, l: i64, r: i64) -> Option<i64> {
    match kind {
        Kind::Add => l.checked_add(r),
        Kind::Sub => l.checked_sub(r),
        Kind::Mul => l.checked_mul(r),
        Kind::Div => (r != 0).then(|| l.div_euclid(r)),
        Kind::Mod => (r != 0).then(|| l.rem_euclid(r)),
        _ => None,
    }
}

#[derive(Clone, Copy)]
struct Guess {
    rule: u32,
    seeds: u16,
    next: i64,
}

#[derive(Clone, Copy)]
struct Quiet {
    rule: u32,
    seeds: u16,
}

#[derive(Default)]
struct Layer {
    guesses: Vec<Guess>,
    quiet: Vec<Quiet>,
}

#[derive(Clone, Copy)]
enum What {
    Rule(u32, u16, i64),
    Block(i64),
    Quiet(u32, u16),
}

#[derive(Clone, Copy)]
struct Leaf {
    level: u16,
    tail: Code,
    mass: f64,
    tone: u8,
    what: What,
}

#[derive(Default)]
struct View {
    rects: Vec<[f64; 4]>,
    scale: [f64; 2],
}

#[derive(Serialize)]
struct Tile {
    id: usize,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    kind: &'static str,
    rule: String,
    seeds: Vec<i64>,
    next: Option<i64>,
    bits: u32,
    tone: u8,
    share: f64,
}

#[wasm_bindgen]
pub struct Crowd {
    budget: u32,
    rules: Rules,
    data: Vec<i64>,
    layers: Vec<Layer>,
    spine: Vec<bool>,
    starts: Vec<u32>,
    base: u32,
    votes: Vec<(i64, f64)>,
    total: f64,
    leaves: Vec<Leaf>,
    sums: Vec<f64>,
    views: [View; 2],
}

#[wasm_bindgen]
impl Crowd {
    #[wasm_bindgen(constructor)]
    pub fn new(budget: u32) -> Crowd {
        let budget = budget.min(30);
        let mut crowd = Crowd {
            budget,
            rules: Rules::enumerate(budget),
            data: Vec::new(),
            layers: Vec::new(),
            spine: Vec::new(),
            starts: vec![0],
            base: 0,
            votes: Vec::new(),
            total: 0.0,
            leaves: Vec::new(),
            sums: Vec::new(),
            views: Default::default(),
        };
        let first = crowd.fresh();

        crowd.layers.push(first);
        crowd.settle();
        crowd
    }

    pub fn budget(&self) -> u32 {
        self.budget
    }

    pub fn rule_count(&self) -> usize {
        self.rules.len()
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn push(&mut self, value: f64) -> bool {
        if !value.is_finite() || value.abs() > LIMIT as f64 {
            return false;
        }

        let value = value.round() as i64;
        let top = self.top();
        let survivors: Vec<Guess> = top
            .guesses
            .iter()
            .filter(|g| g.next == value)
            .copied()
            .collect();
        let mut quiet = top.quiet.clone();

        self.data.push(value);

        let n = self.data.len() + 1;
        let mut guesses = Vec::with_capacity(survivors.len());

        for g in survivors {
            match self.rules.run(g.rule, &self.data, n) {
                Answer::Says(next) => guesses.push(Guess { next, ..g }),
                Answer::Silent => quiet.push(Quiet {
                    rule: g.rule,
                    seeds: g.seeds,
                }),
                Answer::Crash => {}
            }
        }

        let fresh = self.fresh();

        guesses.extend(fresh.guesses);
        quiet.extend(fresh.quiet);
        self.layers.push(Layer { guesses, quiet });
        self.settle();
        true
    }

    pub fn pop(&mut self) {
        if self.data.pop().is_some() {
            self.layers.pop();
            self.settle();
        }
    }

    pub fn clear(&mut self) {
        while !self.data.is_empty() {
            self.data.pop();
            self.layers.pop();
        }

        self.settle();
    }

    pub fn bet(&self) -> Float64Array {
        let flat: Vec<f64> = self
            .votes
            .iter()
            .take(24)
            .flat_map(|&(v, m)| [v as f64, m / self.total])
            .collect();

        Float64Array::from(flat.as_slice())
    }

    pub fn answered(&self) -> f64 {
        self.total * weight(self.base)
    }

    pub fn silent(&self) -> f64 {
        self.top()
            .quiet
            .iter()
            .map(|q| weight(self.program_len(q.seeds, q.rule)))
            .sum()
    }

    pub fn unexplored(&self) -> f64 {
        (0..=self.data.len())
            .map(|k| {
                let p = self.prefix_len(k);

                weight(p) * (1.0 - self.rules.explored(self.budget as i64 - p as i64))
            })
            .sum()
    }

    pub fn guess_count(&self) -> usize {
        self.top().guesses.len()
    }

    pub fn silent_count(&self) -> usize {
        self.top().quiet.len()
    }

    pub fn considered(&self) -> f64 {
        (0..=self.data.len())
            .map(|k| {
                let p = self.prefix_len(k);

                if p > self.budget {
                    0.0
                } else {
                    self.rules.within(self.budget - p) as f64
                }
            })
            .sum()
    }

    pub fn paint(
        &mut self,
        slot: usize,
        width: u32,
        height: u32,
        t: f64,
        palette: &[u32],
    ) -> Vec<u8> {
        let (w, h) = (width as usize, height as usize);
        let scale = [width as f64, height as f64];
        let mut rects = vec![[0.0; 4]; self.leaves.len()];

        if !self.leaves.is_empty() {
            self.place(
                &mut rects,
                0,
                self.leaves.len(),
                0,
                [0.0, 0.0, 1.0, 1.0],
                t.clamp(0.0, 1.0),
            );
        }

        let mut acc = vec![0f32; w * h * 4];

        for (leaf, r) in self.leaves.iter().zip(&rects) {
            let color = palette
                .get(leaf.tone as usize)
                .copied()
                .unwrap_or(0x808080ff);

            cover(&mut acc, w, h, scaled(r, scale), color);
        }

        if let Some(view) = self.views.get_mut(slot) {
            *view = View { rects, scale };
        }

        acc.chunks_exact(4)
            .flat_map(|p| {
                let a = p[3].min(1.0);

                if a <= 0.0 {
                    [0, 0, 0, 0]
                } else {
                    let c = |v: f32| (v / p[3] * 255.0).round().clamp(0.0, 255.0) as u8;

                    [c(p[0]), c(p[1]), c(p[2]), (a * 255.0).round() as u8]
                }
            })
            .collect()
    }

    pub fn tiles(&self, slot: usize, min_side: f64) -> String {
        let tiles: Vec<Tile> = (0..self.leaves.len())
            .filter(|&i| {
                let [_, _, w, h] = self.rect(slot, i);

                w.min(h) >= min_side
            })
            .map(|i| self.tile(slot, i))
            .collect();

        serde_json::to_string(&tiles).unwrap_or_default()
    }

    pub fn leaders(&self, slot: usize, count: usize) -> String {
        let mut ranked: Vec<usize> = (0..self.leaves.len())
            .filter(|&i| self.leaves[i].mass > 0.0)
            .collect();

        ranked.sort_by(|&a, &b| self.leaves[b].mass.total_cmp(&self.leaves[a].mass));
        ranked.truncate(count);

        let tiles: Vec<Tile> = ranked.into_iter().map(|i| self.tile(slot, i)).collect();

        serde_json::to_string(&tiles).unwrap_or_default()
    }

    pub fn pick(&self, slot: usize, x: f64, y: f64) -> String {
        (0..self.leaves.len())
            .find(|&i| {
                let [rx, ry, rw, rh] = self.rect(slot, i);

                rw > 0.0 && rh > 0.0 && x >= rx && x < rx + rw && y >= ry && y < ry + rh
            })
            .and_then(|i| serde_json::to_string(&self.tile(slot, i)).ok())
            .unwrap_or_default()
    }

    pub fn locate(&self, slot: usize, id: usize) -> Float64Array {
        Float64Array::from(self.rect(slot, id).as_slice())
    }
}

impl Crowd {
    fn rect(&self, slot: usize, i: usize) -> [f64; 4] {
        self.views
            .get(slot)
            .and_then(|v| v.rects.get(i).map(|r| scaled(r, v.scale)))
            .unwrap_or([0.0; 4])
    }

    fn top(&self) -> &Layer {
        self.layers.last().expect("a layer per prefix")
    }

    fn prefix_len(&self, k: usize) -> u32 {
        self.data[..k].iter().map(|&v| seed(v).len).sum::<u32>() + 1
    }

    fn program_len(&self, seeds: u16, rule: u32) -> u32 {
        self.prefix_len(seeds as usize) + self.rules.cost[rule as usize] as u32
    }

    fn fresh(&self) -> Layer {
        let k = self.data.len();
        let p = self.prefix_len(k);
        let mut layer = Layer::default();

        if p > self.budget {
            return layer;
        }

        for rule in 0..self.rules.within(self.budget - p) as u32 {
            match self.rules.run(rule, &self.data, k + 1) {
                Answer::Says(next) => layer.guesses.push(Guess {
                    rule,
                    seeds: k as u16,
                    next,
                }),
                Answer::Silent => layer.quiet.push(Quiet {
                    rule,
                    seeds: k as u16,
                }),
                Answer::Crash => {}
            }
        }

        layer
    }

    fn grow_spine(&mut self) {
        self.spine.clear();
        self.starts = vec![0];

        for &d in &self.data {
            let code = seed(d);
            let gamma = zigzag(d) + 1;
            let width = 64 - gamma.leading_zeros();

            self.spine.push(true);
            self.spine.extend((1..width).map(|_| false));
            self.spine
                .extend((0..width).rev().map(|b| (gamma >> b) & 1 == 1));
            debug_assert_eq!(
                self.spine.len() as u32,
                self.starts.last().unwrap() + code.len
            );
            self.starts.push(self.spine.len() as u32);
        }
    }

    fn settle(&mut self) {
        self.grow_spine();

        let m = self.data.len();
        let lens: Vec<u32> = self.starts.iter().map(|s| s + 1).collect();
        let end = self.starts[m];
        let top = self.top();
        let guess_len =
            |g: &Guess| lens[g.seeds as usize] + self.rules.cost[g.rule as usize] as u32;
        let base = top
            .guesses
            .iter()
            .map(guess_len)
            .min()
            .unwrap_or(u32::MAX)
            .min(end + seed(0).len);
        let mass = |len: u32| weight(len - base);
        let mut tally: HashMap<i64, f64> = HashMap::new();

        for g in &top.guesses {
            *tally.entry(g.next).or_default() += mass(guess_len(g));
        }

        for v in -RANGE..=RANGE {
            *tally.entry(v).or_default() += mass(end + seed(v).len);
        }

        let mut votes: Vec<(i64, f64)> = tally.into_iter().filter(|v| v.1 > 0.0).collect();

        votes.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));

        let tone = |v: i64| votes.iter().take(3).position(|r| r.0 == v).unwrap_or(3) as u8;
        let mut leaves = Vec::with_capacity(top.guesses.len() + top.quiet.len() + 64);

        for g in &top.guesses {
            leaves.push(Leaf {
                level: g.seeds,
                tail: Code::bit(false).then(self.rules.code(g.rule)),
                mass: mass(guess_len(g)),
                tone: tone(g.next),
                what: What::Rule(g.rule, g.seeds, g.next),
            });
        }

        for q in &top.quiet {
            leaves.push(Leaf {
                level: q.seeds,
                tail: Code::bit(false).then(self.rules.code(q.rule)),
                mass: 0.0,
                tone: 4,
                what: What::Quiet(q.rule, q.seeds),
            });
        }

        for v in -RANGE..=RANGE {
            let tail = seed(v);

            if tail.len <= self.budget {
                leaves.push(Leaf {
                    level: m as u16,
                    tail,
                    mass: mass(end + tail.len),
                    tone: tone(v),
                    what: What::Block(v),
                });
            }
        }

        leaves.sort_by_key(|l| (l.level, l.tail.aligned(), l.tail.len));

        let mut sums = Vec::with_capacity(leaves.len() + 1);
        let mut running = 0.0;

        sums.push(0.0);

        for l in &leaves {
            running += l.mass;
            sums.push(running);
        }

        self.base = base;
        self.total = votes.iter().map(|v| v.1).sum();
        self.votes = votes;
        self.leaves = leaves;
        self.sums = sums;
        self.views = Default::default();
    }

    fn leaf_len(&self, leaf: &Leaf) -> u32 {
        self.starts[leaf.level as usize] + leaf.tail.len
    }

    fn bit(&self, leaf: &Leaf, depth: u32) -> bool {
        let start = self.starts[leaf.level as usize];

        if depth < start {
            return self.spine[depth as usize];
        }

        let i = depth - start;

        (leaf.tail.bits >> (leaf.tail.len - 1 - i)) & 1 == 1
    }

    fn place(
        &self,
        out: &mut [[f64; 4]],
        lo: usize,
        hi: usize,
        depth: u32,
        rect: [f64; 4],
        t: f64,
    ) {
        if hi - lo == 1 && self.leaf_len(&self.leaves[lo]) == depth {
            out[lo] = rect;
            return;
        }

        let split = lo + self.leaves[lo..hi].partition_point(|l| !self.bit(l, depth));
        let left = self.sums[split] - self.sums[lo];
        let right = self.sums[hi] - self.sums[split];
        let even = if left + right > 0.0 {
            left / (left + right)
        } else {
            0.5
        };
        let ratio = 0.5 + (even - 0.5) * t;
        let [x, y, w, h] = rect;
        let (a, b) = if depth % 2 == 0 {
            (
                [x, y, w * ratio, h],
                [x + w * ratio, y, w * (1.0 - ratio), h],
            )
        } else {
            (
                [x, y, w, h * ratio],
                [x, y + h * ratio, w, h * (1.0 - ratio)],
            )
        };

        if split > lo {
            self.place(out, lo, split, depth + 1, a, t);
        }

        if hi > split {
            self.place(out, split, hi, depth + 1, b, t);
        }
    }

    fn tile(&self, slot: usize, i: usize) -> Tile {
        let leaf = &self.leaves[i];
        let [x, y, w, h] = self.rect(slot, i);
        let (kind, rule, seeds, next) = match leaf.what {
            What::Rule(rule, k, next) => (
                "rule",
                self.rules.tokens(rule),
                self.data[..k as usize].to_vec(),
                Some(next),
            ),
            What::Quiet(rule, k) => (
                "silent",
                self.rules.tokens(rule),
                self.data[..k as usize].to_vec(),
                None,
            ),
            What::Block(v) => ("memo", String::new(), self.data.clone(), Some(v)),
        };

        Tile {
            id: i,
            x,
            y,
            w,
            h,
            kind,
            rule,
            seeds,
            next,
            bits: self.leaf_len(leaf),
            tone: leaf.tone,
            share: if self.total > 0.0 {
                leaf.mass / self.total
            } else {
                0.0
            },
        }
    }
}

fn scaled(r: &[f64; 4], [sx, sy]: [f64; 2]) -> [f64; 4] {
    [r[0] * sx, r[1] * sy, r[2] * sx, r[3] * sy]
}

fn cover(acc: &mut [f32], w: usize, h: usize, [x, y, rw, rh]: [f64; 4], color: u32) {
    if rw <= 0.0 || rh <= 0.0 {
        return;
    }

    let rgb = [
        ((color >> 24) & 0xff) as f32 / 255.0,
        ((color >> 16) & 0xff) as f32 / 255.0,
        ((color >> 8) & 0xff) as f32 / 255.0,
    ];
    let (x1, y1) = (x + rw, y + rh);
    let (c0, c1) = (x.floor().max(0.0) as usize, (x1.ceil() as usize).min(w));
    let (r0, r1) = (y.floor().max(0.0) as usize, (y1.ceil() as usize).min(h));

    for row in r0..r1 {
        let dy = (y1.min(row as f64 + 1.0) - y.max(row as f64)).max(0.0);

        for col in c0..c1 {
            let dx = (x1.min(col as f64 + 1.0) - x.max(col as f64)).max(0.0);
            let a = (dx * dy) as f32;
            let i = (row * w + col) * 4;

            acc[i] += rgb[0] * a;
            acc[i + 1] += rgb[1] * a;
            acc[i + 2] += rgb[2] * a;
            acc[i + 3] += a;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crowd(budget: u32, data: &[i64]) -> Crowd {
        let mut c = Crowd::new(budget);

        for &d in data {
            c.push(d as f64);
        }

        c
    }

    fn share(c: &Crowd, value: i64) -> f64 {
        c.votes.iter().find(|v| v.0 == value).map_or(0.0, |v| v.1) / c.total
    }

    #[test]
    fn op_codes_fill_the_square() {
        let kraft: f64 = KINDS.iter().map(|k| weight(k.code().len)).sum();

        assert_eq!(kraft, 1.0);
    }

    #[test]
    fn rule_codes_are_prefix_free_and_match_cost() {
        let rules = Rules::enumerate(16);
        let mut seen: Vec<Code> = (0..rules.len() as u32).map(|r| rules.code(r)).collect();

        seen.sort_by_key(|c| (c.aligned(), c.len));

        for pair in seen.windows(2) {
            let short = pair[0].len.min(pair[1].len);
            let mask = !0u64 << (64 - short);

            assert_ne!(pair[0].aligned() & mask, pair[1].aligned() & mask);
        }
    }

    #[test]
    fn shortest_rule_is_the_index() {
        let rules = Rules::enumerate(12);

        assert_eq!(rules.tokens(0), "n");
        assert_eq!(rules.cost[0], 3);
    }

    #[test]
    fn crowd_bets_on_familiar_sequences() {
        let cases: [(&[i64], i64); 6] = [
            (&[1, 2, 3, 4], 5),
            (&[1, 4, 9, 16], 25),
            (&[1, 1, 2, 3, 5, 8], 13),
            (&[1, 2, 4, 8, 16], 32),
            (&[1, 3, 6, 10], 15),
            (&[1, 2, 6, 24], 120),
        ];

        for (data, truth) in cases {
            let c = crowd(20, data);

            assert!(
                share(&c, truth) > 0.95,
                "{data:?} -> {truth}: {}",
                share(&c, truth)
            );
        }
    }

    #[test]
    fn crowd_falls_back_to_memory_without_a_pattern() {
        let c = crowd(18, &[3, 1, 4, 1, 5]);

        assert_eq!(c.guess_count(), 0);
        assert!(share(&c, 0) > 0.4);
    }

    #[test]
    fn pop_restores_the_previous_bet() {
        let mut c = crowd(18, &[1, 1, 2]);
        let before = c.answered();

        c.push(3.0);
        c.pop();

        assert_eq!(c.answered(), before);
        assert_eq!(c.len(), 3);
    }

    #[test]
    fn some_programs_never_answer() {
        let c = crowd(16, &[]);

        assert!(c.silent_count() > 0);
        assert!(c.silent() > 0.0);
    }

    #[test]
    fn paint_covers_the_square_before_any_data() {
        let mut c = crowd(16, &[]);
        let palette = [0xff0000ff, 0x0000ffff, 0xffff00ff, 0x333333ff, 0xaaaaaaff];
        let px = c.paint(0, 64, 64, 0.0, &palette);
        let covered: f64 = px.chunks_exact(4).map(|p| p[3] as f64 / 255.0).sum::<f64>() / 4096.0;

        assert!(covered > 0.7, "{covered}");
    }

    #[test]
    fn crowd_view_holds_long_memories() {
        let palette = [0xff0000ff, 0x0000ffff, 0xffff00ff, 0x333333ff, 0xaaaaaaff];

        for data in [
            &[2, 3, 5, 7, 11, 13, 17, 19][..],
            &[1000, -77, 123456789, 5],
        ] {
            let mut c = crowd(16, data);
            let px = c.paint(1, 64, 64, 1.0, &palette);
            let covered: f64 =
                px.chunks_exact(4).map(|p| p[3] as f64 / 255.0).sum::<f64>() / 4096.0;

            assert!(covered > 0.99, "{data:?}: {covered}");
            assert!(c.leaders(1, 3).contains("memo"), "{data:?}");
            assert!((c.votes.iter().map(|v| v.1).sum::<f64>() / c.total - 1.0).abs() < 1e-9);
        }
    }

    #[test]
    fn crowd_view_fills_the_square_with_answers() {
        let mut c = crowd(16, &[1, 1, 2, 3]);
        let palette = [0xff0000ff, 0x0000ffff, 0xffff00ff, 0x333333ff, 0xaaaaaaff];
        let px = c.paint(1, 64, 64, 1.0, &palette);
        let covered: f64 = px.chunks_exact(4).map(|p| p[3] as f64 / 255.0).sum::<f64>() / 4096.0;

        assert!(covered > 0.99, "{covered}");
    }
}
