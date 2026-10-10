use anyhow::Result;

use super::{ConvShape, Scope};
use crate::acoustics::block::{Exit, FlowBlock, FrameAttention};
use crate::acoustics::embed::{FrameEmbedder, POSITION_GROUPS};
use crate::acoustics::guide::{Guide, Peek, Stretch};
use crate::acoustics::schedule::Clock;
use crate::acoustics::AcousticModel;
use crate::net::conv::{PaddedConv, Padding};
use crate::net::mlp::SiluMlp;
use crate::settings::{AcousticSettings, Settings};

const SETTLE_KERNEL: usize = 3;

pub fn assemble(root: &Scope<'_>, settings: &Settings) -> Result<AcousticModel> {
    let acoustics = &settings.acoustics;
    let head = root.at("acoustic_head");
    let (width, condition) = (acoustics.width, acoustics.condition_width);
    let blocks = head.at("blocks");
    Ok(AcousticModel {
        settings: acoustics.clone(),
        condition: mlp(
            &root.at("cond_proj"),
            ["0", "3"],
            [acoustics.voiceprint_width, condition, condition],
        )?,
        speaker: head.dense("spk_proj", condition, acoustics.speaker_width)?,
        guide: guide(&head, acoustics)?,
        clock: Clock {
            width: acoustics.time_width,
            mlp: mlp(
                &head.at("time_mlp"),
                ["0", "2"],
                [acoustics.time_width, width, width],
            )?,
        },
        embedder: embedder(&head.at("input_embed"), acoustics)?,
        blocks: (0..acoustics.depth)
            .map(|index| block(&blocks.at(index), acoustics))
            .collect::<Result<_>>()?,
        exit: Exit {
            modulation: head.at("out_norm").at("mod").dense("1", width, 2 * width)?,
            projection: head.dense("out_proj", width, acoustics.mel_bins)?,
        },
    })
}

fn mlp(scope: &Scope<'_>, names: [&str; 2], widths: [usize; 3]) -> Result<SiluMlp> {
    Ok(SiluMlp::new(
        scope.dense(names[0], widths[0], widths[1])?,
        scope.dense(names[1], widths[1], widths[2])?,
    ))
}

fn guide(head: &Scope<'_>, acoustics: &AcousticSettings) -> Result<Guide> {
    let width = acoustics.unit_width;
    let peek = head.at("semantic_prelook");
    let stretch = head.at("semantic_upsampler");
    let wide = |kernel: usize| ConvShape::new(width, width, kernel);
    let smooth = stretch
        .at("mix")
        .conv("conv", wide(acoustics.smoothing_kernel))?;
    Ok(Guide {
        units: head.table("semantic_token_emb", acoustics.unit_count, width)?,
        peek: Peek {
            ahead: PaddedConv::new(
                peek.conv("conv1", wide(acoustics.lookahead + 1))?,
                Padding::with_lookahead(acoustics.lookahead, acoustics.lookahead),
            ),
            settle: PaddedConv::new(
                peek.conv("conv2", wide(SETTLE_KERNEL))?,
                Padding::past_only(SETTLE_KERNEL - 1),
            ),
        },
        stretch: Stretch {
            enter: stretch.conv("in_proj", wide(1))?,
            smooth: PaddedConv::new(smooth, Padding::past_only(acoustics.smoothing_kernel - 1)),
            leave: stretch.conv("out_proj", wide(1))?,
        },
        projection: head.conv("mu_proj", ConvShape::new(width, acoustics.guide_width, 1))?,
    })
}

fn embedder(scope: &Scope<'_>, acoustics: &AcousticSettings) -> Result<FrameEmbedder> {
    let width = acoustics.width;
    let inputs = 2 * acoustics.mel_bins + acoustics.guide_width + acoustics.speaker_width;
    let kernel = acoustics.position_kernel;
    let positions = scope.at("pos");
    let position = |name: &str| -> Result<PaddedConv> {
        let shape = ConvShape::new(width, width, kernel).groups(POSITION_GROUPS);
        Ok(PaddedConv::new(
            positions.conv(name, shape)?,
            Padding::past_only(kernel - 1),
        ))
    };
    let flag = scope.at("cond_mask_proj").tensor("weight", (width, 1))?;
    Ok(FrameEmbedder {
        projection: scope.dense("proj", inputs, width)?,
        prompt_flag: flag.reshape(width)?,
        positions: [position("conv1")?, position("conv2")?],
    })
}

fn block(scope: &Scope<'_>, acoustics: &AcousticSettings) -> Result<FlowBlock> {
    let width = acoustics.width;
    let inner = acoustics.heads * acoustics.head_width;
    let attention = scope.at("attn");
    let feedforward = scope.at("ff");
    Ok(FlowBlock {
        modulation: scope
            .at("attn_norm")
            .at("mod")
            .dense("1", width, 6 * width)?,
        attention: FrameAttention {
            heads: acoustics.heads,
            query: attention.dense("to_q", width, inner)?,
            key: attention.dense("to_k", width, inner)?,
            value: attention.dense("to_v", width, inner)?,
            output: attention.at("to_out").dense("0", inner, width)?,
        },
        expand: feedforward.dense("0", width, acoustics.feedforward)?,
        contract: feedforward.dense("3", acoustics.feedforward, width)?,
    })
}
