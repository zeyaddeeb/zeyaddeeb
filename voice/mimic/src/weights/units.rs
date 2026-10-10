use anyhow::Result;

use super::{ConvShape, Scope};
use crate::net::conv::{PaddedConv, Padding};
use crate::net::norm::LayerNorm;
use crate::settings::{Settings, UnitSettings};
use crate::units::encoder::{EncoderLayer, SelfAttention};
use crate::units::features::Features;
use crate::units::quantizer::Quantizer;
use crate::units::UnitEncoder;

const STEM_KERNEL: usize = 3;
const NORM_EPS: f64 = 1e-5;

pub fn assemble(root: &Scope<'_>, settings: &Settings) -> Result<UnitEncoder> {
    let units = &settings.units;
    let width = units.width;
    let stem = |name: &str, inputs: usize, stride: usize| -> Result<PaddedConv> {
        let shape = ConvShape::new(inputs, width, STEM_KERNEL).stride(stride);
        Ok(PaddedConv::new(
            root.conv(name, shape)?,
            Padding::centered(STEM_KERNEL - 1),
        ))
    };
    let layers = root.at("layers");
    Ok(UnitEncoder {
        features: Features::new(units),
        widen: stem("conv1", units.mel_bins, 1)?,
        halve: stem("conv2", width, 2)?,
        positions: root.tensor("pos_emb", (units.max_positions, width))?,
        layers: (0..units.depth)
            .map(|index| layer(&layers.at(index), units))
            .collect::<Result<_>>()?,
        final_norm: norm(root, "final_norm", width)?,
        quantizer: Quantizer {
            norm: norm(root, "pre_head_norm", width)?,
            head: root.dense("digit_head", width, units.levels.iter().sum())?,
            levels: units.levels.clone(),
        },
        source_rate: settings.sample_rate,
        unit_samples: settings.unit_samples,
    })
}

fn norm(scope: &Scope<'_>, name: &str, width: usize) -> Result<LayerNorm> {
    Ok(LayerNorm::new(scope.affine(name, width)?, NORM_EPS))
}

fn layer(scope: &Scope<'_>, units: &UnitSettings) -> Result<EncoderLayer> {
    let width = units.width;
    let attention = scope.at("self_attn");
    Ok(EncoderLayer {
        attention: SelfAttention {
            heads: units.heads,
            query: attention.dense("q_proj", width, width)?,
            key: attention.dense_no_bias("k_proj", width, width)?,
            value: attention.dense("v_proj", width, width)?,
            output: attention.dense("out_proj", width, width)?,
        },
        attention_norm: norm(scope, "self_attn_layer_norm", width)?,
        expand: scope.dense("fc1", width, units.feedforward)?,
        contract: scope.dense("fc2", units.feedforward, width)?,
        feedforward_norm: norm(scope, "final_layer_norm", width)?,
    })
}
