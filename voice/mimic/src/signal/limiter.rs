const KNEE: f64 = 0.9;

pub fn soft_limit(samples: &mut [f32]) {
    let knee = KNEE as f32;
    let headroom = (1.0 - KNEE) as f32;
    for sample in samples.iter_mut() {
        let magnitude = sample.abs();
        if magnitude > knee {
            let squeezed = knee + headroom * ((magnitude - knee) / headroom).tanh();
            *sample = sample.signum() * squeezed;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quiet_samples_pass_through_and_loud_ones_stay_below_one() {
        let mut samples = [0.0, 0.5, -0.9, 0.95, -1.5, 10.0];
        soft_limit(&mut samples);
        assert_eq!(samples[..3], [0.0, 0.5, -0.9]);
        assert!((samples[3] - 0.946_211_7).abs() < 1e-6);
        assert!((samples[4] + 0.999_998_8).abs() < 1e-6);
        assert!(samples[5] <= 1.0 && samples[5] > 0.999);
    }
}
