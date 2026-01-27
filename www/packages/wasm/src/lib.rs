use rustfft::{num_complex::Complex, FftPlanner};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct AudioProcessor {
    fft_size: usize,
    planner: FftPlanner<f32>,
    buffer: Vec<Complex<f32>>,
    window: Vec<f32>,
}

#[wasm_bindgen]
impl AudioProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(fft_size: usize) -> AudioProcessor {
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (fft_size - 1) as f32).cos())
            })
            .collect();

        AudioProcessor {
            fft_size,
            planner: FftPlanner::new(),
            buffer: vec![Complex::new(0.0, 0.0); fft_size],
            window,
        }
    }

    #[wasm_bindgen]
    pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        let len = samples.len().min(self.fft_size);

        for i in 0..self.fft_size {
            if i < len {
                self.buffer[i] = Complex::new(samples[i] * self.window[i], 0.0);
            } else {
                self.buffer[i] = Complex::new(0.0, 0.0);
            }
        }

        let fft = self.planner.plan_fft_forward(self.fft_size);
        fft.process(&mut self.buffer);

        let half_size = self.fft_size / 2;
        let mut magnitudes = vec![0.0f32; half_size];

        for i in 0..half_size {
            let magnitude = self.buffer[i].norm();
            magnitudes[i] = 20.0 * (magnitude / self.fft_size as f32).max(1e-10).log10();
        }

        magnitudes
    }

    #[wasm_bindgen]
    pub fn get_frequency_bins(&mut self, samples: &[f32], num_bins: usize) -> Vec<f32> {
        let magnitudes = self.process(samples);
        let bin_size = magnitudes.len() / num_bins;

        let mut bins = vec![0.0f32; num_bins];

        for i in 0..num_bins {
            let start = i * bin_size;
            let end = ((i + 1) * bin_size).min(magnitudes.len());

            let sum: f32 = magnitudes[start..end].iter().sum();
            bins[i] = sum / (end - start) as f32;
        }

        bins
    }

    #[wasm_bindgen]
    pub fn normalize_for_visualization(&self, data: &[f32], min_db: f32, max_db: f32) -> Vec<f32> {
        data.iter()
            .map(|&val| {
                let clamped = val.clamp(min_db, max_db);
                (clamped - min_db) / (max_db - min_db)
            })
            .collect()
    }
}

#[wasm_bindgen]
pub fn lerp_array(current: &[f32], target: &[f32], factor: f32) -> Vec<f32> {
    current
        .iter()
        .zip(target.iter())
        .map(|(&c, &t)| c + (t - c) * factor)
        .collect()
}

#[wasm_bindgen]
pub fn smooth_frequency_data(current: &[f32], previous: &[f32], smoothing: f32) -> Vec<f32> {
    if previous.is_empty() {
        return current.to_vec();
    }

    current
        .iter()
        .zip(previous.iter())
        .map(|(&c, &p)| p * smoothing + c * (1.0 - smoothing))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn _add() {
        assert_eq!(add(2, 2), 4);
    }

    #[test]
    fn test_audio_processor() {
        let mut processor = AudioProcessor::new(1024);
        let samples: Vec<f32> = (0..1024).map(|i| (i as f32 * 0.1).sin()).collect();
        let result = processor.process(&samples);
        assert_eq!(result.len(), 512);
    }

    #[test]
    fn test_frequency_bins() {
        let mut processor = AudioProcessor::new(1024);
        let samples: Vec<f32> = (0..1024).map(|i| (i as f32 * 0.1).sin()).collect();
        let bins = processor.get_frequency_bins(&samples, 32);
        assert_eq!(bins.len(), 32);
    }
}
