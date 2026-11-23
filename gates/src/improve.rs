use crate::method::{moves, Method, Move};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const PAIRS: usize = 8;
pub const MINIMUM_PAIRS: usize = 4;
pub const ALPHA: f64 = 0.1;
pub const MIN_REL_DIFF: f64 = 0.02;
pub const MAX_TIME_RATIO: f64 = 1.25;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pair {
    pub id: String,
    pub gates: usize,
    pub before: Option<u64>,
    pub after: Option<u64>,
    pub before_millis: u64,
    pub after_millis: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Win,
    Loss,
    Tie,
}

impl Pair {
    pub fn side(&self) -> Side {
        match (self.before, self.after) {
            (Some(before), Some(after)) => {
                let delta = before.abs_diff(after);
                let scale = before.max(after);
                let significant = if scale < 50 {
                    delta > 0
                } else {
                    (delta as f64) / (scale as f64) >= MIN_REL_DIFF
                };

                if !significant {
                    Side::Tie
                } else if after < before {
                    Side::Win
                } else {
                    Side::Loss
                }
            }
            (None, Some(_)) => Side::Win,
            (Some(_), None) => Side::Loss,
            (None, None) => Side::Tie,
        }
    }

    pub fn log_gain(&self) -> f64 {
        match (self.before, self.after) {
            (Some(before), Some(after)) => ((before.max(1) as f64) / (after.max(1) as f64)).ln(),
            (None, Some(_)) => 1.5,
            (Some(_), None) => -1.5,
            (None, None) => 0.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trial {
    pub number: u64,
    pub at: i64,
    pub change: String,
    pub label: String,
    pub incumbent: u64,
    pub candidate: Method,
    pub pairs: Vec<Pair>,
    pub wins: usize,
    pub losses: usize,
    pub ties: usize,
    pub p: f64,
    pub census: Option<bool>,
    pub kept: bool,
    pub millis: u64,
    pub benchmark: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveStats {
    pub tried: u32,
    pub kept: u32,
    pub lost_on: Option<String>,
    #[serde(default)]
    pub gain_sum: f64,
}

pub fn loss_key(method: &Method, benchmark: &str) -> String {
    format!("{}|{benchmark}", method.recipe_key())
}

pub fn mean_log_gain(pairs: &[Pair]) -> f64 {
    if pairs.is_empty() {
        return 0.0;
    }

    pairs.iter().map(Pair::log_gain).sum::<f64>() / pairs.len() as f64
}

fn choose(n: u64, k: u64) -> f64 {
    (0..k).fold(1.0, |acc, i| acc * (n - i) as f64 / (i + 1) as f64)
}

pub fn sign_test(wins: usize, losses: usize) -> f64 {
    let n = (wins + losses) as u64;

    if n == 0 {
        return 1.0;
    }

    (wins as u64..=n).map(|k| choose(n, k)).sum::<f64>() / 2f64.powi(n as i32)
}

pub fn wall_clock_ok(pairs: &[Pair]) -> bool {
    let solved_gain: isize = pairs
        .iter()
        .map(|p| match (p.before, p.after) {
            (None, Some(_)) => 1,
            (Some(_), None) => -1,
            _ => 0,
        })
        .sum();

    if solved_gain > 0 {
        return true;
    }

    let (before_ms, after_ms): (u64, u64) = pairs
        .iter()
        .filter(|p| p.before.is_some() && p.after.is_some())
        .fold((0, 0), |(b, a), p| (b + p.before_millis, a + p.after_millis));

    if before_ms == 0 {
        return true;
    }

    (after_ms as f64) <= (before_ms as f64) * MAX_TIME_RATIO + 250.0
}

pub fn verdict(pairs: &[Pair]) -> (usize, usize, usize, f64, bool) {
    let count = |side: Side| pairs.iter().filter(|p| p.side() == side).count();
    let (wins, losses, ties) = (count(Side::Win), count(Side::Loss), count(Side::Tie));
    let p = sign_test(wins, losses);
    let passes = wins + losses >= MINIMUM_PAIRS
        && wins > losses
        && p <= ALPHA
        && wall_clock_ok(pairs);

    (wins, losses, ties, p, passes)
}

fn move_target(change: &Move) -> (&'static str, &str) {
    match change {
        Move::Break { name, .. } => ("break", name.as_str()),
        Move::Preset { .. } => ("preset", ""),
        Move::Option { name, .. } => ("option", name.as_str()),
        Move::Combo { .. } => ("combo", ""),
    }
}

fn is_break_revert(change: &Move) -> bool {
    matches!(change, Move::Break { on: false, .. })
}

fn move_reward(stats: &BTreeMap<String, MoveStats>, id: &str) -> f64 {
    let Some(s) = stats.get(id) else {
        return 0.0;
    };

    if s.tried == 0 {
        return 0.0;
    }

    let tried = f64::from(s.tried);
    let keep_rate = f64::from(s.kept) / tried;
    let avg_gain = (s.gain_sum / tried).clamp(-1.0, 1.0);

    keep_rate + 0.25 * avg_gain
}

pub fn propose(
    method: &Method,
    stats: &BTreeMap<String, MoveStats>,
    benchmark: &str,
    avoid_recipes: &BTreeSet<String>,
) -> Option<Move> {
    let lost_marker = loss_key(method, benchmark);
    let all_single = moves(method);

    let open: Vec<Move> = all_single
        .iter()
        .filter(|change| {
            let candidate = change.apply(method);

            !avoid_recipes.contains(&candidate.recipe_key())
                && stats.get(&change.id()).and_then(|s| s.lost_on.as_deref())
                    != Some(lost_marker.as_str())
        })
        .cloned()
        .collect();

    if let Some(fresh) = open
        .iter()
        .filter(|change| !is_break_revert(change))
        .find(|change| stats.get(&change.id()).is_none_or(|s| s.tried == 0))
        .or_else(|| {
            open.iter()
                .find(|change| stats.get(&change.id()).is_none_or(|s| s.tried == 0))
        })
    {
        return Some(fresh.clone());
    }

    let total: u32 = stats.values().map(|s| s.tried).sum();
    let log = f64::from(total.max(1)).ln();

    if !open.is_empty() {
        return open.into_iter().max_by(|a, b| {
            let score = |change: &Move| {
                let s = stats.get(&change.id()).cloned().unwrap_or_default();
                let tried = f64::from(s.tried.max(1));
                let avg_gain = (s.gain_sum / tried).clamp(-1.0, 1.0).max(0.0);

                f64::from(s.kept) / tried + 0.25 * avg_gain + (2.0 * log / tried).sqrt()
            };

            score(a).total_cmp(&score(b))
        });
    }

    // All single moves on this incumbent + benchmark have been exhausted; synthesize
    // synergistic 2-move compound proposals ordered by learned single-move reward.
    let mut ranked: Vec<(f64, Move)> = all_single
        .into_iter()
        .filter(|change| !is_break_revert(change))
        .map(|change| (move_reward(stats, &change.id()), change))
        .collect();

    ranked.sort_by(|a, b| b.0.total_cmp(&a.0));

    let pool: Vec<(f64, Move)> = ranked.into_iter().take(8).collect();
    let mut best_combo: Option<(f64, Move)> = None;

    for i in 0..pool.len() {
        for j in i + 1..pool.len() {
            let (score_a, ref move_a) = pool[i];
            let (score_b, ref move_b) = pool[j];

            if move_target(move_a) == move_target(move_b) {
                continue;
            }

            let combo = Move::Combo {
                steps: vec![move_a.clone(), move_b.clone()],
            };
            let candidate = combo.apply(method);

            if candidate.same_recipe(method) || avoid_recipes.contains(&candidate.recipe_key()) {
                continue;
            }

            if stats.get(&combo.id()).and_then(|s| s.lost_on.as_deref())
                == Some(lost_marker.as_str())
            {
                continue;
            }

            let s = stats.get(&combo.id()).cloned().unwrap_or_default();
            let combined_score = if s.tried == 0 {
                score_a + score_b + 1.0
            } else {
                let tried = f64::from(s.tried);

                f64::from(s.kept) / tried
                    + 0.25 * (s.gain_sum / tried).clamp(-1.0, 1.0).max(0.0)
                    + (2.0 * log / tried).sqrt()
            };

            if best_combo
                .as_ref()
                .is_none_or(|(best, _)| combined_score > *best)
            {
                best_combo = Some((combined_score, combo));
            }
        }
    }

    best_combo.map(|(_, combo)| combo)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair(before: Option<u64>, after: Option<u64>) -> Pair {
        Pair {
            id: "x".into(),
            gates: 3,
            before,
            after,
            before_millis: 0,
            after_millis: 0,
        }
    }

    #[test]
    fn the_sign_test_matches_hand_counts() {
        assert!((sign_test(8, 0) - 1.0 / 256.0).abs() < 1e-12);
        assert!((sign_test(7, 1) - 9.0 / 256.0).abs() < 1e-12);
        assert!((sign_test(5, 1) - 7.0 / 64.0).abs() < 1e-12);
        assert_eq!(sign_test(0, 0), 1.0);
    }

    #[test]
    fn a_trial_needs_enough_clear_wins() {
        let wins = vec![pair(Some(10), Some(5)); 4];
        assert!(verdict(&wins).4);

        let mut mixed = vec![pair(Some(10), Some(5)); 5];
        mixed.push(pair(Some(10), Some(20)));
        assert!(!verdict(&mixed).4);

        let ties = vec![pair(Some(10), Some(10)); 8];
        assert!(!verdict(&ties).4);

        let few = vec![pair(Some(10), Some(5)); 3];
        assert!(!verdict(&few).4);
    }

    #[test]
    fn noise_deadband_and_wall_clock_guardrail_reject_spurious_wins() {
        assert_eq!(pair(Some(10_000), Some(9_950)).side(), Side::Tie);
        assert_eq!(pair(Some(10_000), Some(9_750)).side(), Side::Win);

        let slow_wins: Vec<Pair> = (0..6)
            .map(|_| Pair {
                id: "x".into(),
                gates: 5,
                before: Some(1_000),
                after: Some(900),
                before_millis: 1_000,
                after_millis: 3_000,
            })
            .collect();

        assert!(!verdict(&slow_wins).4);
    }

    #[test]
    fn timing_out_counts_against_the_side_that_timed_out() {
        assert_eq!(pair(None, Some(5)).side(), Side::Win);
        assert_eq!(pair(Some(5), None).side(), Side::Loss);
        assert_eq!(pair(None, None).side(), Side::Tie);
    }

    #[test]
    fn the_proposer_tries_everything_once_then_follows_what_worked() {
        let method = Method::default();
        let mut stats = BTreeMap::new();
        let avoid = BTreeSet::new();
        let first = propose(&method, &stats, "bench", &avoid).unwrap();

        assert_eq!(first.id(), "break:distinct=on");

        for change in moves(&method) {
            stats.insert(
                change.id(),
                MoveStats {
                    tried: 4,
                    kept: u32::from(change.id() == "preset:unsat") * 3,
                    lost_on: None,
                    gain_sum: if change.id() == "preset:unsat" {
                        2.0
                    } else {
                        0.0
                    },
                },
            );
        }

        assert_eq!(
            propose(&method, &stats, "bench", &avoid).unwrap().id(),
            "preset:unsat"
        );

        stats.get_mut("preset:unsat").unwrap().lost_on = Some(loss_key(&method, "bench"));

        assert_ne!(
            propose(&method, &stats, "bench", &avoid).unwrap().id(),
            "preset:unsat"
        );
        assert_eq!(
            propose(&method, &stats, "other", &avoid).unwrap().id(),
            "preset:unsat"
        );
    }

    #[test]
    fn the_proposer_avoids_reverts_and_synthesizes_combos_after_plateau() {
        let v1 = Method::default();
        let mut v2 = Move::Break {
            name: "distinct".into(),
            on: true,
        }
        .apply(&v1);
        v2.version = 2;

        let mut avoid = BTreeSet::new();
        avoid.insert(v1.recipe_key());
        avoid.insert(v2.recipe_key());

        let stats = BTreeMap::new();
        let next = propose(&v2, &stats, "bench", &avoid).unwrap();

        // Must NOT immediately revert distinct=on back to v1!
        assert_ne!(next.id(), "break:distinct=off");

        // Once all single moves lose on v2 + bench, it escalates to a 2-move combo.
        let mut exhausted = BTreeMap::new();
        let marker = loss_key(&v2, "bench");

        for change in moves(&v2) {
            exhausted.insert(
                change.id(),
                MoveStats {
                    tried: 1,
                    kept: 0,
                    lost_on: Some(marker.clone()),
                    gain_sum: if change.id() == "break:colex=on"
                        || change.id() == "break:symmetry=on"
                    {
                        0.4
                    } else {
                        0.0
                    },
                },
            );
        }

        let combo = propose(&v2, &exhausted, "bench", &avoid).unwrap();

        assert!(matches!(combo, Move::Combo { ref steps } if steps.len() == 2));
        assert!(combo.id().contains("break:colex=on"));
        assert!(combo.id().contains("break:symmetry=on"));
    }
}
