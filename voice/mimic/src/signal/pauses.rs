use super::grid::{linspace, seconds_to_samples};
use super::loudness::{frame_levels, quantile, Framing};
use crate::rng::Rng;

const QUIET_QUANTILE: f32 = 0.1;
const QUIET_MARGIN: f32 = 4.0;
const MIN_PAUSE_FRAMES: usize = 10;
const KEPT_PAUSE_FRAMES: usize = 15;
const SEARCH_SECONDS: f64 = 5.0;
const MIN_KEPT_FRACTION: f64 = 0.75;
const TONE_SECONDS: f64 = 0.25;
const FADE_SECONDS: f64 = 0.02;
const MIN_ANALYZED_WINDOWS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq)]
struct Pause {
    start: usize,
    end: usize,
}

struct Analysis {
    framing: Framing,
    floor: f32,
    pauses: Vec<Pause>,
}

impl Analysis {
    fn of(samples: &[f32], sample_rate: u32) -> Self {
        let framing = Framing::at(sample_rate);
        let levels = frame_levels(samples, framing);
        let floor = quantile(&levels, QUIET_QUANTILE);
        let quiet: Vec<bool> = levels.iter().map(|l| *l < floor * QUIET_MARGIN).collect();
        Self {
            framing,
            floor,
            pauses: find_pauses(&quiet),
        }
    }

    fn onset(&self, pause: Pause) -> usize {
        pause.start * self.framing.hop
    }

    fn cut(&self, pause: Pause) -> usize {
        let kept = (pause.end - pause.start).min(KEPT_PAUSE_FRAMES);
        (pause.start + kept) * self.framing.hop + self.framing.window
    }

    fn ends_quietly(&self, total: usize) -> bool {
        self.pauses.last().is_some_and(|pause| {
            pause.end * self.framing.hop + self.framing.window + self.framing.hop >= total
        })
    }
}

fn find_pauses(quiet: &[bool]) -> Vec<Pause> {
    let mut pauses = Vec::new();
    let mut start = 0;
    while start < quiet.len() {
        let run = quiet[start..].iter().take_while(|q| **q).count();
        if run >= MIN_PAUSE_FRAMES {
            pauses.push(Pause {
                start,
                end: start + run,
            });
        }
        start += run.max(1);
    }
    pauses
}

enum Cut {
    Keep,
    At(usize),
    Hard(usize),
}

pub fn crop_at_pause(
    samples: &[f32],
    target_seconds: f64,
    sample_rate: u32,
    rng: &mut Rng,
) -> Vec<f32> {
    let total = samples.len();
    if total < MIN_ANALYZED_WINDOWS * Framing::at(sample_rate).window {
        return samples.to_vec();
    }
    let analysis = Analysis::of(samples, sample_rate);
    let target = (target_seconds * f64::from(sample_rate)).round_ties_even() as usize;
    let cut = if total <= target {
        cut_within(&analysis, total)
    } else {
        cut_near(&analysis, target, sample_rate)
    };
    match cut {
        Cut::Keep => samples.to_vec(),
        Cut::At(end) => samples[..end.min(total)].to_vec(),
        Cut::Hard(end) => with_room_tone(&samples[..end], sample_rate, analysis.floor, rng),
    }
}

fn cut_within(analysis: &Analysis, total: usize) -> Cut {
    if analysis.ends_quietly(total) {
        return Cut::Keep;
    }
    let earliest = (total as f64 * MIN_KEPT_FRACTION) as usize;
    let late = analysis
        .pauses
        .iter()
        .rev()
        .find(|pause| analysis.onset(**pause) >= earliest);
    late.map_or(Cut::Hard(total), |pause| Cut::At(analysis.cut(*pause)))
}

fn cut_near(analysis: &Analysis, target: usize, sample_rate: u32) -> Cut {
    let reach = seconds_to_samples(SEARCH_SECONDS, sample_rate);
    let hop = analysis.framing.hop;
    let after = analysis
        .pauses
        .iter()
        .find(|pause| (target..=target + reach).contains(&analysis.onset(**pause)));
    let before = analysis
        .pauses
        .iter()
        .rev()
        .find(|pause| analysis.onset(**pause) < target && pause.end * hop + reach >= target);
    after
        .or(before)
        .map_or(Cut::Hard(target), |pause| Cut::At(analysis.cut(*pause)))
}

fn with_room_tone(samples: &[f32], sample_rate: u32, floor: f32, rng: &mut Rng) -> Vec<f32> {
    let fade = seconds_to_samples(FADE_SECONDS, sample_rate).min(samples.len());
    let tone = seconds_to_samples(TONE_SECONDS, sample_rate);
    let mut out = samples.to_vec();
    let tail = out.len() - fade;
    for (sample, weight) in out[tail..].iter_mut().zip(linspace(1.0, 0.0, fade)) {
        *sample *= weight;
    }
    out.extend((0..tone).map(|_| rng.normal() as f32 * floor));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::Fixture;

    const RATE: u32 = 24_000;
    const TONE_SAMPLES: usize = 6000;

    fn carrier(index: usize) -> f32 {
        (std::f32::consts::TAU * 180.0 * index as f32 / RATE as f32).sin()
    }

    fn voiced(seconds: f64) -> Vec<f32> {
        (0..seconds_to_samples(seconds, RATE))
            .map(|i| 0.3 * carrier(i))
            .collect()
    }

    fn pulsed(seconds: f64) -> Vec<f32> {
        (0..seconds_to_samples(seconds, RATE))
            .map(|i| if (i / 1200) % 2 == 0 { 0.5 } else { 0.05 } * carrier(i))
            .collect()
    }

    fn silence(seconds: f64) -> Vec<f32> {
        vec![0.0; seconds_to_samples(seconds, RATE)]
    }

    fn crop(samples: &[f32], seconds: f64) -> Vec<f32> {
        crop_at_pause(samples, seconds, RATE, &mut Rng::seeded(1))
    }

    #[test]
    fn pauses_need_ten_quiet_frames() {
        let mut quiet = vec![false; 40];
        quiet[3..12].fill(true);
        quiet[20..30].fill(true);
        quiet[35..40].fill(true);
        assert_eq!(find_pauses(&quiet), [Pause { start: 20, end: 30 }]);
        assert!(find_pauses(&[]).is_empty());
        assert_eq!(find_pauses(&[true; 12]), [Pause { start: 0, end: 12 }]);
    }

    #[test]
    fn tiny_clips_are_left_alone() {
        let samples = voiced(0.09);
        assert_eq!(crop(&samples, 10.0), samples);
    }

    #[test]
    fn short_clip_ending_in_silence_is_kept_whole() {
        let samples = [voiced(2.0), silence(0.4)].concat();
        assert_eq!(crop(&samples, 10.0), samples);
    }

    #[test]
    fn short_clip_is_cut_at_a_late_pause() {
        let samples = [voiced(3.0), silence(0.5), voiced(0.3)].concat();
        let out = crop(&samples, 10.0);
        assert_eq!(out.len(), 76_200);
        assert_eq!(out[..], samples[..76_200]);
    }

    #[test]
    fn short_clip_without_a_pause_gets_a_fade_and_room_tone() {
        let samples = pulsed(2.0);
        let out = crop(&samples, 10.0);
        assert_eq!(out.len(), samples.len() + TONE_SAMPLES);
        let faded = samples.len() - 480;
        assert_eq!(out[..faded], samples[..faded]);
        assert_eq!(out[samples.len() - 1], 0.0);
        let tone = &out[samples.len()..];
        let level = (tone.iter().map(|x| x * x).sum::<f32>() / tone.len() as f32).sqrt();
        assert!((level - 0.0354).abs() < 0.003, "{level}");
    }

    #[test]
    fn long_clip_prefers_the_first_pause_after_the_target() {
        let parts = [
            voiced(4.0),
            silence(0.6),
            voiced(2.0),
            silence(0.6),
            voiced(3.0),
        ];
        assert_eq!(crop(&parts.concat(), 5.0).len(), 162_600);
    }

    #[test]
    fn long_clip_falls_back_to_the_last_pause_before_the_target() {
        let parts = [
            voiced(2.0),
            silence(0.5),
            voiced(1.0),
            silence(0.5),
            voiced(3.0),
        ];
        assert_eq!(crop(&parts.concat(), 6.0).len(), 88_200);
    }

    #[test]
    fn long_clip_without_pauses_is_cut_at_the_target_with_room_tone() {
        let out = crop(&pulsed(12.0), 5.0);
        assert_eq!(out.len(), 120_000 + TONE_SAMPLES);
        assert_eq!(out[119_999], 0.0);
    }

    #[test]
    fn a_clip_with_no_dynamics_counts_as_one_long_pause() {
        assert_eq!(crop(&voiced(12.0), 5.0).len(), 4200);
    }

    #[test]
    fn room_tone_is_reproducible() {
        let samples = pulsed(12.0);
        assert_eq!(crop(&samples, 5.0), crop(&samples, 5.0));
    }

    #[test]
    fn parity_voice_crops() {
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let seconds = fixture.meta()["voice_seconds"].as_f64().unwrap();
            let out = crop(&fixture.floats("input"), seconds);
            let expected = fixture.floats("cropped");
            println!(
                "parity {name} crop: {} of {} samples",
                out.len(),
                expected.len()
            );
            assert_eq!(out, expected);
        }
    }
}
