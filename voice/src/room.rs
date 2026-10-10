use std::path::Path;

use anyhow::{anyhow, Context};
use mimic::{Mimic, Voice};

use crate::{
    audio::{self, RATE},
    line::Line,
    protocol::Generation,
    spectrum::Analyzer,
    stt::Listener,
};

const LONGEST_SCRIPT: usize = 240;
const LONGEST_SECONDS: usize = 12;

pub struct Room {
    listener: Listener,
    mimic: Mimic,
    analyzer: Analyzer,
}

#[derive(Clone)]
pub struct Recording {
    pub samples: Vec<f32>,
    pub voice: Voice,
}

pub struct Turn {
    pub generation: Generation,
    pub recording: Recording,
}

pub struct Progress {
    original: Voice,
    latest: Recording,
    index: usize,
    line: Line,
    seed: u64,
}

impl Progress {
    pub fn index(&self) -> usize {
        self.index
    }
}

const FILES: [&str; 9] = [
    "whisper/config.json",
    "whisper/model.safetensors",
    "whisper/tokenizer.json",
    "mimic/config.json",
    "mimic/model.safetensors",
    "mimic/semantic_encoder.safetensors",
    "mimic/speaker_encoder.safetensors",
    "mimic/tokenizer.model",
    "mimic/vocoder.safetensors",
];

impl Room {
    pub fn furnished(models: &Path) -> anyhow::Result<()> {
        match FILES.iter().find(|file| !models.join(file).is_file()) {
            Some(missing) => Err(anyhow!("{} is missing", models.join(missing).display())),
            None => Ok(()),
        }
    }

    pub fn open(models: &Path) -> anyhow::Result<Self> {
        Ok(Self {
            listener: Listener::load(&models.join("whisper"))
                .context("the speech recognizer did not load")?,
            mimic: Mimic::load(&models.join("mimic")).context("the voice model did not load")?,
            analyzer: Analyzer::new(),
        })
    }

    pub fn alike(&self, a: &[f32], b: &[f32]) -> anyhow::Result<f32> {
        Ok(likeness(
            self.mimic.learn(a, RATE)?.identity(),
            self.mimic.learn(b, RATE)?.identity(),
        ))
    }

    pub fn begin(&self, spoken: &[f32], line: Line, seed: u64) -> anyhow::Result<(Turn, Progress)> {
        let samples = spoken.to_vec();
        let voice = self.mimic.learn(&samples, RATE)?;
        let recording = Recording { samples, voice };
        let progress = Progress {
            original: recording.voice.clone(),
            latest: recording.clone(),
            index: 0,
            line,
            seed,
        };

        Ok((
            Turn {
                generation: Generation {
                    index: 0,
                    text: String::new(),
                    likeness: 1.0,
                    seconds: seconds(&recording.samples),
                    spectrum: self.analyzer.profile(&recording.samples),
                },
                recording,
            },
            progress,
        ))
    }

    pub fn advance(&self, progress: &mut Progress) -> anyhow::Result<Option<Turn>> {
        let text = script(&self.listener.hear(&progress.latest.samples, RATE)?);

        if text.is_empty() {
            return Ok(None);
        }

        let index = progress.index + 1;
        let seed = progress.seed.wrapping_add(index as u64);
        let said = self.mimic.say(&text, &progress.latest.voice, seed)?;
        let said = audio::resample(&said, self.mimic.sample_rate(), RATE);
        let mut samples = progress.line.carry(&said, seed)?;

        samples.truncate(LONGEST_SECONDS * RATE as usize);

        let voice = self.mimic.learn(&samples, RATE)?;
        let recording = Recording { samples, voice };

        progress.latest = recording.clone();
        progress.index = index;

        Ok(Some(Turn {
            generation: Generation {
                index,
                text,
                likeness: likeness(recording.voice.identity(), progress.original.identity()),
                seconds: seconds(&recording.samples),
                spectrum: self.analyzer.profile(&recording.samples),
            },
            recording,
        }))
    }
}

fn script(heard: &str) -> String {
    heard.trim().chars().take(LONGEST_SCRIPT).collect()
}

fn seconds(samples: &[f32]) -> f32 {
    samples.len() as f32 / RATE as f32
}

pub fn likeness(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let scale =
        (a.iter().map(|x| x * x).sum::<f32>() * b.iter().map(|y| y * y).sum::<f32>()).sqrt();

    if scale == 0.0 {
        return 0.0;
    }

    dot / scale
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_voice_is_exactly_like_itself() {
        assert!((likeness(&[0.3, -0.4, 0.5], &[0.3, -0.4, 0.5]) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn unrelated_voices_score_zero() {
        assert_eq!(likeness(&[1.0, 0.0], &[0.0, 1.0]), 0.0);
        assert_eq!(likeness(&[0.0, 0.0], &[0.0, 1.0]), 0.0);
    }

    #[test]
    fn loudness_does_not_change_likeness() {
        assert!((likeness(&[0.2, 0.1], &[2.0, 1.0]) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn a_script_is_trimmed_and_bounded() {
        assert_eq!(script("  hello there. "), "hello there.");
        assert_eq!(script(&"a".repeat(500)).len(), LONGEST_SCRIPT);
    }
}
