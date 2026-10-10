use anyhow::Result;
use candle_core::{Device, Tensor};

use crate::settings::UnitSettings;
use crate::signal::mel::{Energy, MelBands, MelScale, MelSpectrogram};
use crate::signal::spectrum::Stft;

const POWER_FLOOR: f64 = 1e-10;
const DYNAMIC_RANGE: f64 = 8.0;
const CONTEXT_FRAMES: usize = 2;

pub struct Features {
    mel: MelSpectrogram,
    sample_rate: u32,
    fft_size: usize,
    hop: usize,
}

impl Features {
    pub fn new(settings: &UnitSettings) -> Self {
        let stft = Stft::new(settings.fft_size, settings.fft_size, settings.hop);
        Self {
            mel: MelSpectrogram::new(stft, bands(settings), Energy::Power),
            sample_rate: settings.sample_rate,
            fft_size: settings.fft_size,
            hop: settings.hop,
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn extract(&self, audio: &[f32]) -> Result<Tensor> {
        let frames = audio.len().div_ceil(self.hop) + CONTEXT_FRAMES;
        let mut padded = audio.to_vec();
        padded.resize(audio.len() + self.fft_size, 0.0);
        let log = self
            .mel
            .compute(&padded, frames)
            .map(|power| power.max(POWER_FLOOR).log10());
        let floor = log.peak() - DYNAMIC_RANGE;
        let scaled = log.map(|value| (value.max(floor) + 4.0) / 4.0);
        let shape = (1, scaled.bands, scaled.frames);
        Ok(Tensor::from_vec(scaled.to_f32(), shape, &Device::Cpu)?)
    }

    #[cfg(test)]
    pub fn mel(&self) -> &MelSpectrogram {
        &self.mel
    }
}

pub fn bands(settings: &UnitSettings) -> MelBands {
    MelBands {
        sample_rate: settings.sample_rate,
        count: settings.mel_bins,
        low_hz: 0.0,
        high_hz: f64::from(settings.sample_rate / 2),
        scale: MelScale::Slaney,
        equal_area: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn features() -> Features {
        Features::new(&UnitSettings {
            sample_rate: 16_000,
            mel_bins: 80,
            fft_size: 400,
            hop: 160,
            width: 8,
            depth: 1,
            heads: 2,
            feedforward: 16,
            max_positions: 10,
            levels: vec![2],
        })
    }

    #[test]
    fn frame_count_is_one_per_hop_plus_context() {
        let features = features();
        assert_eq!(
            features.extract(&vec![0.1; 1600]).unwrap().dims(),
            [1, 80, 12]
        );
        assert_eq!(
            features.extract(&vec![0.1; 1601]).unwrap().dims(),
            [1, 80, 13]
        );
    }

    #[test]
    fn values_span_at_most_the_dynamic_range() {
        let audio: Vec<f32> = (0..3200).map(|i| ((i as f32) * 0.3).sin() * 0.5).collect();
        let values: Vec<f32> = features()
            .extract(&audio)
            .unwrap()
            .flatten_all()
            .unwrap()
            .to_vec1()
            .unwrap();
        let peak = values.iter().copied().fold(f32::MIN, f32::max);
        let low = values.iter().copied().fold(f32::MAX, f32::min);
        assert!(peak - low <= 2.0 + 1e-6);
        assert!((low - (peak - 2.0)).abs() < 1e-6);
    }
}
