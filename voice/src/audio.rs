use std::path::Path;

use anyhow::Context;

pub const RATE: u32 = 24_000;

const ZERO_CROSSINGS: f64 = 16.0;
const ROLLOFF: f64 = 0.94;
const FRAME_MS: usize = 20;
const MARGIN_MS: usize = 160;
const FLOOR: f32 = 0.08;

pub fn resample(samples: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || samples.is_empty() {
        return samples.to_vec();
    }

    let step = from as f64 / to as f64;
    let cutoff = 0.5 * ROLLOFF * (from.min(to) as f64 / from as f64);
    let half = (ZERO_CROSSINGS / (2.0 * cutoff)).ceil();
    let length = (samples.len() as f64 / step).floor() as usize;

    (0..length)
        .map(|index| interpolate(samples, index as f64 * step, cutoff, half))
        .collect()
}

fn interpolate(samples: &[f32], center: f64, cutoff: f64, half: f64) -> f32 {
    let first = (center - half).ceil().max(0.0) as usize;
    let last = ((center + half).floor() as usize).min(samples.len() - 1);

    (first..=last)
        .map(|k| samples[k] as f64 * kernel(center - k as f64, cutoff, half))
        .sum::<f64>() as f32
}

fn kernel(offset: f64, cutoff: f64, half: f64) -> f64 {
    let window = 0.5 + 0.5 * (std::f64::consts::PI * offset / half).cos();

    2.0 * cutoff * sinc(2.0 * cutoff * offset) * window
}

fn sinc(x: f64) -> f64 {
    if x.abs() < 1e-9 {
        return 1.0;
    }

    let scaled = std::f64::consts::PI * x;

    scaled.sin() / scaled
}

pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
}

pub fn to_bytes(samples: &[f32]) -> Vec<u8> {
    samples
        .iter()
        .flat_map(|sample| ((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).to_le_bytes())
        .collect()
}

pub fn from_bytes(bytes: &[u8]) -> Option<Vec<f32>> {
    let (pairs, odd) = bytes.as_chunks::<2>();

    if !odd.is_empty() {
        return None;
    }

    Some(
        pairs
            .iter()
            .map(|pair| i16::from_le_bytes(*pair) as f32 / i16::MAX as f32)
            .collect(),
    )
}

pub fn trim(samples: &[f32], rate: u32) -> &[f32] {
    let frame = rate as usize * FRAME_MS / 1000;
    let margin = rate as usize * MARGIN_MS / 1000;
    let levels: Vec<f32> = samples.chunks(frame.max(1)).map(rms).collect();
    let loudest = levels.iter().copied().fold(0.0, f32::max);
    let voiced = |level: &f32| *level > loudest * FLOOR;

    let (Some(first), Some(last)) = (
        levels.iter().position(voiced),
        levels.iter().rposition(voiced),
    ) else {
        return &samples[..0];
    };

    let start = (first * frame).saturating_sub(margin);
    let end = ((last + 1) * frame + margin).min(samples.len());

    &samples[start..end]
}

pub fn read_wav(path: &Path) -> anyhow::Result<(Vec<f32>, u32)> {
    let mut reader =
        hound::WavReader::open(path).with_context(|| format!("cannot open {}", path.display()))?;
    let spec = reader.spec();
    let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;

    let interleaved: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<Result<_, _>>()?,
        hound::SampleFormat::Int => reader
            .samples::<i32>()
            .map(|sample| sample.map(|value| value as f32 / scale))
            .collect::<Result<_, _>>()?,
    };

    let mono = interleaved
        .chunks(spec.channels.max(1) as usize)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect();

    Ok((mono, spec.sample_rate))
}

pub fn write_wav(path: &Path, samples: &[f32], rate: u32) -> anyhow::Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)
        .with_context(|| format!("cannot create {}", path.display()))?;

    for sample in samples {
        writer.write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }

    writer.finalize()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(hz: f32, rate: u32, seconds: f32) -> Vec<f32> {
        (0..(rate as f32 * seconds) as usize)
            .map(|n| (std::f32::consts::TAU * hz * n as f32 / rate as f32).sin() * 0.5)
            .collect()
    }

    #[test]
    fn resampling_keeps_a_tone_in_band() {
        let out = resample(&tone(1_000.0, 24_000, 1.0), 24_000, 16_000);

        assert_eq!(out.len(), 16_000);
        assert!((rms(&out[800..15_200]) - 0.5 / 2f32.sqrt()).abs() < 0.005);
    }

    #[test]
    fn resampling_removes_what_would_alias() {
        let out = resample(&tone(10_000.0, 24_000, 1.0), 24_000, 16_000);

        assert!(rms(&out[800..15_200]) < 0.005);
    }

    #[test]
    fn resampling_up_keeps_the_level() {
        let out = resample(&tone(440.0, 16_000, 1.0), 16_000, 24_000);

        assert_eq!(out.len(), 24_000);
        assert!((rms(&out[1_200..22_800]) - 0.5 / 2f32.sqrt()).abs() < 0.005);
    }

    #[test]
    fn trim_drops_silence_around_speech() {
        let mut take = vec![0.0; 24_000];

        take.extend(tone(300.0, 24_000, 1.0));
        take.extend(vec![0.0; 24_000]);

        let kept = trim(&take, 24_000);

        assert!(kept.len() > 24_000 && kept.len() < 24_000 + 2 * 4_800);
    }

    #[test]
    fn samples_survive_the_trip_to_bytes_and_back() {
        let samples = [0.0, 0.5, -0.5, 1.0, -1.0];
        let back = from_bytes(&to_bytes(&samples)).unwrap();

        assert_eq!(to_bytes(&samples).len(), 10);
        assert!(samples.iter().zip(&back).all(|(a, b)| (a - b).abs() < 1e-4));
    }

    #[test]
    fn loud_samples_are_clipped_and_odd_bytes_refused() {
        assert_eq!(to_bytes(&[2.0]), i16::MAX.to_le_bytes());
        assert!(from_bytes(&[1, 2, 3]).is_none());
    }

    #[test]
    fn trim_of_silence_is_empty() {
        assert!(trim(&vec![0.0; 24_000], 24_000).is_empty());
    }
}
