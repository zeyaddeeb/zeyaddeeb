use super::grid::seconds_to_samples;

const WINDOW_SECONDS: f64 = 0.025;
const HOP_SECONDS: f64 = 0.010;
const LEVEL_FLOOR: f32 = 1e-6;
const ACTIVE_QUANTILE: f32 = 0.2;
const ACTIVE_MARGIN: f32 = 1.5;
const VOICE_LEVEL_DB: f64 = -19.8;
const SPEECH_LEVEL_DB: f64 = -23.0;
const MAX_BOOST_DB: f64 = 30.0;
const PEAK_CEILING: f64 = 0.95;

#[derive(Debug, Clone, Copy)]
pub struct Framing {
    pub window: usize,
    pub hop: usize,
}

impl Framing {
    pub fn at(sample_rate: u32) -> Self {
        Self {
            window: seconds_to_samples(WINDOW_SECONDS, sample_rate),
            hop: seconds_to_samples(HOP_SECONDS, sample_rate),
        }
    }
}

pub fn root_mean_square(samples: &[f32]) -> f32 {
    let energy: f64 = samples.iter().map(|&x| f64::from(x) * f64::from(x)).sum();
    (energy / samples.len() as f64).sqrt() as f32
}

pub fn frame_levels(samples: &[f32], framing: Framing) -> Vec<f32> {
    samples
        .windows(framing.window)
        .step_by(framing.hop)
        .map(|frame| root_mean_square(frame).max(LEVEL_FLOOR))
        .collect()
}

pub fn block_levels(samples: &[f32], block: usize) -> Vec<f32> {
    samples.chunks_exact(block).map(root_mean_square).collect()
}

pub fn quantile(values: &[f32], fraction: f32) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(f32::total_cmp);
    let rank = fraction * (sorted.len() - 1) as f32;
    let below = sorted[rank.floor() as usize];
    let above = sorted[rank.ceil() as usize];
    lerp(below, above, rank - rank.floor())
}

fn lerp(start: f32, end: f32, weight: f32) -> f32 {
    if weight < 0.5 {
        start + weight * (end - start)
    } else {
        end - (end - start) * (1.0 - weight)
    }
}

fn lower_median(values: &[f32]) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(f32::total_cmp);
    sorted[(sorted.len() - 1) / 2]
}

pub fn speech_level_db(samples: &[f32], sample_rate: u32) -> f64 {
    let framing = Framing::at(sample_rate);
    if samples.len() < framing.window {
        return 20.0 * f64::from(root_mean_square(samples).max(LEVEL_FLOOR)).log10();
    }
    let levels = frame_levels(samples, framing);
    let threshold = quantile(&levels, ACTIVE_QUANTILE) * ACTIVE_MARGIN;
    let active: Vec<f32> = levels.iter().copied().filter(|l| *l > threshold).collect();
    let median = lower_median(if active.is_empty() { &levels } else { &active });
    f64::from(20.0 * median.log10())
}

pub struct Leveled {
    pub samples: Vec<f32>,
    pub level_db: f64,
}

pub fn raise_to_voice_level(samples: &[f32], sample_rate: u32) -> Leveled {
    let level_db = speech_level_db(samples, sample_rate);
    let peak = samples.iter().fold(0.0f32, |peak, x| peak.max(x.abs()));
    let boost_db = boost_db(level_db, f64::from(peak));
    let gain = 10f64.powf(boost_db / 20.0) as f32;
    Leveled {
        samples: samples.iter().map(|x| x * gain).collect(),
        level_db: level_db + boost_db,
    }
}

fn boost_db(level_db: f64, peak: f64) -> f64 {
    let wanted = (VOICE_LEVEL_DB - level_db).clamp(0.0, MAX_BOOST_DB);
    if peak > 0.0 {
        wanted.min((20.0 * (PEAK_CEILING / peak).log10()).max(0.0))
    } else {
        wanted
    }
}

pub fn speech_gain(voice_level_db: f64) -> f32 {
    10f64.powf((SPEECH_LEVEL_DB - voice_level_db) / 20.0) as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::Fixture;

    fn tone(amplitude: f32, samples: usize) -> Vec<f32> {
        (0..samples)
            .map(|i| amplitude * (std::f32::consts::TAU * 220.0 * i as f32 / 24_000.0).sin())
            .collect()
    }

    #[test]
    fn framing_is_25_by_10_milliseconds() {
        let framing = Framing::at(24_000);
        assert_eq!((framing.window, framing.hop), (600, 240));
        assert_eq!(frame_levels(&vec![0.5; 24_000], framing).len(), 98);
        assert!(frame_levels(&vec![0.5; 599], framing).is_empty());
    }

    #[test]
    fn levels_are_floored_only_for_overlapping_frames() {
        let framing = Framing::at(24_000);
        assert_eq!(frame_levels(&vec![0.0; 1200], framing), [1e-6; 3]);
        assert_eq!(block_levels(&[0.0; 480], 240), [0.0, 0.0]);
        assert_eq!(block_levels(&[0.5; 500], 240), [0.5, 0.5]);
    }

    #[test]
    fn quantile_interpolates_between_order_statistics() {
        let values = [4.0, 1.0, 3.0, 2.0, 5.0];
        assert_eq!(quantile(&values, 0.0), 1.0);
        assert_eq!(quantile(&values, 0.5), 3.0);
        assert_eq!(quantile(&values, 1.0), 5.0);
        assert!((quantile(&values, 0.1) - 1.4).abs() < 1e-6);
        assert!((quantile(&values, 0.2) - 1.8).abs() < 1e-6);
        assert_eq!(quantile(&[7.0], 0.3), 7.0);
    }

    #[test]
    fn median_takes_the_lower_middle() {
        assert_eq!(lower_median(&[3.0, 1.0, 2.0]), 2.0);
        assert_eq!(lower_median(&[4.0, 1.0, 3.0, 2.0]), 2.0);
    }

    #[test]
    fn steady_tone_level_is_its_rms() {
        let level = speech_level_db(&tone(0.5, 24_000), 24_000);
        assert!(
            (level - 20.0 * (0.5f64 / 2f64.sqrt()).log10()).abs() < 0.1,
            "{level}"
        );
    }

    #[test]
    fn clips_shorter_than_a_frame_use_their_overall_level() {
        assert!((speech_level_db(&[0.1; 100], 24_000) + 20.0).abs() < 1e-5);
        assert!((speech_level_db(&[0.0; 100], 24_000) + 120.0).abs() < 1e-4);
    }

    #[test]
    fn quiet_voices_are_raised_and_loud_ones_left_alone() {
        let quiet = raise_to_voice_level(&tone(0.01, 24_000), 24_000);
        assert!((quiet.level_db + 19.8).abs() < 1e-6);
        let loud = tone(0.9, 24_000);
        let leveled = raise_to_voice_level(&loud, 24_000);
        assert_eq!(leveled.samples, loud);
    }

    #[test]
    fn boost_is_capped_by_the_peak_and_the_limit() {
        assert!((boost_db(-25.8, 0.1) - 6.0).abs() < 1e-9);
        assert!((boost_db(-25.8, 0.76) - 20.0 * (0.95f64 / 0.76).log10()).abs() < 1e-9);
        assert_eq!(boost_db(-80.0, 0.0), 30.0);
        assert_eq!(boost_db(-10.0, 0.5), 0.0);
        assert_eq!(boost_db(-30.0, 0.99), 0.0);
    }

    #[test]
    fn speech_gain_maps_voice_level_to_output_level() {
        assert!((speech_gain(-19.8) - 0.691_831).abs() < 1e-6);
        assert!((speech_gain(-23.0) - 1.0).abs() < 1e-7);
    }

    #[test]
    fn parity_voice_levels() {
        for name in ["voice_long", "voice_short"] {
            let Some(fixture) = Fixture::load(name) else {
                return;
            };
            let cropped = fixture.floats("cropped");
            let expected = fixture.meta()["speech_level_db"].as_f64().unwrap();
            let level = speech_level_db(&cropped, 24_000);
            println!("parity {name} speech level: {level} vs {expected}");
            assert!((level - expected).abs() < 1e-5);
            let leveled = raise_to_voice_level(&cropped, 24_000);
            let wanted = fixture.meta()["level_db"].as_f64().unwrap();
            assert!((leveled.level_db - wanted).abs() < 1e-5);
            let error = crate::testing::compare(
                &format!("{name} leveled"),
                &leveled.samples,
                &fixture.floats("leveled"),
            );
            assert!(error.max_abs < 1e-6, "{error:?}");
        }
    }
}
