use std::f64::consts::TAU;

pub fn hann_periodic(length: usize) -> Vec<f64> {
    (0..length)
        .map(|i| 0.5 - 0.5 * (TAU * i as f64 / length as f64).cos())
        .collect()
}

pub fn centered(window: &[f64], size: usize) -> Vec<f64> {
    let left = (size - window.len()) / 2;
    let mut padded = vec![0.0; size];
    padded[left..left + window.len()].copy_from_slice(window);
    padded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn periodic_hann_starts_at_zero_and_peaks_in_the_middle() {
        let window = hann_periodic(8);
        assert_eq!(window[0], 0.0);
        assert!((window[4] - 1.0).abs() < 1e-12);
        assert!((window[1] - window[7]).abs() < 1e-12);
        assert!((window[2] - 0.5).abs() < 1e-12);
    }

    #[test]
    fn centering_pads_both_sides() {
        let padded = centered(&[1.0, 2.0, 3.0, 4.0], 10);
        assert_eq!(padded, [0.0, 0.0, 0.0, 1.0, 2.0, 3.0, 4.0, 0.0, 0.0, 0.0]);
    }
}
