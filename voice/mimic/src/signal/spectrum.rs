use std::sync::Arc;

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

use super::window::{centered, hann_periodic};

pub struct Stft {
    n_fft: usize,
    hop: usize,
    window: Vec<f64>,
    fft: Arc<dyn Fft<f64>>,
}

pub struct Spectrum {
    pub bins: usize,
    pub values: Vec<Complex<f64>>,
}

impl Spectrum {
    pub fn frame(&self, index: usize) -> &[Complex<f64>] {
        &self.values[index * self.bins..(index + 1) * self.bins]
    }
}

impl Stft {
    pub fn new(n_fft: usize, win_length: usize, hop: usize) -> Self {
        Self {
            n_fft,
            hop,
            window: centered(&hann_periodic(win_length), n_fft),
            fft: FftPlanner::new().plan_fft_forward(n_fft),
        }
    }

    pub fn bins(&self) -> usize {
        self.n_fft / 2 + 1
    }

    pub fn min_samples(&self) -> usize {
        self.n_fft / 2 + 1
    }

    pub fn frame_count(&self, samples: usize) -> usize {
        samples / self.hop + 1
    }

    pub fn transform(&self, samples: &[f32], frames: usize) -> Spectrum {
        let bins = self.bins();
        let mut values = Vec::with_capacity(frames * bins);
        let mut buffer = vec![Complex::default(); self.n_fft];
        let mut scratch = vec![Complex::default(); self.fft.get_inplace_scratch_len()];
        for frame in 0..frames {
            self.load_frame(samples, frame, &mut buffer);
            self.fft.process_with_scratch(&mut buffer, &mut scratch);
            values.extend_from_slice(&buffer[..bins]);
        }
        Spectrum { bins, values }
    }

    fn load_frame(&self, samples: &[f32], frame: usize, buffer: &mut [Complex<f64>]) {
        let start = (frame * self.hop) as isize - (self.n_fft / 2) as isize;
        for (offset, (slot, weight)) in buffer.iter_mut().zip(&self.window).enumerate() {
            let sample = samples[reflect(start + offset as isize, samples.len())];
            *slot = Complex::new(f64::from(sample) * weight, 0.0);
        }
    }
}

fn reflect(index: isize, len: usize) -> usize {
    if len <= 1 {
        return 0;
    }
    let last = len as isize - 1;
    let mut index = index;
    while index < 0 || index > last {
        index = if index < 0 { -index } else { 2 * last - index };
    }
    index as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::TAU;

    #[test]
    fn reflect_mirrors_without_repeating_the_edge() {
        let mapped: Vec<usize> = (-3..8).map(|i| reflect(i, 5)).collect();
        assert_eq!(mapped, [3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1]);
    }

    #[test]
    fn frame_count_matches_centered_stft() {
        let stft = Stft::new(1024, 1024, 256);
        assert_eq!(stft.frame_count(24_000), 94);
        assert_eq!(stft.frame_count(255), 1);
        assert_eq!(stft.bins(), 513);
    }

    #[test]
    fn sine_energy_lands_in_its_bin() {
        let n_fft = 64;
        let stft = Stft::new(n_fft, n_fft, 16);
        let bin = 5;
        let samples: Vec<f32> = (0..512)
            .map(|i| (TAU * bin as f64 * i as f64 / n_fft as f64).sin() as f32)
            .collect();
        let frames = stft.frame_count(samples.len());
        let spectrum = stft.transform(&samples, frames);
        let frame = spectrum.frame(frames / 2);
        let peak = (0..spectrum.bins)
            .max_by(|&a, &b| frame[a].norm().total_cmp(&frame[b].norm()))
            .unwrap();
        assert_eq!(peak, bin);
        assert!((frame[bin].norm() - n_fft as f64 / 4.0).abs() < 1e-3);
        assert!(frame[bin + 3].norm() < 1e-3);
    }

    #[test]
    fn shorter_window_is_centered_in_the_frame() {
        let stft = Stft::new(16, 4, 4);
        assert_eq!(stft.window.iter().filter(|w| **w > 0.0).count(), 3);
        assert_eq!(stft.window[6], 0.0);
        assert_eq!(stft.window[8], 1.0);
    }
}
