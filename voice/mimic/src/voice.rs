use anyhow::{ensure, Result};
use candle_core::{Device, Tensor};

use crate::rng::Rng;
use crate::settings::Settings;
use crate::signal::loudness::{raise_to_voice_level, Leveled};
use crate::signal::pauses::crop_at_pause;
use crate::signal::resample::resample;
use crate::voiceprint::Voiceprint;
use crate::weights::Models;

const ROOM_TONE_SEED: u64 = 0x006d_696d_6963;
const MIN_SECONDS: f64 = 0.1;

#[derive(Clone)]
pub struct Voice {
    pub(crate) identity: Vec<f32>,
    pub(crate) speaker: Tensor,
    pub(crate) units: Vec<u32>,
    pub(crate) mel: Tensor,
    pub(crate) level_db: f64,
}

impl Voice {
    pub fn identity(&self) -> &[f32] {
        &self.identity
    }
}

pub fn learn(
    models: &Models,
    settings: &Settings,
    samples: &[f32],
    sample_rate: u32,
) -> Result<Voice> {
    let recording = prepare(samples, sample_rate, settings)?;
    let print = voiceprint(models, settings, &recording.samples)?;
    let condition = models.acoustics.condition(&print)?;
    Ok(Voice {
        identity: print.identity.flatten_all()?.to_vec1()?,
        speaker: models.acoustics.speaker(&condition)?,
        units: models.units.encode(&recording.samples)?,
        mel: normalize_mel(&models.vocoder.mel(&recording.samples)?, settings)?,
        level_db: recording.level_db,
    })
}

fn voiceprint(models: &Models, settings: &Settings, samples: &[f32]) -> Result<Voiceprint> {
    let rate = settings.voiceprint.sample_rate;
    let listened = resample(samples, settings.sample_rate, rate);
    ensure!(
        listened.len() >= models.voiceprint.min_samples()
            && samples.len() >= models.vocoder.min_samples(),
        "reference recording is too short"
    );
    models.voiceprint.encode(&listened)
}

fn prepare(samples: &[f32], sample_rate: u32, settings: &Settings) -> Result<Leveled> {
    let rate = settings.sample_rate;
    let mono = to_model_rate(samples, sample_rate, rate)?;
    let mut rng = Rng::seeded(ROOM_TONE_SEED);
    let cropped = crop_at_pause(&mono, settings.speech.voice_seconds, rate, &mut rng);
    Ok(raise_to_voice_level(&cropped, rate))
}

fn to_model_rate(samples: &[f32], sample_rate: u32, rate: u32) -> Result<Vec<f32>> {
    ensure!(sample_rate > 0, "sample rate must be positive");
    ensure!(
        samples.iter().all(|sample| sample.is_finite()),
        "reference recording contains non-finite samples"
    );
    let mut mono = resample(samples, sample_rate, rate);
    mono.iter_mut()
        .for_each(|sample| *sample = sample.clamp(-1.0, 1.0));
    ensure!(
        mono.len() as f64 >= MIN_SECONDS * f64::from(rate),
        "reference recording is shorter than {MIN_SECONDS} seconds"
    );
    Ok(mono)
}

pub fn mel_statistics(settings: &Settings) -> Result<(Tensor, Tensor)> {
    let acoustics = &settings.acoustics;
    let column = |values: &[f32]| Tensor::from_slice(values, (1, values.len(), 1), &Device::Cpu);
    Ok((column(&acoustics.mel_mean)?, column(&acoustics.mel_std)?))
}

fn normalize_mel(mel: &Tensor, settings: &Settings) -> Result<Tensor> {
    let (mean, std) = mel_statistics(settings)?;
    Ok(mel.broadcast_sub(&mean)?.broadcast_div(&std)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};

    fn assert_shareable<T: Send + Sync + Clone>() {}

    #[test]
    fn voices_can_be_cloned_and_shared_across_threads() {
        assert_shareable::<Voice>();
    }

    #[test]
    fn parity_learning_a_voice() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let voice = mimic.learn(&fixture.floats("input"), 24_000).unwrap();
            let meta = fixture.meta();
            assert!((voice.level_db - meta["level_db"].as_f64().unwrap()).abs() < 1e-5);
            let identity = testing::compare(
                &format!("{name} learned identity"),
                voice.identity(),
                &fixture.floats("identity"),
            );
            let speaker = mimic
                .models
                .acoustics
                .speaker(&fixture.tensor("condition"))
                .unwrap();
            let speaker = testing::compare_tensors(
                &format!("{name} learned speaker"),
                &voice.speaker,
                &speaker,
            );
            let mel = testing::compare_tensors(
                &format!("{name} learned prompt mel"),
                &voice.mel,
                &fixture.tensor("mel"),
            );
            assert!(identity.relative < 1e-4 && speaker.relative < 1e-4 && mel.relative < 1e-4);
            assert_eq!(voice.units, fixture.units("units"));
            assert_eq!(voice.identity().len(), 192);
            let length: f32 = voice.identity().iter().map(|x| x * x).sum::<f32>().sqrt();
            assert!((length - 1.0).abs() < 1e-5);
        }
    }

    #[test]
    fn parity_other_sample_rates_and_bad_input() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let Some(fixture) = Fixture::load("voice_short") else {
            return;
        };
        let input = fixture.floats("input");
        let native = mimic.learn(&input, 24_000).unwrap();
        for rate in [16_000, 44_100, 48_000] {
            let converted = resample(&input, 24_000, rate);
            let voice = mimic.learn(&converted, rate).unwrap();
            let similarity: f32 = voice
                .identity()
                .iter()
                .zip(native.identity())
                .map(|(a, b)| a * b)
                .sum();
            println!("parity identity cosine after a {rate} Hz round trip: {similarity:.4}");
            assert!(similarity > 0.9, "{rate}: {similarity}");
        }
        assert!(mimic.learn(&[], 24_000).is_err());
        assert!(mimic.learn(&input[..1000], 24_000).is_err());
        assert!(mimic.learn(&input, 0).is_err());
        assert!(mimic.learn(&[f32::NAN; 48_000], 24_000).is_err());
        assert!(mimic.learn(&vec![0.0; 48_000], 24_000).is_ok());
    }

    #[test]
    fn parity_short_recordings_still_speak() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let Some(fixture) = Fixture::load("voice_short") else {
            return;
        };
        let input = fixture.floats("input");
        for seconds in [0.1, 0.25, 0.5, 1.0, 2.0, 3.0] {
            let samples = (seconds * 24_000.0) as usize;
            let voice = mimic.learn(&input[..samples], 24_000).unwrap();
            let spoken = mimic.say("Hello.", &voice, 1).unwrap();
            println!(
                "parity {seconds} s recording: {} units, {:.2} s spoken",
                voice.units.len(),
                spoken.len() as f64 / 24_000.0
            );
            assert!(!spoken.is_empty() && spoken.iter().all(|sample| sample.is_finite()));
        }
    }
}
