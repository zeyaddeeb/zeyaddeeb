use std::f64::consts::PI;

const LOWPASS_FILTER_WIDTH: f64 = 6.0;
const ROLLOFF: f64 = 0.99;

pub struct SincResampler {
    source_step: usize,
    target_step: usize,
    width: usize,
    kernels: Vec<Vec<f32>>,
}

impl SincResampler {
    pub fn new(source_rate: u32, target_rate: u32) -> Self {
        let divisor = gcd(source_rate, target_rate);
        let source_step = (source_rate / divisor) as usize;
        let target_step = (target_rate / divisor) as usize;
        let cutoff = source_step.min(target_step) as f64 * ROLLOFF;
        let width = (LOWPASS_FILTER_WIDTH * source_step as f64 / cutoff).ceil() as usize;
        let kernels = (0..target_step)
            .map(|phase| kernel(phase, source_step, target_step, width, cutoff))
            .collect();
        Self {
            source_step,
            target_step,
            width,
            kernels,
        }
    }

    pub fn apply(&self, samples: &[f32]) -> Vec<f32> {
        let padded = self.pad(samples);
        let blocks = samples.len() / self.source_step + 1;
        let target_len = (self.target_step * samples.len()).div_ceil(self.source_step);
        let mut output = Vec::with_capacity(blocks * self.target_step);
        for block in 0..blocks {
            let window = &padded[block * self.source_step..];
            output.extend(self.kernels.iter().map(|kernel| convolve(kernel, window)));
        }
        output.truncate(target_len);
        output
    }

    fn pad(&self, samples: &[f32]) -> Vec<f32> {
        let mut padded = vec![0.0; samples.len() + 2 * self.width + self.source_step];
        padded[self.width..self.width + samples.len()].copy_from_slice(samples);
        padded
    }
}

pub fn resample(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate {
        return samples.to_vec();
    }
    SincResampler::new(source_rate, target_rate).apply(samples)
}

fn kernel(
    phase: usize,
    source_step: usize,
    target_step: usize,
    width: usize,
    cutoff: f64,
) -> Vec<f32> {
    let shift = f64::from(-(phase as f32) / target_step as f32);
    let scale = cutoff / source_step as f64;
    (0..2 * width + source_step)
        .map(|tap| {
            let offset = (tap as f64 - width as f64) / source_step as f64;
            let t = ((shift + offset) * cutoff).clamp(-LOWPASS_FILTER_WIDTH, LOWPASS_FILTER_WIDTH);
            let window = (t * PI / LOWPASS_FILTER_WIDTH / 2.0).cos().powi(2);
            (sinc(t * PI) * window * scale) as f32
        })
        .collect()
}

fn sinc(x: f64) -> f64 {
    if x == 0.0 {
        1.0
    } else {
        x.sin() / x
    }
}

fn convolve(kernel: &[f32], window: &[f32]) -> f32 {
    kernel
        .iter()
        .zip(window)
        .map(|(k, x)| f64::from(*k) * f64::from(*x))
        .sum::<f64>() as f32
}

fn gcd(a: u32, b: u32) -> u32 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};
    use std::f64::consts::TAU;

    fn tone(hz: f64, rate: u32, samples: usize) -> Vec<f32> {
        (0..samples)
            .map(|i| (TAU * hz * i as f64 / f64::from(rate)).sin() as f32)
            .collect()
    }

    #[test]
    fn same_rate_is_identity() {
        let samples = tone(440.0, 24_000, 100);
        assert_eq!(resample(&samples, 24_000, 24_000), samples);
    }

    #[test]
    fn output_length_is_the_rounded_up_ratio() {
        assert_eq!(resample(&vec![0.0; 24_000], 24_000, 16_000).len(), 16_000);
        assert_eq!(resample(&vec![0.0; 1000], 24_000, 16_000).len(), 667);
        assert_eq!(resample(&vec![0.0; 1000], 44_100, 24_000).len(), 545);
        assert_eq!(resample(&vec![0.0; 1000], 16_000, 24_000).len(), 1500);
    }

    #[test]
    fn kernel_shape_matches_torchaudio() {
        let down = SincResampler::new(24_000, 16_000);
        assert_eq!((down.source_step, down.target_step, down.width), (3, 2, 10));
        assert_eq!(down.kernels[0].len(), 23);
        let spots = [
            (0, 10, 0.66),
            (0, 9, 0.270_691_8),
            (0, 11, 0.270_691_8),
            (1, 11, 0.543_885_6),
            (1, 12, 0.543_885_6),
            (1, 0, 0.0),
        ];
        for (phase, tap, expected) in spots {
            let actual = down.kernels[phase][tap];
            assert!((actual - expected).abs() < 1e-6, "{phase} {tap} {actual}");
        }
    }

    #[test]
    fn tone_survives_downsampling() {
        let source = tone(1000.0, 24_000, 4800);
        let expected = tone(1000.0, 16_000, 3200);
        let actual = resample(&source, 24_000, 16_000);
        let worst = actual[200..3000]
            .iter()
            .zip(&expected[200..3000])
            .map(|(a, e)| (a - e).abs())
            .fold(0.0f32, f32::max);
        assert!(worst < 2e-3, "{worst}");
    }

    #[test]
    fn tone_above_new_nyquist_is_removed() {
        let source = tone(11_000.0, 24_000, 4800);
        let actual = resample(&source, 24_000, 16_000);
        let worst = actual[200..3000].iter().fold(0.0f32, |m, x| m.max(x.abs()));
        assert!(worst < 5e-3, "{worst}");
    }

    #[test]
    fn parity_resample() {
        let Some(fixture) = Fixture::load("resample") else {
            return;
        };
        let input = fixture.floats("input");
        for rate in [8000, 16_000, 22_050, 32_000, 44_100, 48_000] {
            let expected = fixture.floats(&format!("from_{rate}"));
            let actual = resample(&input, rate, 24_000);
            assert_eq!(actual.len(), expected.len());
            let error = testing::compare(&format!("resample {rate}->24000"), &actual, &expected);
            assert!(error.max_abs < 1e-6, "{error:?}");
        }
        let expected = fixture.floats("to_16000");
        let actual = resample(&input, 24_000, 16_000);
        let error = testing::compare("resample 24000->16000", &actual, &expected);
        assert!(error.max_abs < 1e-6, "{error:?}");
    }
}
