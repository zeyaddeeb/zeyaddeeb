use anyhow::{ensure, Result};

use super::{ConvShape, Scope};
use crate::net::conv::{DepthwiseConv, PaddedConv, Padding};
use crate::net::norm::LayerNorm;
use crate::settings::{Settings, VocoderSettings};
use crate::signal::inverse::Istft;
use crate::vocoder::backbone::{Backbone, RefineBlock};
use crate::vocoder::head::WaveHead;
use crate::vocoder::{analysis, Vocoder};

const KERNEL: usize = 7;
const NORM_EPS: f64 = 1e-6;

pub fn assemble(root: &Scope<'_>, settings: &Settings) -> Result<Vocoder> {
    let vocoder = &settings.vocoder;
    let mut lookaheads = vocoder
        .block_lookaheads
        .iter()
        .chain([&vocoder.stem_lookahead]);
    ensure!(
        lookaheads.all(|lookahead| *lookahead < KERNEL),
        "vocoder lookahead does not fit its kernel"
    );
    let backbone = root.at("backbone");
    let blocks = backbone.at("convnext");
    let stem_shape = ConvShape::new(vocoder.mel_bins, vocoder.width, KERNEL);
    Ok(Vocoder {
        analysis: analysis(settings),
        backbone: Backbone {
            stem: PaddedConv::new(
                backbone.conv("embed", stem_shape)?,
                Padding::with_lookahead(KERNEL - 1, vocoder.stem_lookahead),
            ),
            stem_norm: norm(&backbone, "norm", vocoder.width)?,
            blocks: vocoder
                .block_lookaheads
                .iter()
                .enumerate()
                .map(|(index, &lookahead)| block(&blocks.at(index), vocoder, lookahead))
                .collect::<Result<_>>()?,
            final_norm: norm(&backbone, "final_layer_norm", vocoder.width)?,
        },
        head: WaveHead {
            projection: root
                .at("head")
                .dense("out", vocoder.width, vocoder.fft_size + 2)?,
            istft: Istft::new(vocoder.fft_size, vocoder.hop),
            log_ceiling: vocoder.max_magnitude.ln() as f32,
        },
        hop: vocoder.hop,
    })
}

fn norm(scope: &Scope<'_>, name: &str, width: usize) -> Result<LayerNorm> {
    Ok(LayerNorm::new(scope.affine(name, width)?, NORM_EPS))
}

fn block(scope: &Scope<'_>, vocoder: &VocoderSettings, lookahead: usize) -> Result<RefineBlock> {
    let width = vocoder.width;
    let depthwise = scope.at("dwconv");
    Ok(RefineBlock {
        depthwise: DepthwiseConv::new(
            &depthwise.tensor("weight", (width, 1, KERNEL))?,
            &depthwise.tensor("bias", width)?,
            1,
            Padding::with_lookahead(KERNEL - 1, lookahead),
        )?,
        norm: norm(scope, "norm", width)?,
        expand: scope.dense("pwconv1", width, vocoder.expansion)?,
        contract: scope.dense("pwconv2", vocoder.expansion, width)?,
        gain: scope.tensor("gamma", width)?,
    })
}
