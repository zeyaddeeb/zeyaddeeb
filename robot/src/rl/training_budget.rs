use std::time::Duration;

#[derive(Clone, Copy, Debug)]
pub struct TrainingBudget {
    min_interval: Duration,
    rest_multiplier: f64,
}

impl TrainingBudget {
    pub fn new(max_updates_per_second: f64, duty_cycle_percent: u32) -> anyhow::Result<Self> {
        anyhow::ensure!(
            (0.1..=1000.0).contains(&max_updates_per_second),
            "SAC_TRAIN_HZ must be between 0.1 and 1000"
        );
        anyhow::ensure!(
            (1..=100).contains(&duty_cycle_percent),
            "SAC_TRAIN_DUTY_PERCENT must be between 1 and 100"
        );
        Ok(Self {
            min_interval: Duration::from_secs_f64(1.0 / max_updates_per_second),
            rest_multiplier: (100 - duty_cycle_percent) as f64 / duty_cycle_percent as f64,
        })
    }

    pub(super) fn rest_after(&self, work: Duration) -> Duration {
        self.min_interval
            .saturating_sub(work)
            .max(work.mul_f64(self.rest_multiplier))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fast_updates_obey_rate_limit() {
        let budget = TrainingBudget::new(8.0, 50).unwrap();
        assert_eq!(
            budget.rest_after(Duration::from_millis(20)),
            Duration::from_millis(105)
        );
    }

    #[test]
    fn slow_updates_still_leave_time_for_inference() {
        let work = Duration::from_millis(200);
        assert_eq!(TrainingBudget::new(8.0, 50).unwrap().rest_after(work), work);
        assert_eq!(
            TrainingBudget::new(8.0, 25).unwrap().rest_after(work),
            Duration::from_millis(600)
        );
    }

    #[test]
    fn full_duty_still_obeys_rate_limit_without_underflow() {
        let budget = TrainingBudget::new(8.0, 100).unwrap();
        assert_eq!(
            budget.rest_after(Duration::ZERO),
            Duration::from_millis(125)
        );
        assert_eq!(budget.rest_after(Duration::from_secs(1)), Duration::ZERO);
    }

    #[test]
    fn invalid_settings_are_rejected() {
        for hz in [0.0, -1.0, f64::NAN, f64::INFINITY, 1001.0] {
            assert!(TrainingBudget::new(hz, 50).is_err());
        }
        for percent in [0, 101] {
            assert!(TrainingBudget::new(8.0, percent).is_err());
        }
    }
}
