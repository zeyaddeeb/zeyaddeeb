mod file;

use std::path::Path;

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Settings {
    pub sample_rate: u32,
    pub unit_samples: usize,
    pub frames_per_unit: usize,
    pub planner: PlannerSettings,
    pub acoustics: AcousticSettings,
    pub units: UnitSettings,
    pub voiceprint: VoiceprintSettings,
    pub vocoder: VocoderSettings,
    pub speech: SpeechSettings,
}

impl Settings {
    pub fn load(dir: &Path) -> Result<Self> {
        file::read(dir)?.try_into()
    }

    pub fn units_for(&self, seconds: f64) -> usize {
        let units = seconds * f64::from(self.sample_rate) / self.unit_samples as f64;
        (units.ceil() as usize).max(1)
    }
}

#[derive(Debug, Clone)]
pub struct PlannerSettings {
    pub width: usize,
    pub depth: usize,
    pub heads: usize,
    pub feedforward: usize,
    pub unit_count: usize,
    pub unit_width: usize,
    pub piece_count: usize,
    pub max_pieces: usize,
    pub style_slots: usize,
}

impl PlannerSettings {
    pub fn head_width(&self) -> usize {
        self.width / self.heads
    }

    pub fn start_id(&self) -> usize {
        self.unit_count
    }

    pub fn stop_id(&self) -> usize {
        self.unit_count + 1
    }

    pub fn vocabulary(&self) -> usize {
        self.unit_count + 2
    }
}

#[derive(Debug, Clone)]
pub struct AcousticSettings {
    pub mel_bins: usize,
    pub unit_count: usize,
    pub unit_width: usize,
    pub width: usize,
    pub depth: usize,
    pub heads: usize,
    pub head_width: usize,
    pub feedforward: usize,
    pub time_width: usize,
    pub guide_width: usize,
    pub voiceprint_width: usize,
    pub condition_width: usize,
    pub speaker_width: usize,
    pub lookahead: usize,
    pub smoothing_kernel: usize,
    pub position_kernel: usize,
    pub sway: f32,
    pub sigma_min: f32,
    pub mel_mean: Vec<f32>,
    pub mel_std: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct UnitSettings {
    pub sample_rate: u32,
    pub mel_bins: usize,
    pub fft_size: usize,
    pub hop: usize,
    pub width: usize,
    pub depth: usize,
    pub heads: usize,
    pub feedforward: usize,
    pub max_positions: usize,
    pub levels: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct VoiceprintSettings {
    pub sample_rate: u32,
    pub mel_bins: usize,
    pub fft_size: usize,
    pub window: usize,
    pub hop: usize,
    pub low_hz: f64,
    pub high_hz: f64,
    pub log_floor: f64,
    pub stem_width: usize,
    pub stages: Vec<StageSettings>,
    pub kernel: usize,
    pub squeeze: usize,
    pub identity_width: usize,
    pub style_width: usize,
    pub control_width: usize,
    pub identity_hidden: usize,
    pub style_hidden: usize,
    pub attention_hidden: usize,
}

impl VoiceprintSettings {
    pub fn fused_width(&self) -> usize {
        self.stages
            .last()
            .map_or(self.stem_width, |stage| stage.width)
    }

    pub fn total_width(&self) -> usize {
        self.identity_width + self.style_width + self.control_width
    }
}

#[derive(Debug, Clone)]
pub struct StageSettings {
    pub width: usize,
    pub stride: usize,
    pub dilations: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct VocoderSettings {
    pub fft_size: usize,
    pub hop: usize,
    pub mel_bins: usize,
    pub width: usize,
    pub expansion: usize,
    pub max_magnitude: f64,
    pub stem_lookahead: usize,
    pub block_lookaheads: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct SpeechSettings {
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: usize,
    pub flow_steps: usize,
    pub max_seconds: f64,
    pub min_seconds: f64,
    pub segment_chars: usize,
    pub voice_seconds: f64,
    pub style_units: usize,
    pub prompt_units: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> Result<Settings> {
        file::parse(json)?.try_into()
    }

    const STATISTICS: &str = r#""acoustic_mel_n_mels": 2, "acoustic_mel_mean": [0.0, 1.0], "acoustic_mel_std": [1.0, 2.0]"#;

    #[test]
    fn sparse_file_falls_back_to_format_defaults() {
        let settings = parse(&format!(
            r#"{{"model": {{{STATISTICS}}}, "vocoder": {{"n_mels": 2}}}}"#
        ))
        .unwrap();
        assert_eq!(settings.sample_rate, 24_000);
        assert_eq!(settings.unit_samples, 1024);
        assert_eq!(settings.frames_per_unit, 4);
        assert_eq!(settings.planner.head_width(), 64);
        assert_eq!(settings.planner.feedforward, 2048);
        assert_eq!(settings.planner.stop_id(), 4376);
        assert_eq!(settings.acoustics.voiceprint_width, 328);
        assert_eq!(settings.acoustics.guide_width, 2);
        assert_eq!(settings.acoustics.feedforward, 1024);
        assert_eq!(settings.speech.top_k, 25);
        assert_eq!(settings.speech.voice_seconds, 15.0);
        assert_eq!(settings.vocoder.block_lookaheads, vec![3; 8]);
        assert_eq!(settings.voiceprint.stages[0].stride, 2);
        assert_eq!(settings.voiceprint.stages[1].stride, 1);
        assert_eq!(settings.voiceprint.stages[2].dilations, [1, 2, 4, 8]);
        assert_eq!(settings.voiceprint.total_width(), 328);
    }

    #[test]
    fn file_values_win_and_unknown_keys_are_ignored() {
        let settings = parse(&format!(
            r#"{{"model": {{{STATISTICS}, "acoustic_sway_sampling_coef": 1.0, "acoustic_num_left_chunks": -1}},
                "vocoder": {{"n_mels": 2}},
                "generation": {{"ref_seconds": 10.0, "stream_chunk_frames": 64}}}}"#
        ))
        .unwrap();
        assert_eq!(settings.acoustics.sway, 1.0);
        assert_eq!(settings.speech.voice_seconds, 10.0);
        assert_eq!(settings.speech.flow_steps, 2);
    }

    #[test]
    fn missing_mel_statistics_are_rejected() {
        assert!(parse("{}").is_err());
    }

    #[test]
    fn unsupported_variants_are_rejected() {
        for extra in [r#""ar_kv_heads": 2"#, r#""ar_qk_rms_norm": false"#] {
            let json =
                format!(r#"{{"model": {{{STATISTICS}, {extra}}}, "vocoder": {{"n_mels": 2}}}}"#);
            assert!(parse(&json).is_err(), "{extra}");
        }
    }

    #[test]
    fn unit_budget_rounds_up() {
        let settings = parse(&format!(
            r#"{{"model": {{{STATISTICS}}}, "vocoder": {{"n_mels": 2}}}}"#
        ))
        .unwrap();
        assert_eq!(settings.units_for(30.0), 704);
        assert_eq!(settings.units_for(0.4), 10);
        assert_eq!(settings.units_for(0.0), 1);
    }

    #[test]
    fn parity_shipped_settings_load() {
        let Some(dir) = crate::testing::models_dir() else {
            return;
        };
        let settings = Settings::load(&dir).unwrap();
        assert_eq!(
            settings.acoustics.mel_mean.len(),
            settings.acoustics.mel_bins
        );
        assert_eq!(settings.planner.depth, 12);
        assert_eq!(settings.vocoder.block_lookaheads.len(), 8);
    }
}
