use std::path::Path;

use anyhow::{Context, Result};

use crate::settings::Settings;
use crate::speech::Speaker;
use crate::text::pieces::PieceTokenizer;
use crate::voice::{learn, Voice};
use crate::weights::{self, Models, PIECES_FILE};

pub struct Mimic {
    pub(crate) settings: Settings,
    pub(crate) tokenizer: PieceTokenizer,
    pub(crate) models: Models,
}

impl Mimic {
    pub fn load(dir: &Path) -> Result<Self> {
        let settings = Settings::load(dir)?;
        let models = weights::load(dir, &settings)
            .with_context(|| format!("loading model weights from {}", dir.display()))?;
        Ok(Self {
            tokenizer: PieceTokenizer::open(&dir.join(PIECES_FILE))?,
            settings,
            models,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.settings.sample_rate
    }

    pub fn learn(&self, samples: &[f32], sample_rate: u32) -> Result<Voice> {
        learn(&self.models, &self.settings, samples, sample_rate)
    }

    pub fn say(&self, text: &str, voice: &Voice, seed: u64) -> Result<Vec<f32>> {
        self.speaker().say(text, voice, seed)
    }

    pub(crate) fn speaker(&self) -> Speaker<'_> {
        Speaker {
            models: &self.models,
            settings: &self.settings,
            tokenizer: &self.tokenizer,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing;

    fn assert_shareable<T: Send + Sync>() {}

    #[test]
    fn loaded_models_can_be_shared_across_threads() {
        assert_shareable::<Mimic>();
    }

    #[test]
    fn loading_a_missing_directory_fails_cleanly() {
        let missing = std::env::temp_dir().join("mimic-no-such-models");
        assert!(Mimic::load(&missing).is_err());
    }

    #[test]
    fn parity_shipped_models_load() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        assert_eq!(mimic.sample_rate(), 24_000);
    }

    #[test]
    fn parity_threads_share_one_model() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let Some(fixture) = testing::Fixture::load("voice_short") else {
            return;
        };
        let voice = mimic.learn(&fixture.floats("input"), 24_000).unwrap();
        let spoken: Vec<Vec<f32>> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..2)
                .map(|_| scope.spawn(|| mimic.say("Two at once.", &voice, 3).unwrap()))
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect()
        });
        assert_eq!(spoken[0], spoken[1]);
    }
}
