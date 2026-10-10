use super::grid::linspace;
use super::spectrum::{Spectrum, Stft};

const SLANEY_HZ_PER_MEL: f64 = 200.0 / 3.0;
const SLANEY_LOG_START_HZ: f64 = 1000.0;
const SLANEY_LOG_STEPS: f64 = 27.0;
const SLANEY_LOG_SPAN: f64 = 6.4;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MelScale {
    Htk,
    Slaney,
}

impl MelScale {
    fn hz_to_mel(self, hz: f64) -> f64 {
        match self {
            Self::Htk => 2595.0 * (1.0 + hz / 700.0).log10(),
            Self::Slaney if hz >= SLANEY_LOG_START_HZ => {
                slaney_log_start_mel() + (hz / SLANEY_LOG_START_HZ).ln() / slaney_log_step()
            }
            Self::Slaney => hz / SLANEY_HZ_PER_MEL,
        }
    }

    fn mel_to_hz(self, mel: f32) -> f32 {
        let log_start_mel = slaney_log_start_mel() as f32;
        match self {
            Self::Htk => 700.0 * (10f32.powf(mel / 2595.0) - 1.0),
            Self::Slaney if mel >= log_start_mel => {
                let exponent = slaney_log_step() as f32 * (mel - log_start_mel);
                SLANEY_LOG_START_HZ as f32 * exponent.exp()
            }
            Self::Slaney => SLANEY_HZ_PER_MEL as f32 * mel,
        }
    }
}

fn slaney_log_start_mel() -> f64 {
    SLANEY_LOG_START_HZ / SLANEY_HZ_PER_MEL
}

fn slaney_log_step() -> f64 {
    SLANEY_LOG_SPAN.ln() / SLANEY_LOG_STEPS
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Energy {
    Magnitude,
    Power,
}

#[derive(Debug, Clone, Copy)]
pub struct MelBands {
    pub sample_rate: u32,
    pub count: usize,
    pub low_hz: f64,
    pub high_hz: f64,
    pub scale: MelScale,
    pub equal_area: bool,
}

pub struct MelFilterbank {
    bins: usize,
    weights: Vec<f32>,
}

impl MelFilterbank {
    pub fn new(bands: MelBands, bins: usize) -> Self {
        let frequencies = linspace(0.0, (bands.sample_rate / 2) as f32, bins);
        let low = bands.scale.hz_to_mel(bands.low_hz) as f32;
        let high = bands.scale.hz_to_mel(bands.high_hz) as f32;
        let edges: Vec<f32> = linspace(low, high, bands.count + 2)
            .into_iter()
            .map(|mel| bands.scale.mel_to_hz(mel))
            .collect();
        let mut weights = Vec::with_capacity(bands.count * bins);
        for band in edges.windows(3) {
            let gain = band_gain(band, bands.equal_area);
            weights.extend(frequencies.iter().map(|&hz| triangle(band, hz) * gain));
        }
        Self { bins, weights }
    }

    pub fn count(&self) -> usize {
        self.weights.len() / self.bins
    }

    pub fn band(&self, index: usize) -> &[f32] {
        &self.weights[index * self.bins..(index + 1) * self.bins]
    }

    #[cfg(test)]
    pub fn weights(&self) -> &[f32] {
        &self.weights
    }
}

fn triangle(band: &[f32], hz: f32) -> f32 {
    let (left, center, right) = (band[0], band[1], band[2]);
    let rising = (hz - left) / (center - left);
    let falling = (right - hz) / (right - center);
    rising.min(falling).max(0.0)
}

fn band_gain(band: &[f32], equal_area: bool) -> f32 {
    if equal_area {
        2.0 / (band[2] - band[0])
    } else {
        1.0
    }
}

pub struct MelFrames {
    pub bands: usize,
    pub frames: usize,
    pub values: Vec<f64>,
}

impl MelFrames {
    pub fn map(mut self, f: impl Fn(f64) -> f64) -> Self {
        self.values.iter_mut().for_each(|value| *value = f(*value));
        self
    }

    pub fn peak(&self) -> f64 {
        self.values
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max)
    }

    pub fn to_f32(&self) -> Vec<f32> {
        self.values.iter().map(|&value| value as f32).collect()
    }
}

pub struct MelSpectrogram {
    stft: Stft,
    filterbank: MelFilterbank,
    energy: Energy,
}

impl MelSpectrogram {
    pub fn new(stft: Stft, bands: MelBands, energy: Energy) -> Self {
        let filterbank = MelFilterbank::new(bands, stft.bins());
        Self {
            stft,
            filterbank,
            energy,
        }
    }

    pub fn min_samples(&self) -> usize {
        self.stft.min_samples()
    }

    pub fn frame_count(&self, samples: usize) -> usize {
        self.stft.frame_count(samples)
    }

    #[cfg(test)]
    pub fn filterbank(&self) -> &MelFilterbank {
        &self.filterbank
    }

    pub fn compute(&self, samples: &[f32], frames: usize) -> MelFrames {
        let spectrum = self.stft.transform(samples, frames);
        let bands = self.filterbank.count();
        let mut values = vec![0.0; bands * frames];
        for frame in 0..frames {
            let energies = self.energies(&spectrum, frame);
            for band in 0..bands {
                values[band * frames + frame] = project(self.filterbank.band(band), &energies);
            }
        }
        MelFrames {
            bands,
            frames,
            values,
        }
    }

    fn energies(&self, spectrum: &Spectrum, frame: usize) -> Vec<f64> {
        let bins = spectrum.frame(frame).iter();
        match self.energy {
            Energy::Magnitude => bins.map(|bin| bin.norm()).collect(),
            Energy::Power => bins.map(|bin| bin.norm_sqr()).collect(),
        }
    }
}

fn project(band: &[f32], energies: &[f64]) -> f64 {
    band.iter()
        .zip(energies)
        .map(|(weight, energy)| f64::from(*weight) * energy)
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bands(scale: MelScale, equal_area: bool) -> MelBands {
        MelBands {
            sample_rate: 16_000,
            count: 8,
            low_hz: 0.0,
            high_hz: 8000.0,
            scale,
            equal_area,
        }
    }

    #[test]
    fn mel_scales_round_trip() {
        for scale in [MelScale::Htk, MelScale::Slaney] {
            for hz in [0.0, 440.0, 1000.0, 4000.0, 7600.0] {
                let back = scale.mel_to_hz(scale.hz_to_mel(hz) as f32);
                assert!((f64::from(back) - hz).abs() < 1e-2, "{scale:?} {hz} {back}");
            }
        }
        assert!((MelScale::Htk.hz_to_mel(1000.0) - 999.985_537_139_624_4).abs() < 1e-9);
        assert!((MelScale::Slaney.hz_to_mel(1000.0) - 15.0).abs() < 1e-12);
        assert!((MelScale::Slaney.hz_to_mel(8000.0) - 45.245_640_471_924_965).abs() < 1e-9);
    }

    #[test]
    fn htk_filterbank_spot_values_match_reference() {
        let bank = MelFilterbank::new(bands(MelScale::Htk, false), 33);
        assert_eq!(bank.count(), 8);
        for (band, bin, expected) in HTK_SPOTS {
            let actual = bank.band(band)[bin];
            assert!((actual - expected).abs() < 2e-6, "{band} {bin} {actual}");
        }
        assert_eq!(bank.band(0)[0], 0.0);
        assert_eq!(bank.band(7)[32], 0.0);
    }

    #[test]
    fn slaney_filterbank_spot_values_match_reference() {
        let bank = MelFilterbank::new(bands(MelScale::Slaney, true), 33);
        for (band, bin, expected) in SLANEY_SPOTS {
            let actual = bank.band(band)[bin];
            assert!((actual - expected).abs() < 1e-8, "{band} {bin} {actual}");
        }
    }

    const HTK_SPOTS: [(usize, usize, f32); 10] = [
        (0, 1, 0.920_444_55),
        (0, 2, 0.085_105_1),
        (1, 2, 0.914_894_9),
        (2, 4, 0.850_089_4),
        (3, 9, 0.0),
        (4, 9, 0.878_589_7),
        (5, 17, 0.016_084_708),
        (6, 20, 0.545_099_3),
        (7, 25, 0.823_653_3),
        (7, 31, 0.117_664_36),
    ];
    const SLANEY_SPOTS: [(usize, usize, f32); 9] = [
        (0, 1, 0.002_225_636),
        (0, 2, 0.001_516_154_2),
        (1, 2, 0.001_467_150_3),
        (2, 4, 0.002_619_826_7),
        (3, 9, 0.0),
        (4, 9, 0.000_999_565_5),
        (6, 20, 0.000_283_238_94),
        (7, 27, 0.000_267_844_15),
        (7, 31, 0.000_053_568_496),
    ];

    #[test]
    fn mel_of_a_tone_peaks_in_the_matching_band() {
        let stft = Stft::new(512, 512, 128);
        let mel = MelSpectrogram::new(stft, bands(MelScale::Htk, false), Energy::Power);
        let samples: Vec<f32> = (0..4096)
            .map(|i| (std::f64::consts::TAU * 2000.0 * i as f64 / 16_000.0).sin() as f32)
            .collect();
        let frames = mel.compute(&samples, mel.frame_count(samples.len()));
        let column: Vec<f64> = (0..frames.bands)
            .map(|band| frames.values[band * frames.frames + frames.frames / 2])
            .collect();
        let peak = (0..column.len())
            .max_by(|&a, &b| column[a].total_cmp(&column[b]))
            .unwrap();
        let center = |band: usize| {
            let scale = MelScale::Htk;
            let top = scale.hz_to_mel(8000.0) as f32;
            scale.mel_to_hz(top * (band + 1) as f32 / 9.0)
        };
        assert!((center(peak) - 2000.0).abs() < (center(peak + 1) - center(peak)).abs());
    }

    #[test]
    fn frames_map_and_report_their_peak() {
        let frames = MelFrames {
            bands: 1,
            frames: 3,
            values: vec![1.0, 100.0, 10.0],
        };
        let logged = frames.map(f64::log10);
        assert_eq!(logged.peak(), 2.0);
        assert_eq!(logged.to_f32(), [0.0, 2.0, 1.0]);
    }
}
