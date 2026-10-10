pub mod block;
pub mod memory;
pub mod sampler;
pub mod style;

use anyhow::Result;
use candle_core::{Device, Tensor};
use candle_nn::{Embedding, Linear, Module};

use self::block::PlannerBlock;
use self::memory::Memory;
use self::sampler::Sampler;
use self::style::StyleReader;
use crate::net::norm::RmsNorm;
use crate::rng::Rng;
use crate::settings::PlannerSettings;

pub struct Planner {
    pub settings: PlannerSettings,
    pub pieces: Embedding,
    pub units: Embedding,
    pub unit_projection: Linear,
    pub style: StyleReader,
    pub blocks: Vec<PlannerBlock>,
    pub final_norm: RmsNorm,
    pub head: Linear,
}

#[derive(Debug, Clone, Copy)]
pub struct Prompt<'a> {
    pub pieces: &'a [u32],
    pub style_units: &'a [u32],
    pub prompt_units: &'a [u32],
}

#[derive(Debug, Clone, Copy)]
pub struct Budget {
    pub min_units: usize,
    pub max_units: usize,
}

impl Planner {
    pub fn write(
        &self,
        prompt: Prompt<'_>,
        budget: Budget,
        sampler: &Sampler,
        rng: &mut Rng,
    ) -> Result<Vec<u32>> {
        let prefix = self.prefix(prompt)?;
        let mut memory = self.memory(prefix.dim(1)? + budget.max_units)?;
        let mut scores = self.absorb(&prefix, &mut memory)?;
        let mut units = Vec::new();
        while units.len() < budget.max_units {
            let Some(unit) = self.choose(&scores, units.len(), budget, sampler, rng) else {
                break;
            };
            units.push(unit);
            if units.len() < budget.max_units {
                scores = self.absorb(&self.embed_units(&[unit])?, &mut memory)?;
            }
        }
        Ok(units)
    }

    fn choose(
        &self,
        scores: &[f32],
        written: usize,
        budget: Budget,
        sampler: &Sampler,
        rng: &mut Rng,
    ) -> Option<u32> {
        let (start, stop) = (self.settings.start_id(), self.settings.stop_id());
        let may_stop = written + 1 >= budget.min_units.max(1);
        let banned: &[usize] = if may_stop { &[start] } else { &[start, stop] };
        let choice = sampler.pick(scores, banned, rng);
        let stopping = may_stop && choice == stop;
        (!stopping).then(|| choice.min(self.settings.unit_count - 1) as u32)
    }

    pub fn memory(&self, capacity: usize) -> Result<Memory> {
        Memory::new(self.blocks.len(), self.settings.head_width(), capacity)
    }

    pub fn prefix(&self, prompt: Prompt<'_>) -> Result<Tensor> {
        let pieces = &prompt.pieces[..prompt.pieces.len().min(self.settings.max_pieces)];
        let mut parts = vec![
            self.style.forward(&self.embed_units(prompt.style_units)?)?,
            self.pieces.forward(&ids(pieces)?)?,
        ];
        if !prompt.prompt_units.is_empty() {
            parts.push(self.embed_units(prompt.prompt_units)?);
        }
        parts.push(self.embed_units(&[self.settings.start_id() as u32])?);
        Ok(Tensor::cat(&parts, 1)?)
    }

    pub fn embed_units(&self, units: &[u32]) -> Result<Tensor> {
        Ok(self
            .unit_projection
            .forward(&self.units.forward(&ids(units)?)?)?)
    }

    pub fn absorb(&self, embedded: &Tensor, memory: &mut Memory) -> Result<Vec<f32>> {
        let steps = embedded.dim(1)?;
        let mut hidden = embedded.clone();
        for (index, block) in self.blocks.iter().enumerate() {
            hidden = block.forward(&hidden, memory, index)?;
        }
        memory.advance(steps);
        let last = self.final_norm.forward(&hidden.narrow(1, steps - 1, 1)?)?;
        Ok(self.head.forward(&last)?.flatten_all()?.to_vec1()?)
    }
}

fn ids(values: &[u32]) -> Result<Tensor> {
    Ok(Tensor::from_slice(values, (1, values.len()), &Device::Cpu)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};

    fn prompt_of<'a>(pieces: &'a [u32], style: &'a [u32], prompt: &'a [u32]) -> Prompt<'a> {
        Prompt {
            pieces,
            style_units: style,
            prompt_units: prompt,
        }
    }

    #[test]
    fn parity_prefix_and_scores() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let planner = &mimic.models.planner;
        for name in ["speech_long", "speech_short", "speech_multi"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let segments = fixture.meta()["segment_count"].as_u64().unwrap();
            for segment in 0..segments {
                let key = |suffix: &str| format!("s{segment}_{suffix}");
                let label = |stage: &str| format!("{name} segment {segment} {stage}");
                let (pieces, style) = (
                    fixture.units(&key("pieces")),
                    fixture.units(&key("style_units")),
                );
                let prompt_units = fixture.units(&key("prompt_units"));
                let style_prefix = planner
                    .style
                    .forward(&planner.embed_units(&style).unwrap())
                    .unwrap();
                let expected = fixture.tensor(&key("style_prefix"));
                let error =
                    testing::compare_tensors(&label("style prefix"), &style_prefix, &expected);
                assert!(error.relative < 1e-4, "{error:?}");
                let prefix = planner
                    .prefix(prompt_of(&pieces, &style, &prompt_units))
                    .unwrap();
                let error = testing::compare_tensors(
                    &label("prefix"),
                    &prefix,
                    &fixture.tensor(&key("prefix")),
                );
                assert!(error.relative < 1e-4, "{error:?}");

                let expected = fixture.rows(&key("logits"));
                let fed = fixture.units(&key("fed"));
                let mut memory = planner
                    .memory(prefix.dim(1).unwrap() + fed.len() + 1)
                    .unwrap();
                let mut actual = vec![planner.absorb(&prefix, &mut memory).unwrap()];
                for unit in &fed {
                    let embedded = planner.embed_units(&[*unit]).unwrap();
                    actual.push(planner.absorb(&embedded, &mut memory).unwrap());
                }
                let first =
                    testing::compare(&label("scores after prefix"), &actual[0], &expected[0]);
                let all = testing::compare(
                    &label("scores over all cached steps"),
                    &actual.concat(),
                    &expected.concat(),
                );
                let worst = actual
                    .iter()
                    .zip(&expected)
                    .map(|(a, e)| testing::quiet_relative(a, e))
                    .fold(0.0f32, f32::max);
                println!(
                    "parity {}: worst single step relative {worst:.2e} over {} steps",
                    label("scores"),
                    actual.len()
                );
                assert!(
                    first.relative < 1e-4 && all.relative < 1e-4 && worst < 1e-4,
                    "{first:?} {all:?} {worst}"
                );
                let agree = actual
                    .iter()
                    .zip(&expected)
                    .filter(|(a, e)| sampler::argmax(a) == sampler::argmax(e))
                    .count();
                assert_eq!(agree, actual.len());
            }
        }
    }

    #[test]
    fn parity_writing_is_seeded_and_respects_the_budget() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let Some(fixture) = Fixture::load("speech_short") else {
            return;
        };
        let planner = &mimic.models.planner;
        let (pieces, style) = (fixture.units("s0_pieces"), fixture.units("s0_style_units"));
        let prompt_units = fixture.units("s0_prompt_units");
        let prompt = prompt_of(&pieces, &style, &prompt_units);
        let sampler = Sampler {
            temperature: 0.8,
            top_p: 0.9,
            top_k: 25,
        };
        let write = |seed: u64, budget: Budget| {
            planner
                .write(prompt, budget, &sampler, &mut Rng::seeded(seed))
                .unwrap()
        };
        let capped = Budget {
            min_units: 10,
            max_units: 12,
        };
        assert_eq!(write(5, capped), write(5, capped));
        assert_ne!(write(5, capped), write(6, capped));
        assert!((10..=12).contains(&write(5, capped).len()));
        assert!(write(5, capped)
            .iter()
            .all(|unit| (*unit as usize) < planner.settings.unit_count));
    }
}
