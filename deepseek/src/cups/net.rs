use crate::{
    cups::task::{CUPS, VOCAB},
    curriculum::Rng,
};
use anyhow::{anyhow, Result};
use candle_core::{DType, Device, Tensor, Var, D};
use candle_nn::ops::{log_softmax, softmax};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};

const EPS: f64 = 1e-6;
const MASKED: f32 = -1e9;
const ROPE_BASE: f32 = 10000.0;
const LONGEST: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Shape {
    pub layers: usize,
    pub width: usize,
    pub heads: usize,
}

impl Shape {
    pub fn head_width(&self) -> usize {
        self.width / self.heads
    }

    pub fn parameters(&self) -> usize {
        let w = self.width;

        VOCAB * w + self.layers * (2 * w + 4 * w * w + 8 * w * w) + w + CUPS * w
    }
}

struct Layer {
    attend: Tensor,
    query: Tensor,
    key: Tensor,
    value: Tensor,
    out: Tensor,
    think: Tensor,
    up: Tensor,
    down: Tensor,
}

pub struct Net {
    pub shape: Shape,
    pub vars: Vec<(String, Var)>,
    embed: Tensor,
    layers: Vec<Layer>,
    norm: Tensor,
    head: Tensor,
    cos: Tensor,
    sin: Tensor,
    device: Device,
}

enum Source<'a> {
    Fresh(Rng),
    Saved(&'a HashMap<String, Tensor>),
}

impl Source<'_> {
    fn take(
        &mut self,
        vars: &mut Vec<(String, Var)>,
        name: String,
        dims: &[usize],
        std: f32,
        device: &Device,
    ) -> Result<Tensor> {
        let tensor = match self {
            Source::Fresh(rng) => {
                let count = dims.iter().product();
                let data = if std == 0.0 {
                    vec![1.0; count]
                } else {
                    (0..count).map(|_| rng.normal() * std).collect()
                };

                Tensor::from_vec(data, dims, device)?
            }
            Source::Saved(map) => {
                let saved = map.get(&name).ok_or_else(|| anyhow!("missing {name}"))?;

                if saved.dims() != dims {
                    return Err(anyhow!("{name} has shape {:?}", saved.dims()));
                }

                saved.to_device(device)?
            }
        };
        let var = Var::from_tensor(&tensor)?;
        let out = var.as_tensor().clone();

        vars.push((name, var));

        Ok(out)
    }
}

fn lin(x: &Tensor, w: &Tensor) -> Result<Tensor> {
    let mut dims = x.dims().to_vec();
    let input = dims.pop().unwrap_or(1);
    let rows: usize = dims.iter().product();

    dims.push(w.dim(0)?);

    Ok(x.reshape((rows, input))?.matmul(&w.t()?)?.reshape(dims)?)
}

fn rms_norm(x: &Tensor, weight: &Tensor) -> Result<Tensor> {
    let scale = (x.sqr()?.mean_keepdim(D::Minus1)? + EPS)?.sqrt()?.recip()?;

    Ok(x.broadcast_mul(&scale)?.broadcast_mul(weight)?)
}

impl Net {
    pub fn fresh(shape: Shape, seed: u64, device: &Device) -> Result<Self> {
        Self::build(shape, Source::Fresh(Rng::new(seed)), device)
    }

    pub fn load(path: &Path, device: &Device) -> Result<(Self, HashMap<String, String>)> {
        let map = candle_core::safetensors::load(path, &Device::Cpu)?;
        let file = std::fs::read(path)?;
        let meta = safetensors::SafeTensors::read_metadata(&file)?
            .1
            .metadata()
            .clone()
            .unwrap_or_default();
        let field = |key: &str| -> Result<usize> {
            meta.get(key)
                .ok_or_else(|| anyhow!("missing {key}"))?
                .parse()
                .map_err(|_| anyhow!("bad {key}"))
        };
        let shape = Shape {
            layers: field("layers")?,
            width: field("width")?,
            heads: field("heads")?,
        };

        Ok((Self::build(shape, Source::Saved(&map), device)?, meta))
    }

    fn build(shape: Shape, mut source: Source, device: &Device) -> Result<Self> {
        let w = shape.width;
        let mut vars = Vec::new();
        let std = 1.0 / (w as f32).sqrt();
        let deep = std / (2.0 * shape.layers as f32).sqrt();
        let embed = source.take(&mut vars, "embed".into(), &[VOCAB, w], 1.0, device)?;
        let mut layers = Vec::with_capacity(shape.layers);

        for i in 0..shape.layers {
            let mut take = |part: &str, dims: &[usize], std: f32| {
                source.take(&mut vars, format!("layers.{i}.{part}"), dims, std, device)
            };

            layers.push(Layer {
                attend: take("attend", &[w], 0.0)?,
                query: take("query", &[w, w], std)?,
                key: take("key", &[w, w], std)?,
                value: take("value", &[w, w], std)?,
                out: take("out", &[w, w], deep)?,
                think: take("think", &[w], 0.0)?,
                up: take("up", &[4 * w, w], std)?,
                down: take("down", &[w, 4 * w], deep / 2.0)?,
            });
        }

        let norm = source.take(&mut vars, "norm".into(), &[w], 0.0, device)?;
        let head = source.take(&mut vars, "head".into(), &[CUPS, w], std, device)?;
        let (cos, sin) = rope(shape.head_width(), device)?;

        Ok(Self {
            shape,
            vars,
            embed,
            layers,
            norm,
            head,
            cos,
            sin,
            device: device.clone(),
        })
    }

    pub fn device(&self) -> &Device {
        &self.device
    }

    pub fn rounded(&self) -> Result<Self> {
        let map: HashMap<String, Tensor> = self
            .vars
            .iter()
            .map(|(name, var)| {
                let t = var.as_tensor().to_dtype(DType::F16)?.to_dtype(DType::F32)?;

                Ok((name.clone(), t))
            })
            .collect::<Result<_>>()?;

        Self::build(self.shape, Source::Saved(&map), &self.device)
    }

    pub fn save(&self, path: &Path, meta: &HashMap<String, String>, dtype: DType) -> Result<()> {
        let mut meta = meta.clone();

        meta.insert("layers".into(), self.shape.layers.to_string());
        meta.insert("width".into(), self.shape.width.to_string());
        meta.insert("heads".into(), self.shape.heads.to_string());
        meta.insert("vocab".into(), VOCAB.to_string());

        let tensors: Vec<(String, Tensor)> = self
            .vars
            .iter()
            .map(|(name, var)| {
                let t = var.as_tensor().to_device(&Device::Cpu)?.to_dtype(dtype)?;

                Ok((name.clone(), t))
            })
            .collect::<Result<_>>()?;

        safetensors::serialize_to_file(
            tensors.iter().map(|(n, t)| (n.as_str(), t)),
            Some(meta),
            path,
        )?;

        Ok(())
    }

    pub fn forward(&self, tokens: &Tensor) -> Result<Tensor> {
        let (batch, time) = tokens.dims2()?;
        let w = self.shape.width;
        let heads = self.shape.heads;
        let hw = self.shape.head_width();
        let scale = 1.0 / (hw as f64).sqrt();
        let mask = causal(time, &self.device)?;
        let cos = self.cos.narrow(0, 0, time)?;
        let sin = self.sin.narrow(0, 0, time)?;
        let split = |t: Tensor| -> Result<Tensor> {
            Ok(t.reshape((batch, time, heads, hw))?
                .transpose(1, 2)?
                .contiguous()?)
        };
        let mut x = self
            .embed
            .index_select(&tokens.flatten_all()?, 0)?
            .reshape((batch, time, w))?;

        for layer in &self.layers {
            let h = rms_norm(&x, &layer.attend)?;
            let q = turn(&split(lin(&h, &layer.query)?)?, &cos, &sin)?;
            let k = turn(&split(lin(&h, &layer.key)?)?, &cos, &sin)?;
            let v = split(lin(&h, &layer.value)?)?;
            let scores = (q.matmul(&k.t()?.contiguous()?)? * scale)?.broadcast_add(&mask)?;
            let mixed = softmax(&scores, D::Minus1)?.matmul(&v)?;
            let mixed = mixed
                .transpose(1, 2)?
                .contiguous()?
                .reshape((batch, time, w))?;

            x = (x + lin(&mixed, &layer.out)?)?;

            let h = rms_norm(&x, &layer.think)?;

            x = (x + lin(&lin(&h, &layer.up)?.gelu()?, &layer.down)?)?;
        }

        lin(&rms_norm(&x, &self.norm)?, &self.head)
    }

    pub fn loss(&self, tokens: &Tensor, onehot: &Tensor, count: f32) -> Result<Tensor> {
        let logp = log_softmax(&self.forward(tokens)?, D::Minus1)?;

        Ok(((logp * onehot)?.sum_all()? * (-1.0 / count as f64))?)
    }
}

fn rope(dim: usize, device: &Device) -> Result<(Tensor, Tensor)> {
    let half = dim / 2;
    let mut cos = Vec::with_capacity(LONGEST * half);
    let mut sin = Vec::with_capacity(LONGEST * half);

    for position in 0..LONGEST {
        for i in 0..half {
            let angle = position as f32 / ROPE_BASE.powf(i as f32 / half as f32);

            cos.push(angle.cos());
            sin.push(angle.sin());
        }
    }

    Ok((
        Tensor::from_vec(cos, (LONGEST, half), device)?,
        Tensor::from_vec(sin, (LONGEST, half), device)?,
    ))
}

fn turn(x: &Tensor, cos: &Tensor, sin: &Tensor) -> Result<Tensor> {
    let half = x.dim(D::Minus1)? / 2;
    let a = x.narrow(D::Minus1, 0, half)?;
    let b = x.narrow(D::Minus1, half, half)?;
    let ta = (a.broadcast_mul(cos)? - b.broadcast_mul(sin)?)?;
    let tb = (a.broadcast_mul(sin)? + b.broadcast_mul(cos)?)?;

    Ok(Tensor::cat(&[&ta, &tb], D::Minus1)?)
}

fn causal(time: usize, device: &Device) -> Result<Tensor> {
    let data: Vec<f32> = (0..time * time)
        .map(|i| if i % time > i / time { MASKED } else { 0.0 })
        .collect();

    Ok(Tensor::from_vec(data, (time, time), device)?)
}
