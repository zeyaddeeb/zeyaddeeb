use super::grid::{linspace, seconds_to_samples};
use super::loudness::{block_levels, quantile};

const BLOCK_SECONDS: f64 = 0.010;
const ABSOLUTE_THRESHOLD_DB: f64 = -45.0;
const OVER_FLOOR_DB: f64 = 15.0;
const FLOOR_QUANTILE: f32 = 0.1;
const MIN_BLOCKS_FOR_FLOOR: usize = 30;
const ONSET_WINDOW: usize = 6;
const ONSET_HITS: usize = 5;
const MIN_LEAD_SECONDS: f64 = 0.02;
const TRAIL_SECONDS: f64 = 0.30;
const JOIN_FADE_SECONDS: f64 = 0.01;

#[derive(Debug, Clone, Copy)]
pub struct Lead {
    pub keep_seconds: f64,
    pub skip_seconds: f64,
}

impl Lead {
    pub const OPENING: Self = Self {
        keep_seconds: 0.08,
        skip_seconds: 0.0,
    };
    pub const CONTINUATION: Self = Self {
        keep_seconds: 0.30,
        skip_seconds: 0.10,
    };
}

struct Activity {
    block: usize,
    loud: Vec<bool>,
}

impl Activity {
    fn of(samples: &[f32], sample_rate: u32) -> Self {
        let block = seconds_to_samples(BLOCK_SECONDS, sample_rate);
        let levels = block_levels(samples, block);
        let threshold = threshold(&levels);
        Self {
            block,
            loud: levels.iter().map(|level| *level > threshold).collect(),
        }
    }

    fn onset(&self) -> Option<usize> {
        self.loud
            .windows(ONSET_WINDOW)
            .position(|window| window.iter().filter(|loud| **loud).count() >= ONSET_HITS)
            .map(|index| index * self.block)
    }

    fn last_loud_end(&self) -> Option<usize> {
        self.loud
            .iter()
            .rposition(|loud| *loud)
            .map(|index| (index + 1) * self.block)
    }
}

fn threshold(levels: &[f32]) -> f32 {
    let absolute = 10f64.powf(ABSOLUTE_THRESHOLD_DB / 20.0);
    if levels.len() < MIN_BLOCKS_FOR_FLOOR {
        return absolute as f32;
    }
    let floor = f64::from(quantile(levels, FLOOR_QUANTILE));
    absolute.max(floor * 10f64.powf(OVER_FLOOR_DB / 20.0)) as f32
}

pub fn speech_onset(samples: &[f32], sample_rate: u32) -> Option<usize> {
    Activity::of(samples, sample_rate).onset()
}

pub fn trim_lead(samples: &[f32], sample_rate: u32, lead: Lead) -> &[f32] {
    let Some(onset) = speech_onset(samples, sample_rate) else {
        return samples;
    };
    let keep = seconds_to_samples(lead.keep_seconds, sample_rate);
    let skip = seconds_to_samples(lead.skip_seconds, sample_rate);
    let latest = onset.saturating_sub(seconds_to_samples(MIN_LEAD_SECONDS, sample_rate));
    let cut = onset.saturating_sub(keep).max(skip).min(latest);
    &samples[cut..]
}

pub fn trim_trail(samples: &[f32], sample_rate: u32) -> &[f32] {
    let Some(end) = Activity::of(samples, sample_rate).last_loud_end() else {
        return samples;
    };
    let trail = seconds_to_samples(TRAIL_SECONDS, sample_rate);
    &samples[..samples.len().min(end + trail)]
}

#[derive(Debug, Clone, Copy)]
pub struct Fade {
    pub rise: bool,
    pub fall: bool,
    pub seconds: f64,
}

impl Fade {
    pub fn apply(self, samples: &mut [f32], sample_rate: u32) {
        let length = seconds_to_samples(self.seconds, sample_rate);
        if samples.len() <= 2 * length {
            return;
        }
        let ramp = linspace(0.0, 1.0, length);
        if self.rise {
            scale(samples[..length].iter_mut(), &ramp);
        }
        if self.fall {
            scale(samples.iter_mut().rev(), &ramp);
        }
    }
}

fn scale<'a>(samples: impl Iterator<Item = &'a mut f32>, ramp: &[f32]) {
    for (sample, weight) in samples.zip(ramp) {
        *sample *= weight;
    }
}

pub fn join(parts: &[Vec<f32>], sample_rate: u32) -> Vec<f32> {
    let mut joined = Vec::with_capacity(parts.iter().map(Vec::len).sum());
    for (index, part) in parts.iter().enumerate() {
        let mut part = part.clone();
        let fade = Fade {
            rise: index > 0,
            fall: index + 1 < parts.len(),
            seconds: JOIN_FADE_SECONDS,
        };
        fade.apply(&mut part, sample_rate);
        joined.extend(part);
    }
    joined
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 24_000;

    fn tone(amplitude: f32, seconds: f64) -> Vec<f32> {
        (0..seconds_to_samples(seconds, RATE))
            .map(|i| amplitude * (std::f32::consts::TAU * 200.0 * i as f32 / RATE as f32).sin())
            .collect()
    }

    fn padded(lead: f64, body: f64, trail: f64) -> Vec<f32> {
        [tone(0.0, lead), tone(0.3, body), tone(0.0, trail)].concat()
    }

    #[test]
    fn threshold_is_absolute_for_short_clips_and_floor_relative_for_long_ones() {
        assert!((threshold(&[0.1; 29]) - 0.005_623_413).abs() < 1e-9);
        let mut levels = vec![0.01; 30];
        levels[10..].fill(0.5);
        assert!((threshold(&levels) - 0.056_234_13).abs() < 1e-7);
        assert!((threshold(&[0.0; 40]) - 0.005_623_413).abs() < 1e-9);
    }

    #[test]
    fn onset_is_the_first_mostly_loud_run_of_blocks() {
        let samples = padded(0.5, 1.0, 0.5);
        assert_eq!(speech_onset(&samples, RATE), Some(11_760));
        assert_eq!(speech_onset(&tone(0.0, 1.0), RATE), None);
        assert_eq!(speech_onset(&tone(0.3, 0.05), RATE), None);
    }

    #[test]
    fn onset_tolerates_one_quiet_block_in_six() {
        let mut samples = padded(0.2, 1.0, 0.2);
        samples[5040..5280].fill(0.0);
        assert_eq!(speech_onset(&samples, RATE), Some(4800));
    }

    #[test]
    fn opening_keeps_eighty_milliseconds_before_the_onset() {
        let samples = padded(0.5, 1.0, 0.5);
        assert_eq!(
            trim_lead(&samples, RATE, Lead::OPENING).len(),
            samples.len() - 9840
        );
        let early = padded(0.05, 1.0, 0.5);
        assert_eq!(trim_lead(&early, RATE, Lead::OPENING).len(), early.len());
    }

    #[test]
    fn continuation_skips_a_tenth_of_a_second_but_never_into_speech() {
        let samples = padded(0.5, 1.0, 0.5);
        assert_eq!(
            trim_lead(&samples, RATE, Lead::CONTINUATION).len(),
            samples.len() - 4560
        );
        let tight = padded(0.2, 1.0, 0.5);
        assert_eq!(
            trim_lead(&tight, RATE, Lead::CONTINUATION).len(),
            tight.len() - 2400
        );
        let abrupt = padded(0.05, 1.0, 0.5);
        assert_eq!(
            trim_lead(&abrupt, RATE, Lead::CONTINUATION).len(),
            abrupt.len() - 480
        );
    }

    #[test]
    fn trail_keeps_three_hundred_milliseconds_after_the_last_sound() {
        let samples = padded(0.5, 1.0, 0.5);
        assert_eq!(trim_trail(&samples, RATE).len(), 36_000 + 7200);
        let short = padded(0.5, 1.0, 0.1);
        assert_eq!(trim_trail(&short, RATE).len(), short.len());
        let silent = tone(0.0, 1.0);
        assert_eq!(trim_trail(&silent, RATE).len(), silent.len());
    }

    #[test]
    fn fades_ramp_linearly_and_skip_tiny_clips() {
        let fade = Fade {
            rise: true,
            fall: true,
            seconds: 0.01,
        };
        let mut samples = vec![1.0; 1000];
        fade.apply(&mut samples, RATE);
        assert_eq!((samples[0], samples[999]), (0.0, 0.0));
        assert_eq!((samples[239], samples[760]), (1.0, 1.0));
        assert!((samples[1] - 1.0 / 239.0).abs() < 1e-7);
        assert_eq!(samples[998], samples[1]);
        assert_eq!(samples[500], 1.0);
        let mut tiny = vec![1.0; 480];
        fade.apply(&mut tiny, RATE);
        assert_eq!(tiny, vec![1.0; 480]);
    }

    #[test]
    fn joins_fade_only_the_inner_edges() {
        let parts = vec![vec![1.0; 1000], vec![1.0; 1000], vec![1.0; 1000]];
        let joined = join(&parts, RATE);
        assert_eq!(joined.len(), 3000);
        assert_eq!((joined[0], joined[2999]), (1.0, 1.0));
        assert_eq!(
            (joined[999], joined[1000], joined[1999], joined[2000]),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(join(&[vec![1.0; 1000]], RATE), vec![1.0; 1000]);
        assert!(join(&[], RATE).is_empty());
    }
}
