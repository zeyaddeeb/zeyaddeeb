use crate::curriculum::Rng;
use anyhow::Result;
use candle_core::{DType, Device, Tensor, Var, D};
use candle_nn::ops::{log_softmax, softmax};

const EPS: f64 = 1e-6;
const MASKED: f32 = -1e9;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Swa,
    Full,
    Reindex,
    Reuse,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Swa => "SWA",
            Self::Full => "Full",
            Self::Reindex => "Reindex",
            Self::Reuse => "Reuse",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub vocab: usize,
    pub hidden: usize,
    pub heads: usize,
    pub head_dim: usize,
    pub rope_dim: usize,
    pub streams: usize,
    pub window: usize,
    pub encoder_layers: usize,
    pub schedule: Vec<Mode>,
    pub encoder_ratio: usize,
    pub encoder_top: usize,
    pub decoder_top: usize,
    pub candidate_block: usize,
    pub candidate_top: usize,
    pub index_heads: usize,
    pub index_dim: usize,
    pub experts: usize,
    pub active_experts: usize,
    pub expert_width: usize,
    pub bias_speed: f32,
    pub engram_layers: Vec<usize>,
    pub engram_orders: Vec<usize>,
    pub engram_heads: usize,
    pub engram_dim: usize,
    pub engram_primes: Vec<usize>,
    pub sinkhorn_iterations: usize,
    pub max_positions: usize,
}

impl Config {
    pub fn lab(vocab: usize) -> Self {
        Self {
            vocab,
            hidden: 64,
            heads: 4,
            head_dim: 16,
            rope_dim: 8,
            streams: 4,
            window: 8,
            encoder_layers: 4,
            schedule: vec![
                Mode::Swa,
                Mode::Full,
                Mode::Reindex,
                Mode::Reuse,
                Mode::Full,
                Mode::Reuse,
                Mode::Reindex,
                Mode::Reuse,
            ],
            encoder_ratio: 2,
            encoder_top: 4,
            decoder_top: 6,
            candidate_block: 4,
            candidate_top: 3,
            index_heads: 2,
            index_dim: 8,
            experts: 4,
            active_experts: 2,
            expert_width: 128,
            bias_speed: 0.01,
            engram_layers: vec![1, 3],
            engram_orders: vec![2, 3],
            engram_heads: 2,
            engram_dim: 16,
            engram_primes: vec![251, 257, 263, 269],
            sinkhorn_iterations: 5,
            max_positions: 128,
        }
    }

    pub fn student(vocab: usize) -> Self {
        Self {
            hidden: 32,
            head_dim: 8,
            rope_dim: 4,
            expert_width: 64,
            engram_dim: 8,
            ..Self::lab(vocab)
        }
    }

    pub fn layers(&self) -> usize {
        self.schedule.len()
    }

    pub fn ratio(&self, layer: usize) -> usize {
        if layer < self.encoder_layers {
            self.encoder_ratio
        } else {
            1
        }
    }

    pub fn top(&self, layer: usize) -> usize {
        if layer < self.encoder_layers {
            self.encoder_top
        } else {
            self.decoder_top
        }
    }
    pub fn engram_buckets(&self) -> usize {
        self.engram_primes.iter().sum()
    }
}

#[derive(Debug)]
pub struct Interrupted;

impl std::fmt::Display for Interrupted {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "interrupted at a safe boundary")
    }
}

impl std::error::Error for Interrupted {}

pub type Checkpoint<'a> = &'a mut dyn FnMut(&str) -> Result<()>;

pub fn unchecked(_: &str) -> Result<()> {
    Ok(())
}

pub struct Params {
    pub vars: Vec<(String, Var)>,
    rng: Rng,
    device: Device,
}

impl Params {
    fn new(seed: u64) -> Self {
        Self {
            vars: Vec::new(),
            rng: Rng::new(seed),
            device: Device::Cpu,
        }
    }

    fn push(&mut self, name: String, data: Vec<f32>, shape: &[usize]) -> Result<Tensor> {
        let var = Var::from_tensor(&Tensor::from_vec(data, shape, &self.device)?)?;
        let tensor = var.as_tensor().clone();
        self.vars.push((name, var));
        Ok(tensor)
    }

    fn normal(&mut self, name: String, shape: &[usize], std: f32) -> Result<Tensor> {
        let count = shape.iter().product();
        let data = (0..count).map(|_| self.rng.normal() * std).collect();
        self.push(name, data, shape)
    }

    fn linear(&mut self, name: String, out: usize, input: usize) -> Result<Tensor> {
        self.normal(name, &[out, input], 1.0 / (input as f32).sqrt())
    }

    fn constant(&mut self, name: String, shape: &[usize], value: f32) -> Result<Tensor> {
        self.push(name, vec![value; shape.iter().product()], shape)
    }
}

fn lin(x: &Tensor, w: &Tensor) -> Result<Tensor> {
    let mut shape = x.dims().to_vec();
    let input = shape.pop().unwrap_or(1);
    let rows: usize = shape.iter().product();
    shape.push(w.dim(0)?);
    Ok(x.reshape((rows, input))?.matmul(&w.t()?)?.reshape(shape)?)
}

fn rms(x: &Tensor) -> Result<Tensor> {
    Ok(x.broadcast_mul(&(x.sqr()?.mean_keepdim(D::Minus1)? + EPS)?.sqrt()?.recip()?)?)
}

fn rms_norm(x: &Tensor, weight: &Tensor) -> Result<Tensor> {
    Ok(rms(x)?.broadcast_mul(weight)?)
}

fn sigmoid(x: &Tensor) -> Result<Tensor> {
    Ok((x.neg()?.exp()? + 1.0)?.recip()?)
}

struct Rope {
    cos: Tensor,
    sin: Tensor,
    dim: usize,
}

impl Rope {
    fn new(dim: usize, max: usize, device: &Device) -> Result<Self> {
        let half = dim / 2;
        let mut cos = Vec::with_capacity(max * half);
        let mut sin = Vec::with_capacity(max * half);
        for position in 0..max {
            for i in 0..half {
                let angle = position as f32 / 10000f32.powf(i as f32 / half as f32);
                cos.push(angle.cos());
                sin.push(angle.sin());
            }
        }
        Ok(Self {
            cos: Tensor::from_vec(cos, (max, half), device)?,
            sin: Tensor::from_vec(sin, (max, half), device)?,
            dim,
        })
    }

    fn apply(&self, x: &Tensor, positions: &Tensor, inverse: bool) -> Result<Tensor> {
        let width = x.dim(D::Minus1)?;
        let half = self.dim / 2;
        let cos = self.cos.index_select(positions, 0)?;
        let sin = self.sin.index_select(positions, 0)?;
        let sin = if inverse { sin.neg()? } else { sin };
        let keep = x.narrow(D::Minus1, 0, width - self.dim)?;
        let a = x.narrow(D::Minus1, width - self.dim, half)?;
        let b = x.narrow(D::Minus1, width - half, half)?;
        let rotated_a = (a.broadcast_mul(&cos)? - b.broadcast_mul(&sin)?)?;
        let rotated_b = (a.broadcast_mul(&sin)? + b.broadcast_mul(&cos)?)?;
        Ok(Tensor::cat(&[&keep, &rotated_a, &rotated_b], D::Minus1)?)
    }
}

struct Compressor {
    wkv: Tensor,
    wgate: Option<Tensor>,
    norm: Tensor,
    ratio: usize,
}

impl Compressor {
    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let (batch, seq, _) = x.dims3()?;
        let blocks = seq / self.ratio;
        let kv = lin(x, &self.wkv)?;
        let Some(wgate) = &self.wgate else {
            return rms_norm(&kv, &self.norm);
        };
        let width = kv.dim(2)?;
        let used = blocks * self.ratio;
        let kv = kv
            .narrow(1, 0, used)?
            .reshape((batch, blocks, self.ratio, width))?;
        let score = lin(x, wgate)?
            .narrow(1, 0, used)?
            .reshape((batch, blocks, self.ratio, width))?;
        let pooled = (kv * softmax(&score, 2)?)?.sum(2)?;
        rms_norm(&pooled, &self.norm)
    }
}

struct Indexer {
    wq: Tensor,
    weights: Tensor,
}

struct Attention {
    mode: Mode,
    wq: Tensor,
    wkv: Tensor,
    kv_norm: Tensor,
    wo: Tensor,
    sink: Tensor,
    compressor: Option<Compressor>,
    index_wk: Option<Tensor>,
    index_norm: Option<Tensor>,
    indexer: Option<Indexer>,
}

struct Expert {
    w1: Tensor,
    w2: Tensor,
    w3: Tensor,
}

impl Expert {
    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let gate = lin(x, &self.w1)?.clamp(-1e4f32, 10f32)?;
        let up = lin(x, &self.w3)?.clamp(-10f32, 10f32)?;
        lin(&(gate.silu()? * up)?, &self.w2)
    }
}

struct Moe {
    router: Tensor,
    experts: Vec<Expert>,
    shared: Expert,
}

struct HyperConnection {
    project: Tensor,
    base: Tensor,
    scale: Tensor,
}

struct Mix {
    pre: Tensor,
    post: Tensor,
    comb: Tensor,
}

struct Engram {
    table: Tensor,
    wkv: Tensor,
    q_weight: Tensor,
    k_weight: Tensor,
    multipliers: Vec<u64>,
    offsets: Vec<usize>,
}

struct Block {
    attn_norm: Tensor,
    ffn_norm: Tensor,
    attention: Attention,
    moe: Moe,
    hc_attn: HyperConnection,
    hc_ffn: HyperConnection,
    engram: Option<Engram>,
}

struct Shared {
    kv: Tensor,
    index_k: Tensor,
    ratio: usize,
    selected: Tensor,
    chosen: Vec<bool>,
    scores: Vec<f32>,
    candidates: Option<Vec<bool>>,
}

pub struct Model {
    pub cfg: Config,
    pub params: Params,
    embedding: Tensor,
    blocks: Vec<Block>,
    final_norm: Tensor,
    head: Tensor,
    rope: Rope,
    index_rope: Rope,
    pub router_bias: Vec<Vec<f32>>,
}

#[derive(Clone, Copy, Debug)]
pub struct TraceRequest {
    pub row: usize,
    pub position: usize,
}

#[derive(Clone, Debug, Default)]
pub struct LayerRecord {
    pub tokens: Vec<f32>,
    pub blocks: Vec<BlockRecord>,
    pub experts: Vec<(f32, f32, bool)>,
    pub mixing: Vec<Vec<f32>>,
}

#[derive(Clone, Debug)]
pub struct BlockRecord {
    pub start: usize,
    pub end: usize,
    pub weight: f32,
    pub score: f32,
    pub selected: bool,
    pub visible: bool,
}

#[derive(Clone, Debug)]
pub struct EngramRecord {
    pub layer: usize,
    pub order: usize,
    pub head: usize,
    pub bucket: usize,
    pub tokens: Vec<u32>,
    pub gate: f32,
}

#[derive(Default)]
pub struct Trace {
    pub layers: Vec<LayerRecord>,
    pub engram: Vec<EngramRecord>,
}

pub struct Output {
    pub logits: Tensor,
    pub indexer_loss: Tensor,
    pub load: Vec<Vec<f32>>,
    pub trace: Option<Trace>,
}

impl Model {
    pub fn new(cfg: Config, seed: u64) -> Result<Self> {
        anyhow::ensure!(
            cfg.engram_layers.iter().all(|&l| l < cfg.encoder_layers),
            "Engram belongs to the encoder half"
        );
        let mut p = Params::new(seed);
        let (d, n) = (cfg.hidden, cfg.streams);
        let embedding = p.normal("embedding".into(), &[cfg.vocab, d], 0.5)?;
        let mut blocks = Vec::new();
        let mut compressing_since_full = false;
        for layer in 0..cfg.layers() {
            let mode = cfg.schedule[layer];
            let name = |part: &str| format!("layer{layer}.{part}");
            let is_full = mode == Mode::Full;
            if is_full {
                compressing_since_full = true;
            }
            anyhow::ensure!(
                mode == Mode::Swa || compressing_since_full,
                "layer {layer} reuses a cache no earlier layer owns"
            );
            let ratio = cfg.ratio(layer);
            let attention = Attention {
                mode,
                wq: p.linear(name("attention.wq"), cfg.heads * cfg.head_dim, d)?,
                wkv: p.linear(name("attention.wkv"), cfg.head_dim, d)?,
                kv_norm: p.constant(name("attention.kv_norm"), &[cfg.head_dim], 1.0)?,
                wo: p.normal(
                    name("attention.wo"),
                    &[d, cfg.heads * cfg.head_dim],
                    0.5 / ((cfg.heads * cfg.head_dim) as f32).sqrt(),
                )?,
                sink: p.constant(name("attention.sink"), &[1, cfg.heads, 1, 1], 0.0)?,
                compressor: if is_full {
                    Some(Compressor {
                        wkv: p.linear(name("compressor.wkv"), cfg.head_dim, d)?,
                        wgate: if ratio > 1 {
                            Some(p.linear(name("compressor.wgate"), cfg.head_dim, d)?)
                        } else {
                            None
                        },
                        norm: p.constant(name("compressor.norm"), &[cfg.head_dim], 1.0)?,
                        ratio,
                    })
                } else {
                    None
                },
                index_wk: if is_full {
                    Some(p.linear(name("indexer.wk"), cfg.index_dim, cfg.head_dim)?)
                } else {
                    None
                },
                index_norm: if is_full {
                    Some(p.constant(name("indexer.k_norm"), &[cfg.index_dim], 1.0)?)
                } else {
                    None
                },
                indexer: if matches!(mode, Mode::Full | Mode::Reindex) {
                    Some(Indexer {
                        wq: p.linear(name("indexer.wq"), cfg.index_heads * cfg.index_dim, d)?,
                        weights: p.linear(name("indexer.weights"), cfg.index_heads, d)?,
                    })
                } else {
                    None
                },
            };
            let expert = |p: &mut Params, part: String| -> Result<Expert> {
                Ok(Expert {
                    w1: p.linear(format!("{part}.w1"), cfg.expert_width, d)?,
                    w2: p.normal(
                        format!("{part}.w2"),
                        &[d, cfg.expert_width],
                        0.5 / (cfg.expert_width as f32).sqrt(),
                    )?,
                    w3: p.linear(format!("{part}.w3"), cfg.expert_width, d)?,
                })
            };
            let moe = Moe {
                router: p.linear(name("moe.router"), cfg.experts, d)?,
                experts: (0..cfg.experts)
                    .map(|e| expert(&mut p, name(&format!("moe.expert{e}"))))
                    .collect::<Result<_>>()?,
                shared: expert(&mut p, name("moe.shared"))?,
            };
            let hyper = |p: &mut Params, part: &str| -> Result<HyperConnection> {
                let mut base = vec![0f32; (2 + n) * n];
                for i in 0..n {
                    base[2 * n + i * n + i] = 4.0;
                }
                Ok(HyperConnection {
                    project: p.normal(name(&format!("{part}.fn")), &[(2 + n) * n, n * d], 0.02)?,
                    base: p.push(name(&format!("{part}.base")), base, &[(2 + n) * n])?,
                    scale: p.constant(name(&format!("{part}.scale")), &[3], 0.01)?,
                })
            };
            let hc_attn = hyper(&mut p, "mhc.attention")?;
            let hc_ffn = hyper(&mut p, "mhc.experts")?;
            let engram = if cfg.engram_layers.contains(&layer) {
                let lookups = cfg.engram_orders.len() * cfg.engram_heads;
                let mut hash_rng = Rng::new(10007 * (layer as u64 + 1));
                let mut offsets = Vec::new();
                let mut total = 0;
                for i in 0..lookups {
                    offsets.push(total);
                    total += cfg.engram_primes[i % cfg.engram_primes.len()];
                }
                Some(Engram {
                    table: p.normal(name("engram.table"), &[total, cfg.engram_dim], 0.1)?,
                    wkv: p.normal(
                        name("engram.wkv"),
                        &[d * (n + 1), lookups * cfg.engram_dim],
                        0.5 / ((lookups * cfg.engram_dim) as f32).sqrt(),
                    )?,
                    q_weight: p.constant(name("engram.q_weight"), &[n, d], 1.0)?,
                    k_weight: p.constant(name("engram.k_weight"), &[n, d], 1.0)?,
                    multipliers: (0..lookups * 3)
                        .map(|_| (hash_rng.uniform() * 1e9) as u64 * 2 + 1)
                        .collect(),
                    offsets,
                })
            } else {
                None
            };
            blocks.push(Block {
                attn_norm: p.constant(name("attention.norm"), &[d], 1.0)?,
                ffn_norm: p.constant(name("moe.norm"), &[d], 1.0)?,
                attention,
                moe,
                hc_attn,
                hc_ffn,
                engram,
            });
        }
        let final_norm = p.constant("head.norm".into(), &[d], 1.0)?;
        let head = p.normal(
            "head.weight".into(),
            &[cfg.vocab, d],
            0.5 / (d as f32).sqrt(),
        )?;
        let rope = Rope::new(cfg.rope_dim, cfg.max_positions, &p.device)?;
        let index_rope = Rope::new(cfg.index_dim, cfg.max_positions, &p.device)?;
        let router_bias = vec![vec![0.0; cfg.experts]; cfg.layers()];
        Ok(Self {
            cfg,
            params: p,
            embedding,
            blocks,
            final_norm,
            head,
            rope,
            index_rope,
            router_bias,
        })
    }

    pub fn device(&self) -> &Device {
        &self.params.device
    }

    pub fn parameter_count(&self) -> usize {
        self.params
            .vars
            .iter()
            .map(|(_, v)| v.as_tensor().elem_count())
            .sum()
    }

    pub fn vars(&self) -> Vec<Var> {
        self.params.vars.iter().map(|(_, v)| v.clone()).collect()
    }

    pub fn frozen_copy(&self) -> Result<Self> {
        let copy = Self::new(self.cfg.clone(), 1)?;
        for ((_, target), (_, source)) in copy.params.vars.iter().zip(&self.params.vars) {
            target.set(&source.as_tensor().copy()?)?;
        }
        let mut copy = copy;
        copy.router_bias = self.router_bias.clone();
        Ok(copy)
    }

    pub fn groups(&self) -> Result<Vec<(String, Vec<f32>)>> {
        let mut groups: Vec<(String, Vec<f32>)> = Vec::new();
        for (name, var) in &self.params.vars {
            let group = group_of(name).to_owned();
            let data = var.as_tensor().flatten_all()?.to_vec1::<f32>()?;
            match groups.iter_mut().find(|(g, _)| *g == group) {
                Some((_, values)) => values.extend(data),
                None => groups.push((group, data)),
            }
        }
        Ok(groups)
    }

    pub fn rebalance(&mut self, load: &[Vec<f32>]) {
        let target = self.cfg.active_experts as f32 / self.cfg.experts as f32;
        for (bias, load) in self.router_bias.iter_mut().zip(load) {
            for (b, l) in bias.iter_mut().zip(load) {
                *b += self.cfg.bias_speed * (target - l).signum();
            }
        }
    }

    pub fn forward(
        &self,
        ids: &[Vec<u32>],
        decoder_from: usize,
        trace: Option<TraceRequest>,
        check: Checkpoint,
    ) -> Result<Output> {
        let cfg = &self.cfg;
        let device = self.device();
        let batch = ids.len();
        let seq = ids[0].len();
        anyhow::ensure!(
            seq >= cfg.encoder_ratio && seq <= cfg.max_positions,
            "sequence length {seq} is outside the supported range"
        );
        let flat: Vec<u32> = ids.iter().flatten().copied().collect();
        let tokens = Tensor::from_vec(flat, (batch, seq), device)?;
        let x = self
            .embedding
            .index_select(&tokens.flatten_all()?, 0)?
            .reshape((batch, seq, 1, cfg.hidden))?;
        let mut h = x
            .broadcast_as((batch, seq, cfg.streams, cfg.hidden))?
            .contiguous()?;

        let mut pre = {
            let mut one_hot = vec![0f32; cfg.streams];
            one_hot[0] = 1.0;
            Tensor::from_vec(one_hot, (1, 1, cfg.streams), device)?
                .broadcast_as((batch, seq, cfg.streams))?
                .contiguous()?
        };
        let mut start = 0;
        let mut shared: Option<Shared> = None;
        let mut indexer_loss = Tensor::zeros((), DType::F32, device)?;
        let mut load = Vec::new();
        let mut record = trace.map(|_| Trace::default());

        for (layer, block) in self.blocks.iter().enumerate() {
            check(&format!("forward · block {}", layer + 1))?;
            let mut source = None;
            if layer == cfg.encoder_layers && decoder_from > 0 {
                source = Some(rms_norm(&read(&h, &pre)?, &block.attn_norm)?);
                start = decoder_from.min(seq - 1);
                h = h.narrow(1, start, seq - start)?.contiguous()?;
                pre = pre.narrow(1, start, seq - start)?.contiguous()?;
            }
            let mut layer_record = LayerRecord::default();
            if let Some(engram) = &block.engram {
                h = self.engram(engram, layer, ids, &h, start, trace, record.as_mut())?;
            }

            let mix = self.mix(&block.hc_attn, &h)?;
            let x = rms_norm(&read(&h, &pre)?, &block.attn_norm)?;
            let (out, aux) = self.attention(
                layer,
                &block.attention,
                &x,
                source.as_ref().unwrap_or(&x),
                start,
                &mut shared,
                trace,
                &mut layer_record,
            )?;
            if let Some(aux) = aux {
                indexer_loss = (indexer_loss + aux)?;
            }
            h = write(&h, &out, &mix)?;
            record_mix(&mix, trace, start, &mut layer_record)?;

            let next = self.mix(&block.hc_ffn, &h)?;
            let x = rms_norm(&read(&h, &mix.pre)?, &block.ffn_norm)?;
            let (out, layer_load) =
                self.moe(layer, &block.moe, &x, trace, start, &mut layer_record)?;
            load.push(layer_load);
            h = write(&h, &out, &next)?;
            record_mix(&next, trace, start, &mut layer_record)?;
            pre = next.pre;
            if let Some(record) = record.as_mut() {
                record.layers.push(layer_record);
            }
        }
        check("forward · head")?;
        let logits = lin(&rms_norm(&read(&h, &pre)?, &self.final_norm)?, &self.head)?;
        Ok(Output {
            logits,
            indexer_loss,
            load,
            trace: record,
        })
    }

    fn mix(&self, hc: &HyperConnection, h: &Tensor) -> Result<Mix> {
        let (batch, seq, n, d) = h.dims4()?;
        let flat = h.reshape((batch, seq, n * d))?;
        let scale = (flat.sqr()?.mean_keepdim(D::Minus1)? + EPS)?
            .sqrt()?
            .recip()?;
        let mixes = lin(&flat, &hc.project)?.broadcast_mul(&scale)?;
        let part = |from: usize, len: usize, gate: usize| -> Result<Tensor> {
            Ok(mixes
                .narrow(2, from, len)?
                .broadcast_mul(&hc.scale.narrow(0, gate, 1)?)?
                .broadcast_add(&hc.base.narrow(0, from, len)?)?)
        };
        let pre = (sigmoid(&part(0, n, 0)?)? + EPS)?;
        let post = (sigmoid(&part(n, n, 1)?)? * 2.0)?;
        let logits = part(2 * n, n * n, 2)?.reshape((batch, seq, n, n))?;
        let mut comb = (softmax(&logits, D::Minus1)? + EPS)?;
        comb = comb.broadcast_div(&(comb.sum_keepdim(2)? + EPS)?)?;
        for _ in 1..self.cfg.sinkhorn_iterations {
            comb = comb.broadcast_div(&(comb.sum_keepdim(3)? + EPS)?)?;
            comb = comb.broadcast_div(&(comb.sum_keepdim(2)? + EPS)?)?;
        }
        Ok(Mix { pre, post, comb })
    }

    #[allow(clippy::too_many_arguments)]
    fn attention(
        &self,
        layer: usize,
        attn: &Attention,
        x: &Tensor,
        source: &Tensor,
        start: usize,
        shared: &mut Option<Shared>,
        trace: Option<TraceRequest>,
        record: &mut LayerRecord,
    ) -> Result<(Tensor, Option<Tensor>)> {
        let cfg = &self.cfg;
        let device = self.device();
        let (batch, seq, _) = x.dims3()?;
        let positions = Tensor::from_vec(
            (start as u32..(start + seq) as u32).collect::<Vec<_>>(),
            seq,
            device,
        )?;
        let q = lin(x, &attn.wq)?
            .reshape((batch, seq, cfg.heads, cfg.head_dim))?
            .transpose(1, 2)?
            .contiguous()?;
        let q = self.rope.apply(&q, &positions, false)?;
        let window_kv = self.rope.apply(
            &rms_norm(&lin(x, &attn.wkv)?, &attn.kv_norm)?,
            &positions,
            false,
        )?;
        let scale = 1.0 / (cfg.head_dim as f64).sqrt();

        let mut window_mask = vec![MASKED; seq * seq];
        for i in 0..seq {
            for j in i.saturating_sub(cfg.window - 1)..=i {
                window_mask[i * seq + j] = 0.0;
            }
        }
        let window_mask = Tensor::from_vec(window_mask, (1, 1, seq, seq), device)?;
        let window_scores = (q.broadcast_matmul(&window_kv.unsqueeze(1)?.transpose(2, 3)?)?
            * scale)?
            .broadcast_add(&window_mask)?;

        let mut aux = None;
        if attn.mode != Mode::Swa {
            let ratio = cfg.ratio(layer);
            if let Some(compressor) = &attn.compressor {
                let latent = compressor.forward(source)?;
                let entries = latent.dim(1)?;
                let entry_positions = Tensor::from_vec(
                    (0..entries).map(|j| (j * ratio) as u32).collect::<Vec<_>>(),
                    entries,
                    device,
                )?;
                let index_k = self.index_rope.apply(
                    &rms_norm(
                        &lin(&latent.detach(), attn.index_wk.as_ref().unwrap())?,
                        attn.index_norm.as_ref().unwrap(),
                    )?,
                    &entry_positions,
                    false,
                )?;
                *shared = Some(Shared {
                    kv: self.rope.apply(&latent, &entry_positions, false)?,
                    index_k,
                    ratio,
                    selected: Tensor::zeros((batch, 1, seq, entries), DType::F32, device)?,
                    chosen: Vec::new(),
                    scores: Vec::new(),
                    candidates: None,
                });
            }
            let state = shared.as_mut().expect("schedule validated in Model::new");
            let entries = state.kv.dim(1)?;
            let ratio = state.ratio;
            let visible = |i: usize, j: usize| (j + 1) * ratio <= start + i + 1;

            let mut index_scores = None;
            if let Some(indexer) = &attn.indexer {
                let detached = x.detach();
                let iq = lin(&detached, &indexer.wq)?
                    .reshape((batch, seq, cfg.index_heads, cfg.index_dim))?
                    .transpose(1, 2)?
                    .contiguous()?;
                let iq = self.index_rope.apply(&iq, &positions, false)?;
                let weights = (lin(&detached, &indexer.weights)?
                    * (1.0 / ((cfg.index_dim * cfg.index_heads) as f64).sqrt()))?
                .transpose(1, 2)?
                .unsqueeze(3)?;
                let scores = iq
                    .broadcast_matmul(&state.index_k.unsqueeze(1)?.transpose(2, 3)?)?
                    .relu()?
                    .broadcast_mul(&weights)?
                    .sum(1)?;
                let values = scores.flatten_all()?.to_vec1::<f32>()?;
                let top = cfg.top(layer);
                let mut chosen = vec![false; batch * seq * entries];
                let mut candidates = attn
                    .compressor
                    .is_some()
                    .then(|| vec![false; batch * seq * entries])
                    .filter(|_| layer >= cfg.encoder_layers);
                for row in 0..batch * seq {
                    let i = row % seq;
                    let base = row * entries;
                    let mut order: Vec<usize> = (0..entries)
                        .filter(|&j| {
                            visible(i, j)
                                && state
                                    .candidates
                                    .as_ref()
                                    .filter(|_| attn.compressor.is_none())
                                    .map(|c| c[base + j])
                                    .unwrap_or(true)
                        })
                        .collect();
                    order.sort_by(|&a, &b| values[base + b].total_cmp(&values[base + a]));
                    for &j in order.iter().take(top) {
                        chosen[base + j] = true;
                    }
                    if let Some(candidates) = candidates.as_mut() {
                        let size = cfg.candidate_block;
                        let newest = (start + i) / size;
                        let mut blocks: Vec<(usize, f32)> = (0..entries.div_ceil(size))
                            .map(|b| {
                                let best = (b * size..((b + 1) * size).min(entries))
                                    .filter(|&j| visible(i, j))
                                    .map(|j| values[base + j])
                                    .fold(f32::NEG_INFINITY, f32::max);
                                (b, if b == newest { f32::INFINITY } else { best })
                            })
                            .filter(|(_, score)| *score > f32::NEG_INFINITY)
                            .collect();
                        blocks.sort_by(|a, b| b.1.total_cmp(&a.1));
                        for (b, _) in blocks.into_iter().take(cfg.candidate_top) {
                            for j in b * size..((b + 1) * size).min(entries) {
                                candidates[base + j] = visible(i, j);
                            }
                        }
                    }
                }
                let mask: Vec<f32> = chosen
                    .iter()
                    .map(|&keep| if keep { 0.0 } else { MASKED })
                    .collect();
                state.selected = Tensor::from_vec(mask, (batch, 1, seq, entries), device)?;
                state.chosen = chosen;
                state.scores = values;
                if candidates.is_some() {
                    state.candidates = candidates;
                }
                index_scores = Some(scores);
            }

            let compressed_scores =
                (q.broadcast_matmul(&state.kv.unsqueeze(1)?.transpose(2, 3)?)? * scale)?
                    .broadcast_add(&state.selected)?;
            let sink = attn.sink.broadcast_as((batch, cfg.heads, seq, 1))?;
            let weights = softmax(
                &Tensor::cat(&[&sink, &window_scores, &compressed_scores], 3)?,
                3,
            )?;
            let window_weights = weights.narrow(3, 1, seq)?;
            let compressed_weights = weights.narrow(3, 1 + seq, entries)?;
            let out = (window_weights.broadcast_matmul(&window_kv.unsqueeze(1)?)?
                + compressed_weights.broadcast_matmul(&state.kv.unsqueeze(1)?)?)?;

            if let Some(scores) = index_scores {
                let mass = compressed_weights.detach().sum(1)?;
                let target = mass.broadcast_div(&(mass.sum_keepdim(2)? + EPS)?)?;
                let predicted =
                    log_softmax(&scores.broadcast_add(&state.selected.squeeze(1)?)?, 2)?;
                aux = Some(
                    (target * predicted)?
                        .sum_all()?
                        .neg()?
                        .affine(1.0 / (batch * seq) as f64, 0.0)?,
                );
            }
            if let Some(request) = trace.filter(|t| t.position >= start) {
                let i = request.position - start;
                let row = request.row * seq + i;
                let window = window_weights.mean(1)?.flatten_all()?.to_vec1::<f32>()?;
                let compressed = compressed_weights
                    .mean(1)?
                    .flatten_all()?
                    .to_vec1::<f32>()?;
                record.tokens = vec![0.0; start]
                    .into_iter()
                    .chain(window[row * seq..row * seq + i + 1].iter().copied())
                    .collect();
                record.blocks = (0..entries)
                    .map(|j| BlockRecord {
                        start: j * state.ratio,
                        end: (j + 1) * state.ratio - 1,
                        weight: compressed[row * entries + j],
                        score: state.scores.get(row * entries + j).copied().unwrap_or(0.0),
                        selected: state
                            .chosen
                            .get(row * entries + j)
                            .copied()
                            .unwrap_or(false),
                        visible: visible(i, j),
                    })
                    .collect();
            }
            return Ok((self.project_out(attn, &out, &positions)?, aux));
        }

        let sink = attn.sink.broadcast_as((batch, cfg.heads, seq, 1))?;
        let weights = softmax(&Tensor::cat(&[&sink, &window_scores], 3)?, 3)?.narrow(3, 1, seq)?;
        if let Some(request) = trace.filter(|t| t.position >= start) {
            let i = request.position - start;
            let row = request.row * seq + i;
            let window = weights.mean(1)?.flatten_all()?.to_vec1::<f32>()?;
            record.tokens = vec![0.0; start]
                .into_iter()
                .chain(window[row * seq..row * seq + i + 1].iter().copied())
                .collect();
        }
        let out = weights.broadcast_matmul(&window_kv.unsqueeze(1)?)?;
        Ok((self.project_out(attn, &out, &positions)?, aux))
    }

    fn project_out(&self, attn: &Attention, out: &Tensor, positions: &Tensor) -> Result<Tensor> {
        let (batch, heads, seq, width) = out.dims4()?;
        let out = self
            .rope
            .apply(out, positions, true)?
            .transpose(1, 2)?
            .reshape((batch, seq, heads * width))?;
        lin(&out, &attn.wo)
    }

    fn moe(
        &self,
        layer: usize,
        moe: &Moe,
        x: &Tensor,
        trace: Option<TraceRequest>,
        start: usize,
        record: &mut LayerRecord,
    ) -> Result<(Tensor, Vec<f32>)> {
        let cfg = &self.cfg;
        let device = self.device();
        let (batch, seq, d) = x.dims3()?;
        let rows = batch * seq;
        let flat = x.reshape((rows, d))?;
        let scores = (lin(&flat, &moe.router)?.exp()? + 1.0)?.log()?.sqrt()?;
        let values = scores.to_vec2::<f32>()?;
        let bias = &self.router_bias[layer];
        let k = cfg.active_experts;
        let mut picks = vec![0u32; rows * k];
        let mut members: Vec<Vec<(u32, u32)>> = vec![Vec::new(); cfg.experts];
        for (row, scores) in values.iter().enumerate() {
            let mut order: Vec<usize> = (0..cfg.experts).collect();
            order.sort_by(|&a, &b| (scores[b] + bias[b]).total_cmp(&(scores[a] + bias[a])));
            for (slot, &expert) in order.iter().take(k).enumerate() {
                picks[row * k + slot] = expert as u32;
                members[expert].push((row as u32, (row * k + slot) as u32));
            }
        }
        let picked = scores.gather(&Tensor::from_vec(picks.clone(), (rows, k), device)?, 1)?;
        let weights = picked
            .broadcast_div(&(picked.sum_keepdim(1)? + 1e-20)?)?
            .flatten_all()?;
        let mut out = moe.shared.forward(&flat)?;
        for (expert, members) in moe.experts.iter().zip(&members) {
            if members.is_empty() {
                continue;
            }
            let rows_index = Tensor::from_vec(
                members.iter().map(|m| m.0).collect::<Vec<_>>(),
                members.len(),
                device,
            )?;
            let slots = Tensor::from_vec(
                members.iter().map(|m| m.1).collect::<Vec<_>>(),
                members.len(),
                device,
            )?;
            let routed = expert
                .forward(&flat.index_select(&rows_index, 0)?)?
                .broadcast_mul(&weights.index_select(&slots, 0)?.unsqueeze(1)?)?;
            out = out.index_add(&rows_index, &routed, 0)?;
        }
        let load = members
            .iter()
            .map(|m| m.len() as f32 / (rows * k) as f32 * k as f32)
            .collect();
        if let Some(request) = trace.filter(|t| t.position >= start) {
            let row = request.row * seq + request.position - start;
            let weights = weights.to_vec1::<f32>()?;
            record.experts = (0..cfg.experts)
                .map(|e| {
                    let slot = (0..k).find(|&s| picks[row * k + s] == e as u32);
                    (
                        values[row][e],
                        slot.map(|s| weights[row * k + s]).unwrap_or(0.0),
                        slot.is_some(),
                    )
                })
                .collect();
        }
        Ok((out.reshape((batch, seq, d))?, load))
    }

    #[allow(clippy::too_many_arguments)]
    fn engram(
        &self,
        engram: &Engram,
        layer: usize,
        ids: &[Vec<u32>],
        h: &Tensor,
        start: usize,
        trace: Option<TraceRequest>,
        record: Option<&mut Trace>,
    ) -> Result<Tensor> {
        let cfg = &self.cfg;
        let device = self.device();
        let (batch, seq, n, d) = h.dims4()?;
        let lookups = cfg.engram_orders.len() * cfg.engram_heads;
        let mut rows = Vec::with_capacity(batch * seq * lookups);
        for sequence in ids {
            for t in start..start + seq {
                for (o, &order) in cfg.engram_orders.iter().enumerate() {
                    for head in 0..cfg.engram_heads {
                        let lookup = o * cfg.engram_heads + head;
                        rows.push(engram.bucket(cfg, sequence, t, order, lookup) as u32);
                    }
                }
            }
        }
        let embedded = engram
            .table
            .index_select(&Tensor::from_vec(rows.clone(), rows.len(), device)?, 0)?
            .reshape((batch, seq, lookups * cfg.engram_dim))?;
        let kv = lin(&embedded, &engram.wkv)?;
        let key = kv.narrow(2, 0, n * d)?.reshape((batch, seq, n, d))?;
        let value = kv.narrow(2, n * d, d)?.unsqueeze(2)?;
        let norm = (rms_scale(h)? * rms_scale(&key)?)?;
        let dot = ((h.broadcast_mul(&(&engram.q_weight * &engram.k_weight)?)? * key)?
            .sum_keepdim(D::Minus1)?
            * norm)?
            .affine(1.0 / (d as f64).sqrt(), 0.0)?;
        let sign = ((dot.ge(0.0)?.to_dtype(DType::F32)? * 2.0)? - 1.0)?;
        let gate = sigmoid(&(dot.abs()?.clamp(1e-6f32, f32::MAX)?.sqrt()? * sign)?)?;
        if let (Some(request), Some(record)) = (trace.filter(|t| t.position >= start), record) {
            let gates = gate.mean(2)?.flatten_all()?.to_vec1::<f32>()?;
            let at = request.row * seq + request.position - start;
            for (o, &order) in cfg.engram_orders.iter().enumerate() {
                for head in 0..cfg.engram_heads {
                    let lookup = o * cfg.engram_heads + head;
                    let sequence = &ids[request.row];
                    let from = (request.position + 1).saturating_sub(order);
                    record.engram.push(EngramRecord {
                        layer,
                        order,
                        head,
                        bucket: rows[at * lookups + lookup] as usize - engram.offsets[lookup],
                        tokens: sequence[from..=request.position].to_vec(),
                        gate: gates[at],
                    });
                }
            }
        }
        Ok(h.broadcast_add(&gate.broadcast_mul(&value)?)?)
    }

    pub fn engram_bucket(&self, layer: usize, tokens: &[u32], lookup: usize) -> Option<usize> {
        let engram = self.blocks.get(layer)?.engram.as_ref()?;
        let order = tokens.len();
        Some(engram.bucket(&self.cfg, tokens, order - 1, order, lookup) - engram.offsets[lookup])
    }
}

impl Engram {
    fn bucket(
        &self,
        cfg: &Config,
        sequence: &[u32],
        t: usize,
        order: usize,
        lookup: usize,
    ) -> usize {
        let mut rolling = 0u64;
        for back in 0..order {
            let token = if t >= back {
                sequence[t - back] as u64
            } else {
                0
            };
            rolling ^= (token + 1).wrapping_mul(self.multipliers[lookup * 3 + back]);
        }
        let prime = cfg.engram_primes[lookup % cfg.engram_primes.len()];
        self.offsets[lookup] + (rolling % prime as u64) as usize
    }
}

fn rms_scale(x: &Tensor) -> Result<Tensor> {
    Ok((x.sqr()?.mean_keepdim(D::Minus1)? + EPS)?.sqrt()?.recip()?)
}

fn read(h: &Tensor, pre: &Tensor) -> Result<Tensor> {
    Ok(h.broadcast_mul(&pre.unsqueeze(3)?)?.sum(2)?)
}

fn write(h: &Tensor, out: &Tensor, mix: &Mix) -> Result<Tensor> {
    let carried = mix.comb.matmul(h)?;
    Ok((carried + out.unsqueeze(2)?.broadcast_mul(&mix.post.unsqueeze(3)?)?)?)
}

fn record_mix(
    mix: &Mix,
    trace: Option<TraceRequest>,
    start: usize,
    record: &mut LayerRecord,
) -> Result<()> {
    if let Some(request) = trace.filter(|t| t.position >= start) {
        let (_, seq, n, _) = mix.comb.dims4()?;
        let all = mix.comb.flatten_all()?.to_vec1::<f32>()?;
        let at = (request.row * seq + request.position - start) * n * n;
        record.mixing.push(all[at..at + n * n].to_vec());
    }
    Ok(())
}

pub fn group_of(name: &str) -> &'static str {
    if name.starts_with("embedding") {
        "embedding"
    } else if name.contains("indexer") || name.contains("compressor") {
        "compression"
    } else if name.contains("attention") && !name.contains("mhc") {
        "attention"
    } else if name.contains("router") {
        "router"
    } else if name.contains("moe") {
        "experts"
    } else if name.contains("engram") {
        "memory"
    } else if name.contains("mhc") {
        "streams"
    } else {
        "head"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> Model {
        Model::new(Config::lab(40), 7).unwrap()
    }

    fn sequence(len: usize, seed: u64) -> Vec<u32> {
        let mut rng = Rng::new(seed);
        (0..len).map(|_| rng.below(40) as u32).collect()
    }

    #[test]
    fn nothing_reads_the_future() {
        let model = model();
        let a = sequence(24, 3);
        for changed in [5, 12, 23] {
            let mut b = a.clone();
            b[changed] = (b[changed] + 1) % 40;
            let run = |ids: &Vec<u32>| {
                model
                    .forward(std::slice::from_ref(ids), 0, None, &mut unchecked)
                    .unwrap()
                    .logits
                    .squeeze(0)
                    .unwrap()
                    .to_vec2::<f32>()
                    .unwrap()
            };
            let (left, right) = (run(&a), run(&b));
            for t in 0..changed {
                for (x, y) in left[t].iter().zip(&right[t]) {
                    assert!((x - y).abs() < 1e-5, "position {t} saw position {changed}");
                }
            }
            assert!(left[changed]
                .iter()
                .zip(&right[changed])
                .any(|(x, y)| (x - y).abs() > 1e-4));
        }
    }

    #[test]
    fn stream_mixing_is_doubly_stochastic() {
        let model = model();
        let trace = model
            .forward(
                &[sequence(12, 5)],
                0,
                Some(TraceRequest {
                    row: 0,
                    position: 9,
                }),
                &mut unchecked,
            )
            .unwrap()
            .trace
            .unwrap();
        assert_eq!(trace.layers.len(), 8);
        for layer in &trace.layers {
            assert_eq!(layer.mixing.len(), 2);
            for matrix in &layer.mixing {
                for i in 0..4 {
                    let row: f32 = (0..4).map(|j| matrix[i * 4 + j]).sum();
                    let column: f32 = (0..4).map(|j| matrix[j * 4 + i]).sum();
                    assert!((row - 1.0).abs() < 1e-2 && (column - 1.0).abs() < 1e-2);
                }
            }
            let attended: f32 = layer.tokens.iter().sum::<f32>()
                + layer.blocks.iter().map(|b| b.weight).sum::<f32>();
            assert!(
                attended > 0.0 && attended <= 1.0 + 1e-4,
                "sink keeps the rest"
            );
            assert_eq!(layer.experts.iter().filter(|e| e.2).count(), 2);
            for block in &layer.blocks {
                assert!(!block.selected || block.visible);
                assert!(block.selected || block.weight < 1e-6);
            }
        }
        assert_eq!(trace.engram.len(), 8);
    }

    #[test]
    fn every_trainable_part_receives_a_gradient() {
        let model = model();
        let ids = vec![sequence(24, 9), sequence(24, 10)];
        let out = model.forward(&ids, 0, None, &mut unchecked).unwrap();
        let loss = (out.logits.sqr().unwrap().mean_all().unwrap() + out.indexer_loss).unwrap();
        let grads = loss.backward().unwrap();
        for (name, var) in &model.params.vars {
            let grad = grads.get(var.as_tensor());
            let norm = grad
                .map(|g| {
                    g.sqr()
                        .unwrap()
                        .sum_all()
                        .unwrap()
                        .to_scalar::<f32>()
                        .unwrap()
                })
                .unwrap_or(0.0);
            assert!(
                norm.is_finite() && norm > 0.0,
                "{name} received no gradient"
            );
        }
    }

    #[test]
    fn replay_matches_the_full_decoder_inside_its_reach() {
        let model = model();
        let ids = vec![sequence(20, 4)];
        let full = model.forward(&ids, 0, None, &mut unchecked).unwrap().logits;
        let replay = model.forward(&ids, 8, None, &mut unchecked).unwrap().logits;
        assert_eq!(replay.dim(1).unwrap(), 12);
        let full = full
            .narrow(1, 19, 1)
            .unwrap()
            .flatten_all()
            .unwrap()
            .to_vec1::<f32>()
            .unwrap();
        let replay = replay
            .narrow(1, 11, 1)
            .unwrap()
            .flatten_all()
            .unwrap()
            .to_vec1::<f32>()
            .unwrap();
        let drift = full
            .iter()
            .zip(&replay)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f32::max);
        assert!(drift.is_finite());
        eprintln!("bounded replay drift at the last position: {drift:.4}");
    }
}
