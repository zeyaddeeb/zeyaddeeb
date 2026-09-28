use super::memory::Ledger;
use std::time::Duration;

const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub tokens_per_day: u64,
    pub backoff_base: Duration,
    pub backoff_max: Duration,
    pub failures_before_giving_up: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Wait {
    Budget(Duration),
    Backoff(Duration),
}

impl Wait {
    pub fn duration(&self) -> Duration {
        match self {
            Wait::Budget(d) | Wait::Backoff(d) => *d,
        }
    }

    pub fn reason(&self) -> &'static str {
        match self {
            Wait::Budget(_) => "the day's token budget is spent",
            Wait::Backoff(_) => "the model is not answering; backing off",
        }
    }
}

pub struct Governor {
    limits: Limits,
    ledger: Ledger,
    blocked_until: i64,
}

impl Governor {
    pub fn new(limits: Limits, ledger: Ledger) -> Self {
        Governor {
            limits,
            ledger,
            blocked_until: 0,
        }
    }

    pub fn ledger(&self) -> &Ledger {
        &self.ledger
    }

    pub fn remaining(&self, now: i64) -> u64 {
        if now - self.ledger.day_start >= DAY_MS {
            return self.limits.tokens_per_day;
        }
        self.limits.tokens_per_day.saturating_sub(self.ledger.spent)
    }

    pub fn check(&mut self, now: i64) -> Option<Wait> {
        if now - self.ledger.day_start >= DAY_MS {
            self.ledger.day_start = now - now.rem_euclid(DAY_MS);
            self.ledger.spent = 0;
        }
        if now < self.blocked_until {
            return Some(Wait::Backoff(ms(self.blocked_until - now)));
        }
        if self.ledger.spent >= self.limits.tokens_per_day {
            return Some(Wait::Budget(ms(self.ledger.day_start + DAY_MS - now)));
        }
        None
    }

    pub fn spend(&mut self, tokens: u64) {
        self.ledger.spent += tokens;
        self.ledger.failures = 0;
    }

    pub fn fail(&mut self, now: i64) -> Wait {
        self.ledger.failures += 1;
        let exponent = (self.ledger.failures - 1).min(16);
        let base = self.limits.backoff_base.as_millis() as i64;
        let ceiling = self.limits.backoff_max.as_millis() as i64;
        let delay = base.saturating_mul(1 << exponent).min(ceiling);
        let jittered = delay - jitter(now, delay / 4);
        self.blocked_until = now + jittered;
        Wait::Backoff(ms(jittered))
    }

    pub fn exhausted(&self) -> bool {
        self.ledger.failures >= self.limits.failures_before_giving_up
    }
}

fn ms(value: i64) -> Duration {
    Duration::from_millis(value.max(0) as u64)
}

fn jitter(seed: i64, span: i64) -> i64 {
    if span <= 0 {
        return 0;
    }
    let mixed = (seed as u64)
        .wrapping_mul(6_364_136_223_846_793_005)
        .rotate_left(17);
    (mixed % span as u64) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limits() -> Limits {
        Limits {
            tokens_per_day: 1000,
            backoff_base: Duration::from_secs(30),
            backoff_max: Duration::from_secs(1800),
            failures_before_giving_up: 3,
        }
    }

    #[test]
    fn spending_past_the_budget_waits_for_the_next_day() {
        let day = DAY_MS * 100;
        let mut governor = Governor::new(limits(), Ledger::default());
        assert_eq!(governor.check(day + 1000), None);
        governor.spend(999);
        assert_eq!(governor.check(day + 2000), None);
        governor.spend(5);
        match governor.check(day + 3000) {
            Some(Wait::Budget(wait)) => assert_eq!(wait, ms(DAY_MS - 3000)),
            other => panic!("{other:?}"),
        }
        assert_eq!(governor.check(day + DAY_MS + 1), None);
        assert_eq!(governor.remaining(day + DAY_MS + 1), 1000);
    }

    #[test]
    fn failures_back_off_exponentially_with_a_ceiling() {
        let mut governor = Governor::new(limits(), Ledger::default());
        let now = 1_000_000;
        let first = governor.fail(now).duration();
        assert!(first <= Duration::from_secs(30) && first >= Duration::from_millis(22_500));
        assert!(matches!(governor.check(now + 1000), Some(Wait::Backoff(_))));
        let second = governor.fail(now).duration();
        assert!(second > first);
        for _ in 0..20 {
            governor.fail(now);
        }
        assert!(governor.fail(now).duration() <= Duration::from_secs(1800));
        assert!(governor.exhausted());
        governor.spend(1);
        assert!(!governor.exhausted());
    }
}
