use anyhow::Result;
use candle_core::{Device, Tensor};

use crate::settings::VoiceprintSettings;
use crate::signal::mel::{Energy, MelBands, MelFrames, MelScale, MelSpectrogram};
use crate::signal::spectrum::Stft;

const FRAME_NORM_EPS: f64 = 1e-5;

pub struct Features {
    mel: MelSpectrogram,
    log_floor: f64,
}

impl Features {
    pub fn new(settings: &VoiceprintSettings) -> Self {
        let stft = Stft::new(settings.fft_size, settings.window, settings.hop);
        Self {
            mel: MelSpectrogram::new(stft, bands(settings), Energy::Power),
            log_floor: settings.log_floor,
        }
    }

    pub fn min_samples(&self) -> usize {
        self.mel.min_samples()
    }

    pub fn extract(&self, audio: &[f32]) -> Result<Tensor> {
        let floor = self.log_floor;
        let frames = self.mel.compute(audio, self.mel.frame_count(audio.len()));
        let leveled = standardize_frames(frames.map(|power| power.max(floor).ln()));
        let shape = (1, leveled.bands, leveled.frames);
        Ok(Tensor::from_vec(leveled.to_f32(), shape, &Device::Cpu)?)
    }

    #[cfg(test)]
    pub fn mel(&self) -> &MelSpectrogram {
        &self.mel
    }
}

pub fn bands(settings: &VoiceprintSettings) -> MelBands {
    MelBands {
        sample_rate: settings.sample_rate,
        count: settings.mel_bins,
        low_hz: settings.low_hz,
        high_hz: settings.high_hz,
        scale: MelScale::Slaney,
        equal_area: true,
    }
}

fn standardize_frames(mut mel: MelFrames) -> MelFrames {
    let (bands, frames) = (mel.bands, mel.frames);
    for frame in 0..frames {
        let column = || (0..bands).map(|band| band * frames + frame);
        let mean = column().map(|i| mel.values[i]).sum::<f64>() / bands as f64;
        let variance = column()
            .map(|i| (mel.values[i] - mean).powi(2))
            .sum::<f64>()
            / bands as f64;
        let scale = (variance + FRAME_NORM_EPS).sqrt().recip();
        for index in column() {
            mel.values[index] = (mel.values[index] - mean) * scale;
        }
    }
    mel
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_frame_is_standardized_across_bands() {
        let mel = MelFrames {
            bands: 2,
            frames: 3,
            values: vec![1.0, 10.0, 5.0, 3.0, 30.0, 5.0],
        };
        let out = standardize_frames(mel).values;
        let unit = 1.0 / (1.0f64 + FRAME_NORM_EPS).sqrt();
        assert!((out[0] + unit).abs() < 1e-12 && (out[3] - unit).abs() < 1e-12);
        assert!((out[1] + 10.0 / (100.0 + FRAME_NORM_EPS).sqrt()).abs() < 1e-12);
        assert_eq!((out[2], out[5]), (0.0, 0.0));
    }
}
