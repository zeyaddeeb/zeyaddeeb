pub mod block;
pub mod embed;
pub mod guide;
pub mod schedule;

use anyhow::{ensure, Result};
use candle_core::{DType, Device, Tensor, D};
use candle_nn::{Linear, Module};

use self::block::{Exit, FlowBlock};
use self::embed::FrameEmbedder;
use self::guide::Guide;
use self::schedule::{time_grid, Clock};
use crate::net::mlp::SiluMlp;
use crate::net::rotary::Rotary;
use crate::settings::AcousticSettings;
use crate::voiceprint::Voiceprint;

const UNIT_NORM_FLOOR: f64 = 1e-12;

pub struct AcousticModel {
    pub settings: AcousticSettings,
    pub condition: SiluMlp,
    pub speaker: Linear,
    pub guide: Guide,
    pub clock: Clock,
    pub embedder: FrameEmbedder,
    pub blocks: Vec<FlowBlock>,
    pub exit: Exit,
}

pub struct Canvas<'a> {
    pub units: &'a [u32],
    pub speaker: &'a Tensor,
    pub prompt: &'a Tensor,
    pub noise: &'a Tensor,
}

pub struct Scene {
    context: Tensor,
    prompt_mask: Tensor,
    rotary: Rotary,
}

impl AcousticModel {
    pub fn condition(&self, voiceprint: &Voiceprint) -> Result<Tensor> {
        self.condition.forward(&voiceprint.joined()?)
    }

    pub fn speaker(&self, condition: &Tensor) -> Result<Tensor> {
        let norm = condition.sqr()?.sum_keepdim(D::Minus1)?.sqrt()?;
        let direction = condition.broadcast_div(&norm.maximum(UNIT_NORM_FLOOR)?)?;
        Ok(self.speaker.forward(&direction)?)
    }

    pub fn paint(&self, canvas: &Canvas<'_>, steps: usize) -> Result<Tensor> {
        let prompt = canvas.prompt.transpose(1, 2)?.contiguous()?;
        let noise = canvas.noise.transpose(1, 2)?.contiguous()?;
        let (frames, prompt_frames) = (noise.dim(1)?, prompt.dim(1)?);
        ensure!(prompt_frames <= frames, "prompt is longer than the canvas");
        let scene = self.scene(canvas.units, canvas.speaker, &prompt, frames)?;
        let mut state = noise.clone();
        for times in time_grid(steps, self.settings.sway).windows(2) {
            let velocity = self.velocity(&state, times[0], &scene)?;
            let moved = (state + (velocity * f64::from(times[1] - times[0]))?)?;
            state = self.pin_prompt(&moved, &noise, &prompt, times[1])?;
        }
        let painted = state.narrow(1, prompt_frames, frames - prompt_frames)?;
        Ok(Tensor::cat(&[&prompt, &painted], 1)?
            .transpose(1, 2)?
            .contiguous()?)
    }

    pub fn scene(
        &self,
        units: &[u32],
        speaker: &Tensor,
        prompt: &Tensor,
        frames: usize,
    ) -> Result<Scene> {
        let (_, prompt_frames, mel_bins) = prompt.dims3()?;
        let blank = frames - prompt_frames;
        let silence = Tensor::zeros((1, blank, mel_bins), DType::F32, &Device::Cpu)?;
        let guide = self.guide.forward(units, frames)?.transpose(1, 2)?;
        let speaker = speaker.unsqueeze(1)?.expand((1, frames, speaker.dim(1)?))?;
        let known = Tensor::cat(&[prompt, &silence], 1)?;
        Ok(Scene {
            context: Tensor::cat(&[&known, &guide, &speaker], D::Minus1)?,
            prompt_mask: prompt_mask(prompt_frames, blank)?,
            rotary: Rotary::new(self.settings.head_width, frames)?,
        })
    }

    pub fn embed(&self, state: &Tensor, scene: &Scene) -> Result<Tensor> {
        self.embedder
            .forward(state, &scene.context, &scene.prompt_mask)
    }

    pub fn velocity(&self, state: &Tensor, time: f32, scene: &Scene) -> Result<Tensor> {
        let time = self.clock.embed(time)?;
        let mut hidden = self.embed(state, scene)?;
        for block in &self.blocks {
            hidden = block.forward(&hidden, &time, &scene.rotary)?;
        }
        self.exit.forward(&hidden, &time)
    }

    fn pin_prompt(
        &self,
        state: &Tensor,
        noise: &Tensor,
        prompt: &Tensor,
        time: f32,
    ) -> Result<Tensor> {
        let (frames, prompt_frames) = (state.dim(1)?, prompt.dim(1)?);
        let shrink = (1.0 - f64::from(self.settings.sigma_min)) as f32;
        let noise_share = 1.0 - shrink * time;
        let seed = noise.narrow(1, 0, prompt_frames)?;
        let pinned = ((seed * f64::from(noise_share))? + (prompt * f64::from(time))?)?;
        let free = state.narrow(1, prompt_frames, frames - prompt_frames)?;
        Ok(Tensor::cat(&[&pinned, &free], 1)?)
    }
}

fn prompt_mask(prompt_frames: usize, blank: usize) -> Result<Tensor> {
    let mut mask = vec![1.0f32; prompt_frames];
    mask.resize(prompt_frames + blank, 0.0);
    Ok(Tensor::from_vec(
        mask,
        (1, prompt_frames + blank, 1),
        &Device::Cpu,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};

    #[test]
    fn prompt_mask_marks_only_the_known_frames() {
        let mask = prompt_mask(2, 3).unwrap();
        assert_eq!(mask.dims(), [1, 5, 1]);
        assert_eq!(testing::flat(&mask), [1.0, 1.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn parity_voice_condition() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let model = &mimic.models.acoustics;
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let print = Voiceprint {
                identity: fixture.tensor("identity"),
                style: fixture.tensor("style"),
                control: fixture.tensor("control"),
            };
            let condition = model.condition(&print).unwrap();
            let error = testing::compare_tensors(
                &format!("{name} condition"),
                &condition,
                &fixture.tensor("condition"),
            );
            assert!(error.relative < 1e-5, "{error:?}");
        }
    }

    #[test]
    fn parity_flow_stages() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let model = &mimic.models.acoustics;
        for (speech, voice) in [
            ("speech_long", "voice_long"),
            ("speech_short", "voice_short"),
        ] {
            let (Some(fixture), Some(voice)) = (Fixture::load(speech), Fixture::load(voice)) else {
                return;
            };
            let check = |label: &str, actual: &Tensor, key: &str, limit: f32| {
                let expected = fixture.tensor(&format!("s0_{key}"));
                let error =
                    testing::compare_tensors(&format!("{speech} {label}"), actual, &expected);
                assert!(error.relative < limit, "{label}: {error:?}");
            };
            let units = [voice.units("units"), fixture.units("s0_units")].concat();
            let noise = fixture.tensor("s0_noise");
            let frames = noise.dim(2).unwrap();
            let ids = Tensor::from_slice(&units, (1, units.len()), &Device::Cpu).unwrap();
            let latents = model
                .guide
                .units
                .forward(&ids)
                .unwrap()
                .transpose(1, 2)
                .unwrap();
            let peeked = model.guide.peek.forward(&latents).unwrap();
            check("guide lookahead", &peeked, "guide_prelook", 1e-4);
            let stretched = model.guide.stretch.forward(&peeked, frames).unwrap();
            check("guide upsampled", &stretched, "guide_upsampled", 1e-4);
            check(
                "guide",
                &model.guide.forward(&units, frames).unwrap(),
                "guide",
                1e-4,
            );

            let grid = time_grid(2, model.settings.sway);
            let error = testing::compare(
                &format!("{speech} time grid"),
                &grid,
                &fixture.floats("s0_time_grid"),
            );
            assert!(error.max_abs < 1e-7, "{error:?}");
            let times: Vec<Tensor> = grid[..2]
                .iter()
                .map(|t| model.clock.embed(*t).unwrap())
                .collect();
            check(
                "time embeddings",
                &Tensor::cat(&times, 0).unwrap(),
                "time_embeddings",
                1e-4,
            );
            let speaker = model.speaker(&voice.tensor("condition")).unwrap();
            check("speaker", &speaker, "speaker", 1e-5);

            let prompt = voice
                .tensor("mel")
                .transpose(1, 2)
                .unwrap()
                .contiguous()
                .unwrap();
            let state = noise.transpose(1, 2).unwrap().contiguous().unwrap();
            let scene = model.scene(&units, &speaker, &prompt, frames).unwrap();
            let embedded = model.embed(&state, &scene).unwrap();
            check("frame embedding", &embedded, "embedded", 1e-4);
            let first = model.blocks[0]
                .forward(&embedded, &times[0], &scene.rotary)
                .unwrap();
            check("first flow block", &first, "block0", 1e-4);
            let velocity = model
                .velocity(&state, grid[0], &scene)
                .unwrap()
                .transpose(1, 2)
                .unwrap();
            check("first velocity", &velocity, "velocity0", 1e-4);
            let canvas = Canvas {
                units: &units,
                speaker: &speaker,
                prompt: &voice.tensor("mel"),
                noise: &noise,
            };
            check(
                "painted mel",
                &model.paint(&canvas, 2).unwrap(),
                "mel",
                1e-4,
            );
        }
    }
}
