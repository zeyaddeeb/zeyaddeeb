use anyhow::Result;
use candle_core::{Device, Tensor};

use crate::acoustics::Canvas;
use crate::planner::sampler::Sampler;
use crate::planner::{Budget, Prompt};
use crate::rng::Rng;
use crate::settings::Settings;
use crate::signal::edges::{join, trim_lead, trim_trail, Fade, Lead};
use crate::signal::limiter::soft_limit;
use crate::signal::loudness::speech_gain;
use crate::text::pieces::PieceTokenizer;
use crate::text::split::split;
use crate::voice::{mel_statistics, Voice};
use crate::weights::Models;

const VOCODER_WARMUP_FRAMES: usize = 32;
const CLOSING_FADE: Fade = Fade {
    rise: false,
    fall: true,
    seconds: 0.08,
};

pub struct Speaker<'a> {
    pub models: &'a Models,
    pub settings: &'a Settings,
    pub tokenizer: &'a PieceTokenizer,
}

impl Speaker<'_> {
    pub fn say(&self, text: &str, voice: &Voice, seed: u64) -> Result<Vec<f32>> {
        let mut rng = Rng::seeded(seed);
        let mut carried: Option<Vec<u32>> = None;
        let mut parts = Vec::new();
        for sentence in split(text, self.settings.speech.segment_chars) {
            let units = self.plan(&sentence, voice, carried.as_deref(), &mut rng)?;
            if units.is_empty() {
                continue;
            }
            let noise = self.noise(voice, units.len(), &mut rng)?;
            parts.push(self.render(&units, voice, &noise)?);
            carried = self.carry(units).or(carried);
        }
        Ok(self.finish(parts, voice.level_db))
    }

    pub fn plan(
        &self,
        sentence: &str,
        voice: &Voice,
        carried: Option<&[u32]>,
        rng: &mut Rng,
    ) -> Result<Vec<u32>> {
        let speech = &self.settings.speech;
        let pieces = self.tokenizer.encode(sentence);
        let prompt = Prompt {
            pieces: &pieces,
            style_units: head(&voice.units, speech.style_units),
            prompt_units: carried.unwrap_or(head(&voice.units, speech.prompt_units)),
        };
        let budget = Budget {
            min_units: self.settings.units_for(speech.min_seconds),
            max_units: self.settings.units_for(speech.max_seconds),
        };
        let sampler = Sampler {
            temperature: speech.temperature,
            top_p: speech.top_p,
            top_k: speech.top_k,
        };
        self.models.planner.write(prompt, budget, &sampler, rng)
    }

    fn carry(&self, units: Vec<u32>) -> Option<Vec<u32>> {
        let kept = self.settings.speech.prompt_units.min(units.len());
        (kept > 0).then(|| units[units.len() - kept..].to_vec())
    }

    fn noise(&self, voice: &Voice, units: usize, rng: &mut Rng) -> Result<Tensor> {
        let (_, mel_bins, prompt_frames) = voice.mel.dims3()?;
        let frames = prompt_frames + units * self.settings.frames_per_unit;
        let values = rng.normal_vec(mel_bins * frames);
        Ok(Tensor::from_vec(
            values,
            (1, mel_bins, frames),
            &Device::Cpu,
        )?)
    }

    pub fn render(&self, units: &[u32], voice: &Voice, noise: &Tensor) -> Result<Vec<f32>> {
        let mel = self.paint(units, voice, noise)?;
        let warmup = VOCODER_WARMUP_FRAMES.min(voice.mel.dim(2)?);
        let audible = self.audible_mel(&mel, voice, warmup)?;
        let wave = self.models.vocoder.render(&audible)?;
        Ok(self.new_samples(&wave, warmup, units.len()).to_vec())
    }

    fn paint(&self, units: &[u32], voice: &Voice, noise: &Tensor) -> Result<Tensor> {
        let all_units = [voice.units.as_slice(), units].concat();
        let canvas = Canvas {
            units: &all_units,
            speaker: &voice.speaker,
            prompt: &voice.mel,
            noise,
        };
        let steps = self.settings.speech.flow_steps;
        self.models.acoustics.paint(&canvas, steps)
    }

    fn audible_mel(&self, mel: &Tensor, voice: &Voice, warmup: usize) -> Result<Tensor> {
        let start = voice.mel.dim(2)? - warmup;
        let tail = mel.narrow(2, start, mel.dim(2)? - start)?;
        let (mean, std) = mel_statistics(self.settings)?;
        Ok(tail.broadcast_mul(&std)?.broadcast_add(&mean)?)
    }

    fn new_samples<'a>(&self, wave: &'a [f32], warmup: usize, units: usize) -> &'a [f32] {
        let begin = (warmup * self.models.vocoder.hop).min(wave.len());
        let end = (begin + units * self.settings.unit_samples).min(wave.len());
        &wave[begin..end]
    }

    pub fn finish(&self, parts: Vec<Vec<f32>>, voice_level_db: f64) -> Vec<f32> {
        let rate = self.settings.sample_rate;
        let gain = speech_gain(voice_level_db);
        let trimmed: Vec<Vec<f32>> = parts
            .iter()
            .filter(|part| !part.is_empty())
            .enumerate()
            .map(|(index, part)| trim(part, gain, index, rate))
            .collect();
        if trimmed.is_empty() {
            return vec![0.0; self.settings.unit_samples];
        }
        let mut speech = join(&trimmed, rate);
        soft_limit(&mut speech);
        CLOSING_FADE.apply(&mut speech, rate);
        speech
    }
}

fn trim(part: &[f32], gain: f32, index: usize, rate: u32) -> Vec<f32> {
    let scaled: Vec<f32> = part.iter().map(|sample| sample * gain).collect();
    let lead = if index == 0 {
        Lead::OPENING
    } else {
        Lead::CONTINUATION
    };
    trim_trail(trim_lead(&scaled, rate, lead), rate).to_vec()
}

fn head(units: &[u32], count: usize) -> &[u32] {
    &units[..count.min(units.len())]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};
    use crate::Mimic;

    fn fixture_voice(mimic: &Mimic, fixture: &Fixture) -> Voice {
        let condition = fixture.tensor("condition");
        Voice {
            identity: fixture.floats("identity"),
            speaker: mimic.models.acoustics.speaker(&condition).unwrap(),
            units: fixture.units("units"),
            mel: fixture.tensor("mel"),
            level_db: fixture.meta()["level_db"].as_f64().unwrap(),
        }
    }

    #[test]
    fn head_takes_at_most_the_available_units() {
        assert_eq!(head(&[1, 2, 3], 2), [1, 2]);
        assert_eq!(head(&[1, 2, 3], 9), [1, 2, 3]);
    }

    #[test]
    fn parity_finishing() {
        let (Some(mimic), Some(fixture)) = (testing::mimic(), Fixture::load("finish")) else {
            return;
        };
        let (a, b) = (fixture.floats("a"), fixture.floats("b"));
        for level in [-21.5, -19.8] {
            let cases = [
                ("one", vec![a.clone()]),
                ("two", vec![a.clone(), b.clone()]),
                ("three", vec![b.clone(), a.clone(), b.clone()]),
            ];
            for (label, parts) in cases {
                let expected = fixture.floats(&format!("{label}_{level}"));
                let actual = mimic.speaker().finish(parts, level);
                assert_eq!(actual.len(), expected.len(), "{label} at {level}");
                let error = testing::compare(
                    &format!("finishing {label} at {level} dB"),
                    &actual,
                    &expected,
                );
                assert!(error.max_abs < 1e-6, "{error:?}");
            }
        }
        assert_eq!(mimic.speaker().finish(Vec::new(), -19.8), vec![0.0; 1024]);
    }

    #[test]
    fn parity_speech_from_recorded_units_and_noise() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let cases = [
            ("speech_long", "voice_long"),
            ("speech_short", "voice_short"),
            ("speech_multi", "voice_short"),
        ];
        for (speech, voice) in cases {
            let (Some(fixture), Some(voice)) = (Fixture::load(speech), Fixture::load(voice)) else {
                return;
            };
            let voice = fixture_voice(mimic, &voice);
            let speaker = mimic.speaker();
            let segments = fixture.meta()["segment_count"].as_u64().unwrap();
            let mut parts = Vec::new();
            for segment in 0..segments {
                let key = |suffix: &str| format!("s{segment}_{suffix}");
                let units = fixture.units(&key("units"));
                let wave = speaker
                    .render(&units, &voice, &fixture.tensor(&key("noise")))
                    .unwrap();
                let expected = fixture.floats(&key("wave"));
                assert_eq!(wave.len(), expected.len());
                let error = testing::compare(
                    &format!("{speech} segment {segment} waveform"),
                    &wave,
                    &expected,
                );
                assert!(error.relative < 1e-3, "{error:?}");
                parts.push(wave);
            }
            let finished = speaker.finish(parts, voice.level_db);
            let expected = fixture.floats("final");
            assert_eq!(finished.len(), expected.len());
            let error =
                testing::compare(&format!("{speech} finished speech"), &finished, &expected);
            assert!(error.relative < 1e-3, "{error:?}");
        }
    }

    #[test]
    fn parity_prompts_carry_between_sentences() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let (Some(fixture), Some(voice)) =
            (Fixture::load("speech_multi"), Fixture::load("voice_short"))
        else {
            return;
        };
        let voice = fixture_voice(mimic, &voice);
        let speaker = mimic.speaker();
        let first = fixture.units("s0_units");
        let carried = speaker.carry(first.clone()).unwrap();
        assert_eq!(carried, fixture.units("s1_prompt_units"));
        assert_eq!(head(&voice.units, 120), fixture.units("s0_prompt_units"));
        assert_eq!(head(&voice.units, 160), fixture.units("s0_style_units"));
        let sentences = split(fixture.meta()["text"].as_str().unwrap(), 300);
        for (index, sentence) in sentences.iter().enumerate() {
            assert_eq!(
                speaker.tokenizer.encode(sentence),
                fixture.units(&format!("s{index}_pieces"))
            );
        }
    }

    #[test]
    fn parity_saying_is_deterministic_per_seed() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let Some(voice) = Fixture::load("voice_short") else {
            return;
        };
        let voice = fixture_voice(mimic, &voice);
        let first = mimic.say("Good morning.", &voice, 7).unwrap();
        let again = mimic.say("Good morning.", &voice, 7).unwrap();
        let other = mimic.say("Good morning.", &voice, 8).unwrap();
        assert_eq!(first, again);
        assert_ne!(first, other);
        assert!(first.len() > 2400 && first.iter().all(|sample| sample.abs() <= 1.0));
        assert_eq!(mimic.say("   ", &voice, 1).unwrap(), vec![0.0; 1024]);
    }
}
