use std::path::Path;

use anyhow::{ensure, Context, Error, Result};
use serde::Deserialize;

use super::{
    AcousticSettings, PlannerSettings, Settings, SpeechSettings, StageSettings, UnitSettings,
    VocoderSettings, VoiceprintSettings,
};

const FILE_NAME: &str = "config.json";
const SYMMETRIC_LOOKAHEAD: usize = 3;

pub fn read(dir: &Path) -> Result<ConfigFile> {
    let path = dir.join(FILE_NAME);
    let text =
        std::fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    parse(&text).with_context(|| format!("parsing {}", path.display()))
}

pub fn parse(json: &str) -> Result<ConfigFile> {
    Ok(serde_json::from_str(json)?)
}

#[derive(Deserialize)]
#[serde(default)]
pub struct ConfigFile {
    sample_rate: u32,
    model: ModelSection,
    semantic_encoder: SemanticEncoderSection,
    speaker_encoder: SpeakerEncoderSection,
    vocoder: VocoderSection,
    generation: GenerationSection,
}

impl Default for ConfigFile {
    fn default() -> Self {
        Self {
            sample_rate: 24_000,
            model: ModelSection::default(),
            semantic_encoder: SemanticEncoderSection::default(),
            speaker_encoder: SpeakerEncoderSection::default(),
            vocoder: VocoderSection::default(),
            generation: GenerationSection::default(),
        }
    }
}

#[derive(Deserialize)]
#[serde(default)]
struct ModelSection {
    latent_dim: usize,
    semantic_vocab_size: usize,
    text_vocab_size: usize,
    max_text_len: usize,
    cond_in_dim: usize,
    cond_hidden_dim: usize,
    ar_model_dim: usize,
    ar_blocks: usize,
    ar_heads: usize,
    ar_kv_heads: Option<usize>,
    ar_ffn_mult: f64,
    ar_qk_rms_norm: bool,
    style_prefix_tokens: usize,
    acoustic_time_embed_dim: usize,
    acoustic_sway_sampling_coef: f32,
    acoustic_upsampler_kernel_size: usize,
    acoustic_dit_dim: usize,
    acoustic_dit_depth: usize,
    acoustic_dit_heads: usize,
    acoustic_dit_dim_head: usize,
    acoustic_dit_ff_mult: f64,
    acoustic_mu_dim: Option<usize>,
    acoustic_spk_dim: usize,
    acoustic_pre_lookahead_frames: usize,
    acoustic_pos_kernel_size: usize,
    acoustic_sigma_min: f32,
    acoustic_mel_n_mels: usize,
    acoustic_mel_hop_length: usize,
    acoustic_mel_mean: Option<Vec<f32>>,
    acoustic_mel_std: Option<Vec<f32>>,
}

impl Default for ModelSection {
    fn default() -> Self {
        Self {
            latent_dim: 1280,
            semantic_vocab_size: 4375,
            text_vocab_size: 8192,
            max_text_len: 2048,
            cond_in_dim: 328,
            cond_hidden_dim: 512,
            ar_model_dim: 512,
            ar_blocks: 12,
            ar_heads: 8,
            ar_kv_heads: None,
            ar_ffn_mult: 4.0,
            ar_qk_rms_norm: true,
            style_prefix_tokens: 8,
            acoustic_time_embed_dim: 256,
            acoustic_sway_sampling_coef: -1.0,
            acoustic_upsampler_kernel_size: 3,
            acoustic_dit_dim: 512,
            acoustic_dit_depth: 8,
            acoustic_dit_heads: 8,
            acoustic_dit_dim_head: 64,
            acoustic_dit_ff_mult: 2.0,
            acoustic_mu_dim: None,
            acoustic_spk_dim: 80,
            acoustic_pre_lookahead_frames: 3,
            acoustic_pos_kernel_size: 31,
            acoustic_sigma_min: 1.0e-6,
            acoustic_mel_n_mels: 100,
            acoustic_mel_hop_length: 256,
            acoustic_mel_mean: None,
            acoustic_mel_std: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(default)]
struct SemanticEncoderSection {
    n_mels: usize,
    d_model: usize,
    layers: usize,
    heads: usize,
    ffn_dim: usize,
    max_positions: usize,
    fsq_levels: Vec<usize>,
    sample_rate: u32,
    n_fft: usize,
    hop_length: usize,
    token_samples_24k: usize,
}

impl Default for SemanticEncoderSection {
    fn default() -> Self {
        Self {
            n_mels: 80,
            d_model: 512,
            layers: 6,
            heads: 8,
            ffn_dim: 2048,
            max_positions: 1500,
            fsq_levels: vec![7, 5, 5, 5, 5],
            sample_rate: 16_000,
            n_fft: 400,
            hop_length: 160,
            token_samples_24k: 1024,
        }
    }
}

#[derive(Deserialize)]
#[serde(default)]
struct SpeakerEncoderSection {
    sample_rate: u32,
    n_mels: usize,
    n_fft: usize,
    win_length: usize,
    hop_length: usize,
    f_min: f64,
    f_max: f64,
    mel_log_floor: f64,
    stem_channels: usize,
    stage_channels: Vec<usize>,
    blocks_per_stage: Vec<usize>,
    dilation_cycle: Vec<usize>,
    depthwise_kernel_size: usize,
    se_reduction: usize,
    id_emb_dim: usize,
    style_emb_dim: usize,
    style_ctrl_dim: usize,
    id_head_hidden: usize,
    style_head_hidden: usize,
    attn_hidden: usize,
}

impl Default for SpeakerEncoderSection {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            n_mels: 80,
            n_fft: 1024,
            win_length: 400,
            hop_length: 160,
            f_min: 20.0,
            f_max: 7600.0,
            mel_log_floor: 1e-5,
            stem_channels: 128,
            stage_channels: vec![160, 192, 224],
            blocks_per_stage: vec![4, 4, 4],
            dilation_cycle: vec![1, 2, 4, 8],
            depthwise_kernel_size: 5,
            se_reduction: 8,
            id_emb_dim: 192,
            style_emb_dim: 128,
            style_ctrl_dim: 8,
            id_head_hidden: 256,
            style_head_hidden: 256,
            attn_hidden: 128,
        }
    }
}

#[derive(Deserialize)]
#[serde(default)]
struct VocoderSection {
    sample_rate: u32,
    n_fft: usize,
    hop_length: usize,
    n_mels: usize,
    dim: usize,
    intermediate_dim: usize,
    num_layers: usize,
    max_magnitude: f64,
    causal: bool,
    lookahead_frames: usize,
    block_lookaheads: Option<Vec<usize>>,
}

impl Default for VocoderSection {
    fn default() -> Self {
        Self {
            sample_rate: 24_000,
            n_fft: 1024,
            hop_length: 256,
            n_mels: 100,
            dim: 512,
            intermediate_dim: 1536,
            num_layers: 8,
            max_magnitude: 100.0,
            causal: true,
            lookahead_frames: 3,
            block_lookaheads: Some(vec![3; 8]),
        }
    }
}

#[derive(Deserialize)]
#[serde(default)]
struct GenerationSection {
    temperature: f32,
    top_p: f32,
    top_k: usize,
    steps: usize,
    max_seconds: f64,
    min_seconds: f64,
    max_segment_chars: usize,
    ref_seconds: f64,
    style_tokens: usize,
    prompt_tokens: usize,
}

impl Default for GenerationSection {
    fn default() -> Self {
        Self {
            temperature: 0.8,
            top_p: 0.9,
            top_k: 25,
            steps: 2,
            max_seconds: 30.0,
            min_seconds: 0.4,
            max_segment_chars: 300,
            ref_seconds: 15.0,
            style_tokens: 160,
            prompt_tokens: 120,
        }
    }
}

impl TryFrom<ConfigFile> for Settings {
    type Error = Error;

    fn try_from(file: ConfigFile) -> Result<Self> {
        ensure!(
            file.sample_rate == file.vocoder.sample_rate,
            "model and vocoder sample rates differ"
        );
        ensure!(
            file.model.acoustic_mel_hop_length == file.vocoder.hop_length,
            "acoustic and vocoder hops differ"
        );
        ensure!(
            file.model.acoustic_mel_n_mels == file.vocoder.n_mels,
            "acoustic and vocoder mel sizes differ"
        );
        let unit_samples = file.semantic_encoder.token_samples_24k;
        let frames_per_unit = unit_samples / file.vocoder.hop_length.max(1);
        ensure!(frames_per_unit > 0, "a unit is shorter than one mel frame");
        let voiceprint = voiceprint(file.speaker_encoder);
        ensure!(
            voiceprint.total_width() == file.model.cond_in_dim,
            "voiceprint size does not match the conditioning input"
        );
        Ok(Self {
            sample_rate: file.sample_rate,
            unit_samples,
            frames_per_unit,
            planner: planner(&file.model)?,
            acoustics: acoustics(&file.model)?,
            units: units(file.semantic_encoder),
            voiceprint,
            vocoder: vocoder(file.vocoder)?,
            speech: speech(file.generation),
        })
    }
}

fn scaled(width: usize, ratio: f64) -> usize {
    ((ratio * width as f64).round() as usize).max(1)
}

fn planner(model: &ModelSection) -> Result<PlannerSettings> {
    ensure!(
        model.ar_kv_heads.unwrap_or(model.ar_heads) == model.ar_heads,
        "grouped key/value heads are not supported"
    );
    ensure!(
        model.ar_qk_rms_norm,
        "planners without query/key normalization are not supported"
    );
    ensure!(
        model.ar_heads > 0 && model.ar_model_dim.is_multiple_of(model.ar_heads),
        "planner width must divide evenly into heads"
    );
    Ok(PlannerSettings {
        width: model.ar_model_dim,
        depth: model.ar_blocks,
        heads: model.ar_heads,
        feedforward: scaled(model.ar_model_dim, model.ar_ffn_mult),
        unit_count: model.semantic_vocab_size,
        unit_width: model.latent_dim,
        piece_count: model.text_vocab_size,
        max_pieces: model.max_text_len,
        style_slots: model.style_prefix_tokens,
    })
}

fn acoustics(model: &ModelSection) -> Result<AcousticSettings> {
    let mel_bins = model.acoustic_mel_n_mels;
    let mel_mean = model
        .acoustic_mel_mean
        .clone()
        .context("config is missing acoustic_mel_mean")?;
    let mel_std = model
        .acoustic_mel_std
        .clone()
        .context("config is missing acoustic_mel_std")?;
    ensure!(
        mel_mean.len() == mel_bins && mel_std.len() == mel_bins,
        "mel statistics do not match acoustic_mel_n_mels"
    );
    Ok(AcousticSettings {
        mel_bins,
        unit_count: model.semantic_vocab_size,
        unit_width: model.latent_dim,
        width: model.acoustic_dit_dim,
        depth: model.acoustic_dit_depth,
        heads: model.acoustic_dit_heads,
        head_width: model.acoustic_dit_dim_head,
        feedforward: scaled(model.acoustic_dit_dim, model.acoustic_dit_ff_mult),
        time_width: model.acoustic_time_embed_dim,
        guide_width: model.acoustic_mu_dim.unwrap_or(mel_bins),
        voiceprint_width: model.cond_in_dim,
        condition_width: model.cond_hidden_dim,
        speaker_width: model.acoustic_spk_dim,
        lookahead: model.acoustic_pre_lookahead_frames,
        smoothing_kernel: model.acoustic_upsampler_kernel_size,
        position_kernel: model.acoustic_pos_kernel_size,
        sway: model.acoustic_sway_sampling_coef,
        sigma_min: model.acoustic_sigma_min,
        mel_mean,
        mel_std,
    })
}

fn units(section: SemanticEncoderSection) -> UnitSettings {
    UnitSettings {
        sample_rate: section.sample_rate,
        mel_bins: section.n_mels,
        fft_size: section.n_fft,
        hop: section.hop_length,
        width: section.d_model,
        depth: section.layers,
        heads: section.heads,
        feedforward: section.ffn_dim,
        max_positions: section.max_positions,
        levels: section.fsq_levels,
    }
}

fn voiceprint(section: SpeakerEncoderSection) -> VoiceprintSettings {
    let stages = section
        .stage_channels
        .iter()
        .zip(&section.blocks_per_stage)
        .enumerate()
        .map(|(index, (&width, &blocks))| StageSettings {
            width,
            stride: if index == 0 { 2 } else { 1 },
            dilations: section
                .dilation_cycle
                .iter()
                .copied()
                .cycle()
                .take(blocks)
                .collect(),
        })
        .collect();
    VoiceprintSettings {
        sample_rate: section.sample_rate,
        mel_bins: section.n_mels,
        fft_size: section.n_fft,
        window: section.win_length,
        hop: section.hop_length,
        low_hz: section.f_min,
        high_hz: section.f_max,
        log_floor: section.mel_log_floor,
        stem_width: section.stem_channels,
        stages,
        kernel: section.depthwise_kernel_size,
        squeeze: section.se_reduction,
        identity_width: section.id_emb_dim,
        style_width: section.style_emb_dim,
        control_width: section.style_ctrl_dim,
        identity_hidden: section.id_head_hidden,
        style_hidden: section.style_head_hidden,
        attention_hidden: section.attn_hidden,
    }
}

fn vocoder(section: VocoderSection) -> Result<VocoderSettings> {
    let depth = section.num_layers;
    let (stem_lookahead, block_lookaheads) = if section.causal {
        let listed = section.block_lookaheads.filter(|list| !list.is_empty());
        (
            section.lookahead_frames,
            listed.unwrap_or_else(|| vec![0; depth]),
        )
    } else {
        (SYMMETRIC_LOOKAHEAD, vec![SYMMETRIC_LOOKAHEAD; depth])
    };
    ensure!(
        block_lookaheads.len() == depth,
        "vocoder lookaheads do not match its depth"
    );
    Ok(VocoderSettings {
        fft_size: section.n_fft,
        hop: section.hop_length,
        mel_bins: section.n_mels,
        width: section.dim,
        expansion: section.intermediate_dim,
        max_magnitude: section.max_magnitude,
        stem_lookahead,
        block_lookaheads,
    })
}

fn speech(section: GenerationSection) -> SpeechSettings {
    SpeechSettings {
        temperature: section.temperature,
        top_p: section.top_p,
        top_k: section.top_k,
        flow_steps: section.steps,
        max_seconds: section.max_seconds,
        min_seconds: section.min_seconds,
        segment_chars: section.max_segment_chars,
        voice_seconds: section.ref_seconds,
        style_units: section.style_tokens,
        prompt_units: section.prompt_tokens,
    }
}
