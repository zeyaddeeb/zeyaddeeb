const LINEAR_STEP: f64 = 200.0 / 3.0;
const KNEE_HZ: f64 = 1_000.0;
const LOG_STEP: f64 = 0.068_751_777_420_949_12;

pub fn filterbank(bands: usize, fft: usize, rate: u32) -> Vec<f32> {
    let bins = fft / 2 + 1;
    let top = to_mel(rate as f64 / 2.0);
    let edges: Vec<f64> = (0..bands + 2)
        .map(|i| to_hz(top * i as f64 / (bands + 1) as f64))
        .collect();

    (0..bands)
        .flat_map(|band| {
            let (low, mid, high) = (edges[band], edges[band + 1], edges[band + 2]);
            let area = 2.0 / (high - low);

            (0..bins).map(move |bin| {
                let hz = bin as f64 * rate as f64 / fft as f64;
                let rising = (hz - low) / (mid - low);
                let falling = (high - hz) / (high - mid);

                (rising.min(falling).max(0.0) * area) as f32
            })
        })
        .collect()
}

fn to_mel(hz: f64) -> f64 {
    if hz < KNEE_HZ {
        return hz / LINEAR_STEP;
    }

    KNEE_HZ / LINEAR_STEP + (hz / KNEE_HZ).ln() / LOG_STEP
}

fn to_hz(mel: f64) -> f64 {
    let knee = KNEE_HZ / LINEAR_STEP;

    if mel < knee {
        return mel * LINEAR_STEP;
    }

    KNEE_HZ * ((mel - knee) * LOG_STEP).exp()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_scale_round_trips() {
        for hz in [0.0, 440.0, 1_000.0, 4_000.0, 8_000.0] {
            assert!((to_hz(to_mel(hz)) - hz).abs() < 1e-6);
        }
    }

    #[test]
    fn whisper_filters_match_the_reference_values() {
        let filters = filterbank(80, 400, 16_000);
        let at = |band: usize, bin: usize| filters[band * 201 + bin];

        assert_eq!(filters.len(), 80 * 201);
        assert!((at(0, 1) - 0.024_862_6).abs() < 1e-6);
        assert!((at(1, 2) - 0.022_871_8).abs() < 1e-6);
        assert!((at(79, 195) - 0.002_243_8).abs() < 1e-6);
        assert_eq!(at(0, 0), 0.0);
        assert_eq!(at(79, 200), 0.0);
    }

    #[test]
    fn every_band_has_weight() {
        let filters = filterbank(80, 400, 16_000);

        assert!(filters
            .chunks(201)
            .all(|band| band.iter().sum::<f32>() > 0.0));
    }
}
