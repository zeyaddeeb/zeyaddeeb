use anyhow::Result;

use super::{ConvShape, Scope};
use crate::net::conv::{DepthwiseConv, PaddedConv, Padding};
use crate::net::mlp::SiluMlp;
use crate::net::norm::ChannelNorm;
use crate::settings::{StageSettings, VoiceprintSettings};
use crate::voiceprint::blocks::{GatedBlock, NormedConv, Recalibration, Stage};
use crate::voiceprint::features::Features;
use crate::voiceprint::pooling::AttentivePool;
use crate::voiceprint::VoiceprintEncoder;

const STEM_KERNEL: usize = 5;
const ENTRY_KERNEL: usize = 3;
const NORM_EPS: f64 = 1e-5;
const MIN_SQUEEZED: usize = 8;

pub fn assemble(root: &Scope<'_>, settings: &VoiceprintSettings) -> Result<VoiceprintEncoder> {
    let fused = settings.fused_width();
    let scales: usize = settings.stages.iter().map(|stage| stage.width).sum();
    let stem = root.at("stem");
    let fuse = root.at("fuse");
    let pool = root.at("id_pool").at("attn");
    let hidden = settings.attention_hidden;
    let head = |name: &str, inputs: usize, hidden: usize, outputs: usize| -> Result<SiluMlp> {
        let scope = root.at(name);
        Ok(SiluMlp::new(
            scope.dense("0", inputs, hidden)?,
            scope.dense("3", hidden, outputs)?,
        ))
    };
    Ok(VoiceprintEncoder {
        features: Features::new(settings),
        stem: NormedConv {
            conv: PaddedConv::new(
                stem.at("0").conv(
                    "conv",
                    ConvShape::new(settings.mel_bins, settings.stem_width, STEM_KERNEL),
                )?,
                Padding::centered(STEM_KERNEL - 1),
            ),
            norm: norm(&stem, "1", settings.stem_width)?,
        },
        stages: stages(root, settings)?,
        fuse: NormedConv {
            conv: PaddedConv::new(
                fuse.conv("0", ConvShape::new(scales, fused, 1))?,
                Padding::NONE,
            ),
            norm: norm(&fuse, "1", fused)?,
        },
        identity_pool: AttentivePool {
            score: pool.conv("0", ConvShape::new(fused, hidden, 1))?,
            weigh: pool.conv("2", ConvShape::new(hidden, 1, 1))?,
        },
        identity_head: head(
            "id_head",
            2 * fused,
            settings.identity_hidden,
            settings.identity_width,
        )?,
        style_head: head(
            "style_head",
            4 * fused,
            settings.style_hidden,
            settings.style_width,
        )?,
        control_head: head(
            "style_ctrl_head",
            4 * fused,
            settings.style_hidden,
            settings.control_width,
        )?,
    })
}

fn norm(scope: &Scope<'_>, name: &str, width: usize) -> Result<ChannelNorm> {
    ChannelNorm::new(scope.affine(name, width)?, NORM_EPS)
}

fn stages(root: &Scope<'_>, settings: &VoiceprintSettings) -> Result<Vec<Stage>> {
    let mut inputs = settings.stem_width;
    let mut stages = Vec::with_capacity(settings.stages.len());
    for (index, stage) in settings.stages.iter().enumerate() {
        let entry = root.at("transitions").at(index);
        let blocks = root.at("stages").at(index);
        let shape = ConvShape::new(inputs, stage.width, ENTRY_KERNEL).stride(stage.stride);
        stages.push(Stage {
            entry: NormedConv {
                conv: PaddedConv::new(
                    entry.conv("conv", shape)?,
                    Padding::centered(ENTRY_KERNEL - 1),
                ),
                norm: norm(&entry, "norm", stage.width)?,
            },
            blocks: stage
                .dilations
                .iter()
                .enumerate()
                .map(|(block, &dilation)| gated_block(&blocks.at(block), stage, dilation, settings))
                .collect::<Result<_>>()?,
        });
        inputs = stage.width;
    }
    Ok(stages)
}

fn gated_block(
    scope: &Scope<'_>,
    stage: &StageSettings,
    dilation: usize,
    settings: &VoiceprintSettings,
) -> Result<GatedBlock> {
    let width = stage.width;
    let squeezed = (width / settings.squeeze).max(MIN_SQUEEZED);
    let depthwise = scope.at("dw").at("conv");
    let recalibrate = scope.at("se").at("net");
    Ok(GatedBlock {
        entry_norm: norm(scope, "norm1", width)?,
        expand: scope.conv("pw_in", ConvShape::new(width, 2 * width, 1))?,
        depthwise: DepthwiseConv::new(
            &depthwise.tensor("weight", (width, 1, settings.kernel))?,
            &depthwise.tensor("bias", width)?,
            dilation,
            Padding::centered(DepthwiseConv::span(settings.kernel, dilation)),
        )?,
        inner_norm: norm(scope, "norm2", width)?,
        recalibrate: Recalibration {
            squeeze: recalibrate.conv("1", ConvShape::new(width, squeezed, 1))?,
            excite: recalibrate.conv("3", ConvShape::new(squeezed, width, 1))?,
        },
        project: scope.conv("pw_out", ConvShape::new(width, width, 1))?,
    })
}
