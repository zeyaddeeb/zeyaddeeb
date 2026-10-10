use std::{path::Path, sync::Mutex};

use anyhow::{anyhow, Context};
use candle_core::{DType, Device, IndexOp, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::whisper::{self, audio::pcm_to_mel, model::Whisper, Config};
use tokenizers::Tokenizer;

use crate::{audio, mel};

const PADDING_FRAMES: usize = 100;
const MIN_FRAMES: usize = 1_500;
const TOKENS_PER_SECOND: f32 = 7.0;
const MIN_TOKENS: usize = 12;
const MAX_TOKENS: usize = 96;
const SHORT_PHRASE: usize = 3;

pub struct Listener {
    model: Mutex<Whisper>,
    tokenizer: Tokenizer,
    config: Config,
    filters: Vec<f32>,
    prompt: Vec<u32>,
    end: u32,
    mask: Tensor,
}

impl Listener {
    pub fn load(dir: &Path) -> anyhow::Result<Self> {
        let config: Config = serde_json::from_slice(&std::fs::read(dir.join("config.json"))?)
            .context("whisper config.json is not readable")?;
        let tokenizer = Tokenizer::from_file(dir.join("tokenizer.json"))
            .map_err(|error| anyhow!("whisper tokenizer.json is not readable: {error}"))?;
        let weights = unsafe {
            VarBuilder::from_mmaped_safetensors(
                &[dir.join("model.safetensors")],
                DType::F32,
                &Device::Cpu,
            )?
        };

        Ok(Self {
            prompt: vec![
                token(&tokenizer, whisper::SOT_TOKEN)?,
                token(&tokenizer, whisper::NO_TIMESTAMPS_TOKEN)?,
            ],
            end: token(&tokenizer, whisper::EOT_TOKEN)?,
            mask: suppression(&config)?,
            filters: mel::filterbank(
                config.num_mel_bins,
                whisper::N_FFT,
                whisper::SAMPLE_RATE as u32,
            ),
            model: Mutex::new(Whisper::load(&weights, config.clone())?),
            tokenizer,
            config,
        })
    }

    pub fn hear(&self, samples: &[f32], rate: u32) -> anyhow::Result<String> {
        let heard = audio::resample(samples, rate, whisper::SAMPLE_RATE as u32);
        let seconds = heard.len() as f32 / whisper::SAMPLE_RATE as f32;
        let budget = ((seconds * TOKENS_PER_SECOND) as usize).clamp(MIN_TOKENS, MAX_TOKENS);
        let spectrogram = self.spectrogram(&heard)?;

        let mut model = self
            .model
            .lock()
            .map_err(|_| anyhow!("whisper lock was poisoned"))?;
        let tokens = self.decode(&mut model, &spectrogram, budget)?;

        self.tokenizer
            .decode(&tokens, true)
            .map(|text| text.trim().to_string())
            .map_err(|error| anyhow!("whisper tokens did not decode: {error}"))
    }

    fn spectrogram(&self, samples: &[f32]) -> anyhow::Result<Tensor> {
        let bands = self.config.num_mel_bins;
        let values = pcm_to_mel(&self.config, samples, &self.filters);
        let frames = values.len() / bands;
        let wanted = (samples.len() / whisper::HOP_LENGTH + PADDING_FRAMES)
            .next_multiple_of(2)
            .clamp(MIN_FRAMES, whisper::N_FRAMES.min(frames));

        Ok(Tensor::from_vec(values, (1, bands, frames), &Device::Cpu)?.narrow(2, 0, wanted)?)
    }

    fn decode(
        &self,
        model: &mut Whisper,
        spectrogram: &Tensor,
        budget: usize,
    ) -> anyhow::Result<Vec<u32>> {
        let heard = model.encoder.forward(spectrogram, true)?;
        let mut tokens = self.prompt.clone();

        for step in 0..budget {
            let context = Tensor::new(tokens.as_slice(), &Device::Cpu)?.unsqueeze(0)?;
            let states = model.decoder.forward(&context, &heard, step == 0)?;
            let last = states.i((..1, tokens.len() - 1..))?;
            let logits = model.decoder.final_linear(&last)?.i(0)?.i(0)?;
            let next = logits
                .broadcast_add(&self.mask)?
                .argmax(0)?
                .to_scalar::<u32>()?;

            if next == self.end {
                break;
            }

            tokens.push(next);

            if let Some(kept) = without_stutter(&tokens[self.prompt.len()..]) {
                tokens.truncate(self.prompt.len() + kept);
                break;
            }
        }

        Ok(tokens.split_off(self.prompt.len()))
    }
}

fn without_stutter(tokens: &[u32]) -> Option<usize> {
    (1..=tokens.len() / 2).find_map(|period| {
        let repeats = if period < SHORT_PHRASE { 4 } else { 2 };
        let span = period * repeats;

        if tokens.len() < span {
            return None;
        }

        let tail = &tokens[tokens.len() - span..];
        let looping = tail.chunks(period).all(|chunk| chunk == &tail[..period]);

        looping.then_some(tokens.len() - span + period)
    })
}

fn token(tokenizer: &Tokenizer, name: &str) -> anyhow::Result<u32> {
    tokenizer
        .token_to_id(name)
        .ok_or_else(|| anyhow!("whisper tokenizer has no {name} token"))
}

fn suppression(config: &Config) -> anyhow::Result<Tensor> {
    let mut mask = vec![0f32; config.vocab_size];

    for &suppressed in &config.suppress_tokens {
        if let Some(slot) = mask.get_mut(suppressed as usize) {
            *slot = f32::NEG_INFINITY;
        }
    }

    Ok(Tensor::new(mask.as_slice(), &Device::Cpu)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_speech_is_left_alone() {
        assert_eq!(without_stutter(&[1, 2, 3, 4, 5, 2, 3, 9]), None);
        assert_eq!(without_stutter(&[7, 7, 7]), None);
        assert_eq!(without_stutter(&[]), None);
    }

    #[test]
    fn a_repeated_phrase_is_cut_back_to_one() {
        assert_eq!(without_stutter(&[1, 2, 3, 4, 5, 3, 4, 5]), Some(5));
    }

    #[test]
    fn a_short_tic_needs_four_repeats() {
        assert_eq!(without_stutter(&[9, 4, 4]), None);
        assert_eq!(without_stutter(&[9, 4, 4, 4, 4]), Some(2));
        assert_eq!(without_stutter(&[9, 1, 2, 1, 2, 1, 2, 1, 2]), Some(3));
    }
}
