use std::sync::Arc;

use rustfft::{num_complex::Complex32, Fft, FftPlanner};

use crate::audio::RATE;

pub const BANDS: usize = 64;

const WINDOW: usize = 1_024;
const HOP: usize = 256;
const LOWEST_HZ: f32 = 90.0;
const HIGHEST_HZ: f32 = 11_000.0;
const QUIET_FRAME: f32 = 1e-3;
const FLOOR_DB: f32 = -54.0;

pub struct Analyzer {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    edges: Vec<usize>,
}

impl Analyzer {
    pub fn new() -> Self {
        Self {
            fft: FftPlanner::new().plan_fft_forward(WINDOW),
            window: (0..WINDOW)
                .map(|n| 0.5 - 0.5 * (std::f32::consts::TAU * n as f32 / WINDOW as f32).cos())
                .collect(),
            edges: edges(),
        }
    }

    pub fn profile(&self, samples: &[f32]) -> Vec<u8> {
        let frames: Vec<Vec<f32>> = samples
            .windows(WINDOW)
            .step_by(HOP)
            .map(|frame| self.power(frame))
            .collect();
        let loudest = frames
            .iter()
            .map(|frame| frame.iter().sum::<f32>())
            .fold(0.0, f32::max);
        let voiced: Vec<&Vec<f32>> = frames
            .iter()
            .filter(|frame| frame.iter().sum::<f32>() > loudest * QUIET_FRAME)
            .collect();

        if voiced.is_empty() {
            return vec![0; BANDS];
        }

        let bands: Vec<f32> = self
            .edges
            .windows(2)
            .map(|edge| {
                let width = (edge[1] - edge[0]) as f32;

                voiced
                    .iter()
                    .map(|frame| frame[edge[0]..edge[1]].iter().sum::<f32>() / width)
                    .sum::<f32>()
                    / voiced.len() as f32
            })
            .collect();

        quantize(&bands)
    }

    fn power(&self, frame: &[f32]) -> Vec<f32> {
        let mut bins: Vec<Complex32> = frame
            .iter()
            .zip(&self.window)
            .map(|(sample, weight)| Complex32::new(sample * weight, 0.0))
            .collect();

        self.fft.process(&mut bins);

        bins[..WINDOW / 2 + 1]
            .iter()
            .map(|bin| bin.norm_sqr())
            .collect()
    }
}

fn edges() -> Vec<usize> {
    let bin_hz = RATE as f32 / WINDOW as f32;
    let (low, high) = (to_mel(LOWEST_HZ), to_mel(HIGHEST_HZ));
    let mut edges: Vec<usize> = (0..=BANDS)
        .map(|band| {
            let mel = low + (high - low) * band as f32 / BANDS as f32;

            (to_hz(mel) / bin_hz).round() as usize
        })
        .collect();

    for index in 1..edges.len() {
        edges[index] = edges[index].max(edges[index - 1] + 1);
    }

    edges
}

fn to_mel(hz: f32) -> f32 {
    2_595.0 * (1.0 + hz / 700.0).log10()
}

fn to_hz(mel: f32) -> f32 {
    700.0 * (10f32.powf(mel / 2_595.0) - 1.0)
}

fn quantize(bands: &[f32]) -> Vec<u8> {
    let peak = bands.iter().copied().fold(f32::MIN_POSITIVE, f32::max);

    bands
        .iter()
        .map(|band| {
            let db = 10.0 * (band.max(f32::MIN_POSITIVE) / peak).log10();

            ((1.0 - db / FLOOR_DB).clamp(0.0, 1.0) * 255.0).round() as u8
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(hz: f32) -> Vec<f32> {
        (0..RATE as usize)
            .map(|n| (std::f32::consts::TAU * hz * n as f32 / RATE as f32).sin() * 0.4)
            .collect()
    }

    fn brightest(profile: &[u8]) -> usize {
        (0..profile.len())
            .max_by_key(|&band| profile[band])
            .unwrap()
    }

    #[test]
    fn every_band_covers_at_least_one_bin() {
        let edges = edges();

        assert_eq!(edges.len(), BANDS + 1);
        assert!(edges.windows(2).all(|edge| edge[1] > edge[0]));
        assert!(*edges.last().unwrap() <= WINDOW / 2 + 1);
    }

    #[test]
    fn a_higher_tone_lights_a_higher_band() {
        let analyzer = Analyzer::new();
        let low = analyzer.profile(&tone(300.0));
        let high = analyzer.profile(&tone(3_000.0));

        assert_eq!(low.len(), BANDS);
        assert_eq!(low[brightest(&low)], 255);
        assert!(brightest(&high) > brightest(&low) + 10);
    }

    #[test]
    fn a_pure_tone_leaves_the_far_bands_dark() {
        let profile = Analyzer::new().profile(&tone(300.0));

        assert!(profile[BANDS - 1] < 8);
    }

    #[test]
    fn silence_is_dark() {
        assert_eq!(
            Analyzer::new().profile(&vec![0.0; RATE as usize]),
            vec![0; BANDS]
        );
    }

    #[test]
    fn level_does_not_change_the_shape() {
        let analyzer = Analyzer::new();
        let loud = tone(700.0);
        let soft: Vec<f32> = loud.iter().map(|sample| sample * 0.05).collect();

        assert_eq!(analyzer.profile(&loud), analyzer.profile(&soft));
    }
}
