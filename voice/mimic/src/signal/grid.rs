pub fn linspace(start: f32, end: f32, steps: usize) -> Vec<f32> {
    if steps <= 1 {
        return vec![start; steps];
    }
    let step = (end - start) / (steps - 1) as f32;
    let halfway = steps / 2;
    (0..steps)
        .map(|index| {
            if index < halfway {
                start + step * index as f32
            } else {
                end - step * (steps - index - 1) as f32
            }
        })
        .collect()
}

pub fn seconds_to_samples(seconds: f64, sample_rate: u32) -> usize {
    (seconds * f64::from(sample_rate)) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linspace_hits_both_endpoints_exactly() {
        assert_eq!(linspace(0.0, 1.0, 5), [0.0, 0.25, 0.5, 0.75, 1.0]);
        assert_eq!(linspace(2.0, 2.0, 1), [2.0]);
        assert!(linspace(0.0, 1.0, 0).is_empty());
        let values = linspace(0.0, 8000.0, 201);
        assert_eq!((values[1], values[200]), (40.0, 8000.0));
    }

    #[test]
    fn linspace_builds_the_second_half_backwards_from_the_end() {
        let values = linspace(0.0, 1.0, 480);
        let step = 1.0f32 / 479.0;
        assert_eq!(values[100], step * 100.0);
        assert_eq!(values[400], 1.0 - step * 79.0);
    }

    #[test]
    fn durations_truncate_to_whole_samples() {
        assert_eq!(seconds_to_samples(0.025, 24_000), 600);
        assert_eq!(seconds_to_samples(0.01, 24_000), 240);
        assert_eq!(seconds_to_samples(0.3, 24_000), 7200);
        assert_eq!(seconds_to_samples(0.01, 22_050), 220);
    }
}
