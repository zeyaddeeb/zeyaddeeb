pub mod blocks;
pub mod features;
pub mod pooling;

use anyhow::Result;
use candle_core::{Tensor, D};

use self::blocks::{NormedConv, Stage};
use self::features::Features;
use self::pooling::{spread_statistics, AttentivePool};
use crate::net::mlp::SiluMlp;

const UNIT_NORM_FLOOR: f64 = 1e-12;

pub struct Voiceprint {
    pub identity: Tensor,
    pub style: Tensor,
    pub control: Tensor,
}

impl Voiceprint {
    pub fn joined(&self) -> Result<Tensor> {
        Ok(Tensor::cat(
            &[&self.identity, &self.style, &self.control],
            D::Minus1,
        )?)
    }
}

pub struct VoiceprintEncoder {
    pub features: Features,
    pub stem: NormedConv,
    pub stages: Vec<Stage>,
    pub fuse: NormedConv,
    pub identity_pool: AttentivePool,
    pub identity_head: SiluMlp,
    pub style_head: SiluMlp,
    pub control_head: SiluMlp,
}

impl VoiceprintEncoder {
    pub fn min_samples(&self) -> usize {
        self.features.min_samples()
    }

    pub fn encode(&self, audio: &[f32]) -> Result<Voiceprint> {
        let fused = self.fused(&self.features.extract(audio)?)?;
        let identity = self
            .identity_head
            .forward(&self.identity_pool.forward(&fused)?)?;
        let spread = spread_statistics(&fused)?;
        Ok(Voiceprint {
            identity: unit_length(&identity)?,
            style: self.style_head.forward(&spread)?,
            control: self.control_head.forward(&spread)?,
        })
    }

    pub fn fused(&self, features: &Tensor) -> Result<Tensor> {
        let mut hidden = self.stem.forward(features)?;
        let mut scales = Vec::with_capacity(self.stages.len());
        for stage in &self.stages {
            hidden = stage.forward(&hidden)?;
            scales.push(hidden.clone());
        }
        self.fuse.forward(&Tensor::cat(&scales, 1)?)
    }
}

fn unit_length(xs: &Tensor) -> Result<Tensor> {
    let norm = xs.sqr()?.sum_keepdim(D::Minus1)?.sqrt()?;
    Ok(xs.broadcast_div(&norm.maximum(UNIT_NORM_FLOOR)?)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};
    use candle_core::Device;

    #[test]
    fn unit_length_scales_rows_to_norm_one() {
        let xs = Tensor::new(&[[3.0f32, 4.0], [0.0, 0.0]], &Device::Cpu).unwrap();
        let out = unit_length(&xs).unwrap().to_vec2::<f32>().unwrap();
        assert_eq!(out, [[0.6, 0.8], [0.0, 0.0]]);
    }

    #[test]
    fn parity_voiceprint_stages() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let encoder = &mimic.models.voiceprint;
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let audio = fixture.floats("voiceprint_audio");
            let features = encoder.features.extract(&audio).unwrap();
            let check = |label: &str, actual: &Tensor, key: &str, limit: f32| {
                let error = testing::compare_tensors(
                    &format!("{name} {label}"),
                    actual,
                    &fixture.tensor(key),
                );
                assert!(error.relative < limit, "{label}: {error:?}");
            };
            check(
                "voiceprint features",
                &features,
                "voiceprint_features",
                1e-4,
            );
            let reference = fixture.tensor("voiceprint_features");
            let stem = encoder.stem.forward(&reference).unwrap();
            check("voiceprint stem", &stem, "voiceprint_stem", 1e-4);
            let mut hidden = stem;
            for (index, stage) in encoder.stages.iter().enumerate() {
                hidden = stage.forward(&hidden).unwrap();
                let key = format!("voiceprint_stage{index}");
                check(&format!("voiceprint stage {index}"), &hidden, &key, 1e-4);
            }
            let fused = encoder.fused(&reference).unwrap();
            check("voiceprint fused", &fused, "voiceprint_fused", 1e-4);
            let pooled = encoder.identity_pool.forward(&fused).unwrap();
            check(
                "voiceprint identity statistics",
                &pooled,
                "voiceprint_identity_stats",
                1e-4,
            );
            let spread = spread_statistics(&fused).unwrap();
            check(
                "voiceprint style statistics",
                &spread,
                "voiceprint_style_stats",
                1e-4,
            );
            let print = encoder.encode(&audio).unwrap();
            check("identity (end to end)", &print.identity, "identity", 1e-4);
            check("style (end to end)", &print.style, "style", 1e-4);
            check("control (end to end)", &print.control, "control", 1e-4);
        }
    }
}
