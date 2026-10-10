use std::sync::Arc;

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

use super::window::hann_periodic;

pub struct Istft {
    n_fft: usize,
    hop: usize,
    window: Vec<f64>,
    fft: Arc<dyn Fft<f64>>,
}

impl Istft {
    pub fn new(n_fft: usize, hop: usize) -> Self {
        Self {
            n_fft,
            hop,
            window: hann_periodic(n_fft),
            fft: FftPlanner::new().plan_fft_inverse(n_fft),
        }
    }

    pub fn bins(&self) -> usize {
        self.n_fft / 2 + 1
    }

    pub fn synthesize(&self, spectrum: &[Complex<f64>]) -> Vec<f32> {
        let frames = spectrum.len() / self.bins();
        if frames == 0 {
            return Vec::new();
        }
        let (signal, envelope) = self.overlap_add(spectrum, frames);
        let pad = self.n_fft / 2;
        let end = signal.len() - pad;
        signal[pad..end]
            .iter()
            .zip(&envelope[pad..end])
            .map(|(value, weight)| (value / weight) as f32)
            .collect()
    }

    fn overlap_add(&self, spectrum: &[Complex<f64>], frames: usize) -> (Vec<f64>, Vec<f64>) {
        let length = (frames - 1) * self.hop + self.n_fft;
        let mut signal = vec![0.0; length];
        let mut envelope = vec![0.0; length];
        let mut buffer = vec![Complex::default(); self.n_fft];
        let mut scratch = vec![Complex::default(); self.fft.get_inplace_scratch_len()];
        for (frame, bins) in spectrum.chunks_exact(self.bins()).enumerate() {
            self.load_hermitian(bins, &mut buffer);
            self.fft.process_with_scratch(&mut buffer, &mut scratch);
            let start = frame * self.hop;
            for (offset, (value, weight)) in buffer.iter().zip(&self.window).enumerate() {
                signal[start + offset] += value.re / self.n_fft as f64 * weight;
                envelope[start + offset] += weight * weight;
            }
        }
        (signal, envelope)
    }

    fn load_hermitian(&self, bins: &[Complex<f64>], buffer: &mut [Complex<f64>]) {
        buffer[..bins.len()].copy_from_slice(bins);
        for k in 1..self.n_fft - bins.len() + 1 {
            buffer[self.n_fft - k] = bins[k].conj();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Rng;
    use crate::signal::spectrum::Stft;

    #[test]
    fn stft_then_istft_reconstructs_the_signal() {
        let (n_fft, hop) = (1024, 256);
        let samples: Vec<f32> = Rng::seeded(5)
            .normal_vec(hop * 40)
            .iter()
            .map(|x| x * 0.1)
            .collect();
        let stft = Stft::new(n_fft, n_fft, hop);
        let spectrum = stft.transform(&samples, stft.frame_count(samples.len()));
        let restored = Istft::new(n_fft, hop).synthesize(&spectrum.values);
        assert_eq!(restored.len(), samples.len());
        let worst = restored
            .iter()
            .zip(&samples)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0f32, f32::max);
        assert!(worst < 1e-6, "round trip error {worst}");
    }

    #[test]
    fn output_length_is_one_hop_per_frame_after_the_first() {
        let istft = Istft::new(16, 4);
        let frames = 5;
        let spectrum = vec![Complex::new(0.0, 0.0); frames * istft.bins()];
        assert_eq!(istft.synthesize(&spectrum).len(), (frames - 1) * 4);
        assert!(istft.synthesize(&[]).is_empty());
    }

    #[test]
    fn single_bin_becomes_a_cosine() {
        let n_fft = 16;
        let istft = Istft::new(n_fft, 4);
        let mut frame = vec![Complex::new(0.0, 0.0); istft.bins()];
        frame[2] = Complex::new(n_fft as f64 / 2.0, 0.0);
        let mut buffer = vec![Complex::default(); n_fft];
        istft.load_hermitian(&frame, &mut buffer);
        istft.fft.process(&mut buffer);
        for (n, value) in buffer.iter().enumerate() {
            let expected = (std::f64::consts::TAU * 2.0 * n as f64 / n_fft as f64).cos();
            assert!((value.re / n_fft as f64 - expected).abs() < 1e-12);
            assert!(value.im.abs() < 1e-9);
        }
    }
}
