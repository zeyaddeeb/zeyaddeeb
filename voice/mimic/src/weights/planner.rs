use anyhow::Result;

use super::Scope;
use crate::net::norm::RmsNorm;
use crate::planner::block::{CachedAttention, GatedFeedForward, PlannerBlock};
use crate::planner::style::StyleReader;
use crate::planner::Planner;
use crate::settings::{PlannerSettings, Settings};

pub fn assemble(root: &Scope<'_>, settings: &Settings) -> Result<Planner> {
    let planner = &settings.planner;
    let width = planner.width;
    let core = root.at("ar_prior");
    let layers = core.at("temporal").at("layers");
    Ok(Planner {
        settings: planner.clone(),
        pieces: root.table("text_tok_emb", planner.piece_count, width)?,
        units: root.table("semantic_tok_emb", planner.vocabulary(), planner.unit_width)?,
        unit_projection: root.dense("sem_in_proj", planner.unit_width, width)?,
        style: style(&root.at("style_prefix"), planner)?,
        blocks: (0..planner.depth)
            .map(|index| block(&layers.at(index), planner))
            .collect::<Result<_>>()?,
        final_norm: rms(&core, "out_norm", width)?,
        head: core.dense("token_head", width, planner.vocabulary())?,
    })
}

fn rms(scope: &Scope<'_>, name: &str, width: usize) -> Result<RmsNorm> {
    Ok(RmsNorm::new(scope.at(name).tensor("weight", width)?))
}

fn block(scope: &Scope<'_>, planner: &PlannerSettings) -> Result<PlannerBlock> {
    let width = planner.width;
    let feedforward = scope.at("ffn");
    Ok(PlannerBlock {
        attention_norm: rms(scope, "attn_norm", width)?,
        attention: attention(&scope.at("attn"), planner)?,
        attention_gain: scope.at("attn_scale").tensor("scale", width)?,
        feedforward_norm: rms(scope, "ffn_norm", width)?,
        feedforward: GatedFeedForward {
            gate: feedforward.dense_no_bias("gate_proj", width, planner.feedforward)?,
            up: feedforward.dense_no_bias("up_proj", width, planner.feedforward)?,
            down: feedforward.dense_no_bias("down_proj", planner.feedforward, width)?,
        },
        feedforward_gain: scope.at("ffn_scale").tensor("scale", width)?,
    })
}

fn attention(scope: &Scope<'_>, planner: &PlannerSettings) -> Result<CachedAttention> {
    let width = planner.width;
    Ok(CachedAttention {
        heads: planner.heads,
        query: scope.dense_no_bias("q_proj", width, width)?,
        key: scope.dense_no_bias("k_proj", width, width)?,
        value: scope.dense_no_bias("v_proj", width, width)?,
        output: scope.dense_no_bias("out_proj", width, width)?,
        query_norm: rms(scope, "q_norm", planner.head_width())?,
        key_norm: rms(scope, "k_norm", planner.head_width())?,
    })
}

fn style(scope: &Scope<'_>, planner: &PlannerSettings) -> Result<StyleReader> {
    let width = planner.width;
    Ok(StyleReader {
        heads: planner.heads,
        slots: scope.tensor("queries", (planner.style_slots, width))?,
        memory_norm: rms(scope, "kv_norm", width)?,
        query: scope.dense_no_bias("q_proj", width, width)?,
        key: scope.dense_no_bias("k_proj", width, width)?,
        value: scope.dense_no_bias("v_proj", width, width)?,
        output: scope.dense_no_bias("out_proj", width, width)?,
        final_norm: rms(scope, "out_norm", width)?,
    })
}
