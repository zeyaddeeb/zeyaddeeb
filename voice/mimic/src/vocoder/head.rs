use anyhow::Result;
use candle_core::Tensor;
use candle_nn::{Linear, Module};
use rustfft::num_complex::Complex;

use crate::signal::inverse::Istft;

pub struct WaveHead {
    pub projection: Linear,
    pub istft: Istft,
    pub log_ceiling: f32,
}

impl WaveHead {
    pub fn render(&self, features: &Tensor) -> Result<Vec<f32>> {
        Ok(self.istft.synthesize(&self.spectrum(features)?))
    }

    pub fn spectrum(&self, features: &Tensor) -> Result<Vec<Complex<f64>>> {
        let polar: Vec<f32> = self
            .projection
            .forward(features)?
            .flatten_all()?
            .to_vec1()?;
        let bins = self.istft.bins();
        Ok(polar
            .chunks_exact(2 * bins)
            .flat_map(|frame| {
                let (log_magnitudes, phases) = frame.split_at(bins);
                log_magnitudes
                    .iter()
                    .zip(phases)
                    .map(|(log_magnitude, phase)| self.bin(*log_magnitude, *phase))
            })
            .collect())
    }

    fn bin(&self, log_magnitude: f32, phase: f32) -> Complex<f64> {
        let magnitude = f64::from(log_magnitude.min(self.log_ceiling)).exp();
        Complex::from_polar(magnitude, f64::from(phase))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    fn head(bins: usize) -> WaveHead {
        let width = 2 * bins;
        WaveHead {
            projection: Linear::new(Tensor::eye(width, DType::F32, &Device::Cpu).unwrap(), None),
            istft: Istft::new(2 * (bins - 1), (bins - 1) / 2),
            log_ceiling: 100f32.ln(),
        }
    }

    #[test]
    fn features_split_into_log_magnitude_and_phase() {
        let head = head(3);
        let frame = [
            0.0f32,
            1.0,
            50.0,
            0.0,
            std::f32::consts::FRAC_PI_2,
            std::f32::consts::PI,
        ];
        let features = Tensor::new(&[[frame]], &Device::Cpu).unwrap();
        let spectrum = head.spectrum(&features).unwrap();
        assert_eq!(spectrum.len(), 3);
        assert!((spectrum[0].re - 1.0).abs() < 1e-12 && spectrum[0].im.abs() < 1e-12);
        assert!(spectrum[1].re.abs() < 1e-6 && (spectrum[1].im - std::f64::consts::E).abs() < 1e-6);
        assert!((spectrum[2].re + 100.0).abs() < 1e-4);
    }

    #[test]
    fn rendered_length_is_one_hop_per_frame_after_the_first() {
        let head = head(9);
        let features = Tensor::zeros((1, 6, 18), DType::F32, &Device::Cpu).unwrap();
        assert_eq!(head.render(&features).unwrap().len(), 5 * 4);
    }
}
