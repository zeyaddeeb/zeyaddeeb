pub mod backbone;
pub mod head;

use anyhow::Result;
use candle_core::{Device, Tensor};

use self::backbone::Backbone;
use self::head::WaveHead;
use crate::settings::{Settings, VocoderSettings};
use crate::signal::mel::{Energy, MelBands, MelScale, MelSpectrogram};
use crate::signal::spectrum::Stft;

const MAGNITUDE_FLOOR: f64 = 1e-7;

pub struct Vocoder {
    pub analysis: MelSpectrogram,
    pub backbone: Backbone,
    pub head: WaveHead,
    pub hop: usize,
}

impl Vocoder {
    pub fn min_samples(&self) -> usize {
        self.analysis.min_samples()
    }

    pub fn mel(&self, audio: &[f32]) -> Result<Tensor> {
        let frames = self.analysis.frame_count(audio.len());
        let log = self
            .analysis
            .compute(audio, frames)
            .map(|magnitude| magnitude.max(MAGNITUDE_FLOOR).ln());
        Ok(Tensor::from_vec(
            log.to_f32(),
            (1, log.bands, log.frames),
            &Device::Cpu,
        )?)
    }

    pub fn render(&self, mel: &Tensor) -> Result<Vec<f32>> {
        self.head.render(&self.backbone.forward(mel)?)
    }
}

pub fn analysis(settings: &Settings) -> MelSpectrogram {
    let vocoder = &settings.vocoder;
    let stft = Stft::new(vocoder.fft_size, vocoder.fft_size, vocoder.hop);
    MelSpectrogram::new(
        stft,
        bands(settings.sample_rate, vocoder),
        Energy::Magnitude,
    )
}

pub fn bands(sample_rate: u32, settings: &VocoderSettings) -> MelBands {
    MelBands {
        sample_rate,
        count: settings.mel_bins,
        low_hz: 0.0,
        high_hz: f64::from(sample_rate / 2),
        scale: MelScale::Htk,
        equal_area: false,
    }
}

#[cfg(test)]
mod tests {
    use crate::testing::{self, Fixture};

    #[test]
    fn parity_prompt_mel() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let mel = mimic
                .models
                .vocoder
                .mel(&fixture.floats("leveled"))
                .unwrap();
            let error = testing::compare_tensors(
                &format!("{name} prompt mel (log magnitude)"),
                &mel,
                &fixture.tensor("mel_raw"),
            );
            assert!(error.relative < 1e-4, "{error:?}");
        }
    }

    #[test]
    fn parity_rendering() {
        let Some(mimic) = testing::mimic() else {
            return;
        };
        let vocoder = &mimic.models.vocoder;
        for name in ["speech_long", "speech_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let mel = fixture.tensor("s0_vocoder_mel");
            let features = vocoder.backbone.forward(&mel).unwrap();
            let error = testing::compare_tensors(
                &format!("{name} vocoder features"),
                &features,
                &fixture.tensor("s0_vocoder_features"),
            );
            assert!(error.relative < 1e-4, "{error:?}");
            let spectrum = vocoder.head.spectrum(&features).unwrap();
            let real: Vec<f32> = spectrum.iter().map(|bin| bin.re as f32).collect();
            let imaginary: Vec<f32> = spectrum.iter().map(|bin| bin.im as f32).collect();
            let frame_major = |key: &str| {
                testing::flat(
                    &fixture
                        .tensor(key)
                        .transpose(1, 2)
                        .unwrap()
                        .contiguous()
                        .unwrap(),
                )
            };
            let re = testing::compare(
                &format!("{name} vocoder spectrum (real)"),
                &real,
                &frame_major("s0_vocoder_re"),
            );
            let im = testing::compare(
                &format!("{name} vocoder spectrum (imaginary)"),
                &imaginary,
                &frame_major("s0_vocoder_im"),
            );
            assert!(re.relative < 1e-3 && im.relative < 1e-3, "{re:?} {im:?}");
            let wave = vocoder.render(&mel).unwrap();
            let error = testing::compare(
                &format!("{name} vocoder waveform"),
                &wave,
                &fixture.floats("s0_vocoder_wave"),
            );
            assert!(error.relative < 1e-3, "{error:?}");
        }
    }
}
