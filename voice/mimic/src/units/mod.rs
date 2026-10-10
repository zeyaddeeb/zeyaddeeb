pub mod encoder;
pub mod features;
pub mod quantizer;

use anyhow::Result;
use candle_core::{Tensor, D};

use self::encoder::EncoderLayer;
use self::features::Features;
use self::quantizer::{resample_rows, Quantizer};
use crate::net::conv::PaddedConv;
use crate::net::norm::LayerNorm;
use crate::signal::resample::resample;

pub struct UnitEncoder {
    pub features: Features,
    pub widen: PaddedConv,
    pub halve: PaddedConv,
    pub positions: Tensor,
    pub layers: Vec<EncoderLayer>,
    pub final_norm: LayerNorm,
    pub quantizer: Quantizer,
    pub source_rate: u32,
    pub unit_samples: usize,
}

impl UnitEncoder {
    pub fn encode(&self, audio: &[f32]) -> Result<Vec<u32>> {
        let unit_count = audio.len().div_ceil(self.unit_samples);
        let features = self.features.extract(&self.listenable(audio))?;
        let encoded = self.contextualize(&self.embed(&features)?)?;
        self.quantizer
            .quantize(&resample_rows(&encoded, unit_count)?)
    }

    pub fn listenable(&self, audio: &[f32]) -> Vec<f32> {
        let rate = self.features.sample_rate();
        let expected = (audio.len() * rate as usize).div_ceil(self.source_rate as usize);
        let mut resampled = resample(audio, self.source_rate, rate);
        resampled.resize(expected, 0.0);
        resampled
    }

    pub fn embed(&self, features: &Tensor) -> Result<Tensor> {
        let kept = features.dim(D::Minus1)?.saturating_sub(1) / 2;
        let widened = self.widen.forward(features)?.gelu_erf()?;
        let halved = self.halve.forward(&widened)?.gelu_erf()?;
        let rows = halved.transpose(1, 2)?;
        let positions = self.positions.narrow(0, 0, rows.dim(1)?)?;
        Ok(rows.broadcast_add(&positions)?.narrow(1, 0, kept)?)
    }

    pub fn contextualize(&self, embedded: &Tensor) -> Result<Tensor> {
        let mut hidden = embedded.clone();
        for layer in &self.layers {
            hidden = layer.forward(&hidden)?;
        }
        self.final_norm.forward(&hidden)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};

    #[test]
    fn parity_unit_stages() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let encoder = &mimic.models.units;
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let leveled = fixture.floats("leveled");
            let check = |label: &str, actual: &Tensor, key: &str, limit: f32| {
                let error = testing::compare_tensors(
                    &format!("{name} {label}"),
                    actual,
                    &fixture.tensor(key),
                );
                assert!(error.relative < limit, "{label}: {error:?}");
            };
            let audio = encoder.listenable(&leveled);
            let error = testing::compare(
                &format!("{name} units audio"),
                &audio,
                &fixture.floats("units_audio"),
            );
            assert!(error.max_abs < 1e-6, "{error:?}");
            let features = encoder.features.extract(&audio).unwrap();
            check("units features", &features, "units_features", 1e-4);
            let reference = fixture.tensor("units_features");
            let embedded = encoder.embed(&reference).unwrap();
            check("units embedded", &embedded, "units_embedded", 1e-4);
            let first = encoder.layers[0].forward(&embedded).unwrap();
            check("units first layer", &first, "units_layer0", 1e-4);
            let encoded = encoder.contextualize(&embedded).unwrap();
            check("units encoded", &encoded, "units_encoded", 1e-4);
            let unit_count = leveled.len().div_ceil(encoder.unit_samples);
            let resampled = resample_rows(&encoded, unit_count).unwrap();
            check("units resampled", &resampled, "units_resampled", 1e-4);
            let digits = encoder.quantizer.digit_scores(&resampled).unwrap();
            check("units digit scores", &digits, "units_digits", 1e-4);
            let expected = fixture.units("units");
            let units = encoder.encode(&leveled).unwrap();
            let same = units.iter().zip(&expected).filter(|(a, e)| a == e).count();
            println!(
                "parity {name} units (end to end): {same} of {} equal",
                expected.len()
            );
            assert_eq!(units, expected);
        }
    }
}
