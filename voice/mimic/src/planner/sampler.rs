use crate::rng::Rng;

const BANNED_LOGIT: f32 = -1e9;
const MIN_TEMPERATURE: f32 = 1e-5;
const MIN_MASS: f32 = 1e-8;

#[derive(Debug, Clone, Copy)]
pub struct Sampler {
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: usize,
}

impl Sampler {
    pub fn pick(&self, logits: &[f32], banned: &[usize], rng: &mut Rng) -> usize {
        let allowed = ban(logits, banned);
        if self.temperature <= 0.0 {
            return argmax(&allowed);
        }
        draw(&self.shortlist(&allowed), rng.uniform())
    }

    #[cfg(test)]
    pub fn distribution(&self, logits: &[f32], banned: &[usize]) -> Vec<f32> {
        self.shortlist(&ban(logits, banned))
    }

    fn shortlist(&self, logits: &[f32]) -> Vec<f32> {
        let mut probs = softmax(logits, self.temperature.max(MIN_TEMPERATURE));
        let ranking = ranking(&probs);
        if self.top_k > 0 && self.top_k < probs.len() {
            keep_top(&mut probs, &ranking, self.top_k);
        }
        if self.top_p < 1.0 {
            keep_nucleus(&mut probs, &ranking, self.top_p.clamp(0.0, 1.0));
        }
        probs
    }
}

fn ban(logits: &[f32], banned: &[usize]) -> Vec<f32> {
    let mut allowed = logits.to_vec();
    for &id in banned {
        if let Some(logit) = allowed.get_mut(id) {
            *logit = BANNED_LOGIT;
        }
    }
    allowed
}

pub fn argmax(values: &[f32]) -> usize {
    let mut best = 0;
    for (index, value) in values.iter().enumerate() {
        if *value > values[best] {
            best = index;
        }
    }
    best
}

fn softmax(logits: &[f32], temperature: f32) -> Vec<f32> {
    let scaled: Vec<f32> = logits.iter().map(|logit| logit / temperature).collect();
    let peak = scaled.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let mut probs: Vec<f32> = scaled.iter().map(|logit| (logit - peak).exp()).collect();
    normalize(&mut probs);
    probs
}

fn normalize(probs: &mut [f32]) {
    let mass = probs.iter().sum::<f32>().max(MIN_MASS);
    probs.iter_mut().for_each(|p| *p /= mass);
}

fn ranking(probs: &[f32]) -> Vec<usize> {
    let mut order: Vec<usize> = (0..probs.len()).collect();
    order.sort_by(|&a, &b| probs[b].total_cmp(&probs[a]));
    order
}

fn keep_top(probs: &mut [f32], ranking: &[usize], count: usize) {
    let cutoff = probs[ranking[count - 1]];
    probs
        .iter_mut()
        .filter(|p| **p < cutoff)
        .for_each(|p| *p = 0.0);
    normalize(probs);
}

fn keep_nucleus(probs: &mut [f32], ranking: &[usize], mass: f32) {
    let mut covered = 0.0f32;
    for &index in ranking {
        let already_covered = covered > mass;
        covered += probs[index];
        if already_covered {
            probs[index] = 0.0;
        }
    }
    normalize(probs);
}

fn draw(probs: &[f32], uniform: f64) -> usize {
    let total: f64 = probs.iter().map(|&p| f64::from(p)).sum();
    let target = uniform * total;
    let mut covered = 0.0f64;
    let mut last = 0;
    for (index, &p) in probs.iter().enumerate() {
        if p <= 0.0 {
            continue;
        }
        covered += f64::from(p);
        last = index;
        if target < covered {
            return index;
        }
    }
    last
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{self, Fixture};

    const LOGITS: [f32; 8] = [2.0, 1.0, 0.5, 0.0, -1.0, 3.0, 2.5, -4.0];

    fn sampler(top_p: f32, top_k: usize) -> Sampler {
        Sampler {
            temperature: 0.8,
            top_p,
            top_k,
        }
    }

    fn assert_close(actual: &[f32], expected: &[f32]) {
        assert_eq!(actual.len(), expected.len());
        for (a, e) in actual.iter().zip(expected) {
            assert!((a - e).abs() < 2e-6, "{actual:?} vs {expected:?}");
        }
    }

    #[test]
    fn temperature_alone_is_a_plain_softmax() {
        let expected = [
            0.144_830_88,
            0.041_494_742,
            0.022_210_535,
            0.011_888_443,
            0.003_406_095_8,
            0.505_509_44,
            0.270_579_73,
            0.000_080_103_695,
        ];
        assert_close(&sampler(1.0, 0).distribution(&LOGITS, &[]), &expected);
    }

    #[test]
    fn top_k_keeps_the_k_most_likely() {
        let expected = [
            0.150_486_98,
            0.043_115_24,
            0.0,
            0.0,
            0.0,
            0.525_251_15,
            0.281_146_7,
            0.0,
        ];
        assert_close(&sampler(1.0, 4).distribution(&LOGITS, &[]), &expected);
    }

    #[test]
    fn nucleus_keeps_the_token_that_crosses_the_mass() {
        let expected = [0.0, 0.0, 0.0, 0.0, 0.0, 0.651_354_85, 0.348_645_15, 0.0];
        assert_close(&sampler(0.6, 0).distribution(&LOGITS, &[]), &expected);
        let single = [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        assert_close(&sampler(0.5, 0).distribution(&LOGITS, &[]), &single);
    }

    #[test]
    fn top_k_then_nucleus_match_the_reference() {
        let expected = [
            0.157_267_6,
            0.0,
            0.0,
            0.0,
            0.0,
            0.548_917_83,
            0.293_814_57,
            0.0,
        ];
        assert_close(&sampler(0.9, 4).distribution(&LOGITS, &[]), &expected);
    }

    #[test]
    fn banned_tokens_get_no_probability() {
        let expected = [
            0.694_512_07,
            0.198_981_05,
            0.106_506_88,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
        ];
        assert_close(&sampler(0.9, 25).distribution(&LOGITS, &[5, 6]), &expected);
        let shifted = [0.348_645_15, 0.0, 0.0, 0.0, 0.0, 0.0, 0.651_354_85, 0.0];
        assert_close(&sampler(0.6, 0).distribution(&LOGITS, &[5]), &shifted);
    }

    #[test]
    fn zero_temperature_is_greedy() {
        let greedy = Sampler {
            temperature: 0.0,
            top_p: 0.9,
            top_k: 25,
        };
        let mut rng = Rng::seeded(1);
        assert_eq!(greedy.pick(&LOGITS, &[], &mut rng), 5);
        assert_eq!(greedy.pick(&LOGITS, &[5], &mut rng), 6);
    }

    #[test]
    fn draw_walks_the_cumulative_distribution() {
        let probs = [0.0, 0.25, 0.0, 0.5, 0.25, 0.0];
        assert_eq!(draw(&probs, 0.0), 1);
        assert_eq!(draw(&probs, 0.2499), 1);
        assert_eq!(draw(&probs, 0.25), 3);
        assert_eq!(draw(&probs, 0.7499), 3);
        assert_eq!(draw(&probs, 0.75), 4);
        assert_eq!(draw(&probs, 0.999_999_9), 4);
    }

    #[test]
    fn pick_frequencies_follow_the_distribution() {
        let sampler = sampler(0.9, 4);
        let expected = sampler.distribution(&LOGITS, &[]);
        let mut rng = Rng::seeded(123);
        let mut counts = [0usize; 8];
        let draws = 100_000;
        for _ in 0..draws {
            counts[sampler.pick(&LOGITS, &[], &mut rng)] += 1;
        }
        for (count, p) in counts.iter().zip(&expected) {
            let frequency = *count as f32 / draws as f32;
            assert!((frequency - p).abs() < 0.01, "{frequency} vs {p}");
        }
    }

    #[test]
    fn parity_shortlists() {
        let Some(fixture) = Fixture::load("sampling") else {
            return;
        };
        let logits = fixture.rows("logits");
        let sampler = sampler(0.9, 25);
        let (start, stop) = (4375, 4376);
        for (banned, name) in [
            (vec![start, stop], "probs_early"),
            (vec![start], "probs_late"),
        ] {
            let expected = fixture.rows(name);
            let actual: Vec<Vec<f32>> = logits
                .iter()
                .map(|row| sampler.distribution(row, &banned))
                .collect();
            let support =
                |rows: &[Vec<f32>]| rows.concat().iter().map(|p| *p > 0.0).collect::<Vec<_>>();
            assert_eq!(support(&actual), support(&expected));
            let error = testing::compare(
                &format!("sampler {name}"),
                &actual.concat(),
                &expected.concat(),
            );
            assert!(error.max_abs < 1e-6, "{error:?}");
        }
        let greedy: Vec<i64> = logits
            .iter()
            .map(|row| argmax(&ban(row, &[start])) as i64)
            .collect();
        assert_eq!(greedy, fixture.ints("greedy"));
    }
}
