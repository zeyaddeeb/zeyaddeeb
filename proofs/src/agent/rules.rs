use super::{
    desk::{normalized, REPEATED},
    memory::{Acted, AgentState, Change, Half, Layer, Pair, Rules, Standing},
};
use serde_json::Value;

pub const ALPHA: f64 = 0.1;
pub const META: usize = 3;
const LINE_MIN: usize = 12;
const LINE_MAX: usize = 200;
const BECAUSE_MAX: usize = 240;
const FRICTIONS: usize = 5;
const SCORE_WORDS: &[&str] = &[
    "reward", "rewards", "score", "scores", "scoring", "referee", "grade", "graded", "grading",
];

pub fn seed_method() -> Vec<String> {
    [
        "Fix what wasted the most actions first: a refused call earns nothing.",
        "Write a rule as an instruction that names the tool, the field or the number.",
        "Aim rules at the Lean proof tree under the hypothesis before anything else.",
        "When a change loses, try a different idea rather than a rewording.",
    ]
    .iter()
    .map(|line| line.to_string())
    .collect()
}

pub fn limit(layer: Layer) -> usize {
    match layer {
        Layer::Playbook => 6,
        Layer::Method => 5,
    }
}

fn rule_number(args: &Value) -> Option<usize> {
    match &args["rule"] {
        Value::Number(number) => number.as_u64().map(|n| n as usize),
        Value::String(text) => text.trim().trim_start_matches('#').parse().ok(),
        _ => None,
    }
}

fn about_the_score(text: &str) -> bool {
    text.split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .any(|word| SCORE_WORDS.contains(&word.as_str()))
}

pub fn apply(
    layer: Layer,
    lines: &[String],
    args: &Value,
    lineage: &[Rules],
) -> Result<(Vec<String>, Change), String> {
    let op = args["change"]
        .as_str()
        .map(|op| op.trim().to_lowercase())
        .unwrap_or_default();
    let because: String = args["because"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default()
        .chars()
        .take(BECAUSE_MAX)
        .collect();
    if because.is_empty() {
        return Err("Say why in because: what you saw that this change should fix.".into());
    }
    let text = args["text"].as_str().map(str::trim).unwrap_or_default();
    let mut next = lines.to_vec();
    let index = match op.as_str() {
        "add" => None,
        "drop" | "rewrite" => {
            let Some(number) = rule_number(args) else {
                return Err(format!("Say which rule to {op}, by its number."));
            };
            if number == 0 || number > lines.len() {
                return Err(match lines.len() {
                    0 => format!("There are no rules to {op} yet; add one."),
                    count => format!("There is no rule {number}; the rules run from 1 to {count}."),
                });
            }
            Some(number - 1)
        }
        _ => return Err("change must be add, drop or rewrite.".into()),
    };
    if op != "drop" {
        let length = text.chars().count();
        if length < LINE_MIN {
            return Err("Write the rule in text: one instruction of at least a few words.".into());
        }
        if length > LINE_MAX {
            return Err(format!(
                "Keep a rule under {LINE_MAX} characters; yours has {length}."
            ));
        }
        if about_the_score(text) {
            return Err(
                "Rules are about how you work, not about the score. The referee and the score are fixed."
                    .into(),
            );
        }
        let wanted = normalized(text);
        if let Some(twin) = lines
            .iter()
            .enumerate()
            .find(|(at, line)| Some(*at) != index && normalized(line) == wanted)
        {
            return Err(format!("Rule {} already says that.", twin.0 + 1));
        }
        if index.is_some_and(|at| normalized(&lines[at]) == wanted) {
            return Err("That rewrite changes nothing.".into());
        }
    }
    if op == "add" && lines.len() >= limit(layer) {
        return Err(format!(
            "You have {} rules, the most allowed; drop or rewrite one.",
            lines.len()
        ));
    }
    let was = index.map(|at| lines[at].clone()).unwrap_or_default();
    let change = Change {
        op: op.clone(),
        rule: index.map(|at| at as u32 + 1),
        text: if op == "drop" {
            String::new()
        } else {
            text.to_string()
        },
        was,
        because,
    };
    if let Some(lost) = lineage.iter().find(|rules| {
        rules.layer == layer
            && matches!(rules.standing, Standing::Lost | Standing::Reverted)
            && rules
                .change
                .as_ref()
                .is_some_and(|tried| same(tried, &change))
    }) {
        return Err(format!(
            "v{} tried exactly this and lost{}. Try a different idea.",
            lost.version,
            lost.p.map(|p| format!(" (p = {p:.2})")).unwrap_or_default()
        ));
    }
    match (op.as_str(), index) {
        ("add", _) => next.push(text.to_string()),
        ("drop", Some(at)) => {
            next.remove(at);
        }
        (_, Some(at)) => next[at] = text.to_string(),
        _ => {}
    }
    Ok((next, change))
}

fn same(tried: &Change, change: &Change) -> bool {
    tried.op == change.op
        && normalized(&tried.text) == normalized(&change.text)
        && normalized(&tried.was) == normalized(&change.was)
}

pub fn sign_flip(diffs: &[f64]) -> f64 {
    let n = diffs.len().min(20);
    if n == 0 {
        return 1.0;
    }
    let diffs = &diffs[..n];
    let observed: f64 = diffs.iter().sum();
    let patterns = 1u64 << n;
    let at_least = (0..patterns)
        .filter(|mask| {
            let total: f64 = diffs
                .iter()
                .enumerate()
                .map(|(i, d)| {
                    if mask >> i & 1 == 1 {
                        -d.abs()
                    } else {
                        d.abs()
                    }
                })
                .sum();
            total >= observed - 1e-9
        })
        .count();
    at_least as f64 / patterns as f64
}

pub fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

pub struct Verdict {
    pub gain: f64,
    pub p: f64,
    pub kept: bool,
}

pub fn verdict(pairs: &[Pair]) -> Verdict {
    let diffs: Vec<f64> = pairs.iter().map(Pair::gain).collect();
    let gain = mean(&diffs);
    let p = sign_flip(&diffs);
    Verdict {
        gain,
        p,
        kept: p <= ALPHA && gain > 0.0,
    }
}

pub fn method_holds(method: &Rules, parent: Option<&Rules>) -> bool {
    let Some(parent) = parent.filter(|parent| !parent.gains.is_empty()) else {
        return true;
    };
    let tried = &method.gains[..method.gains.len().min(META)];
    mean(tried) > mean(&parent.gains)
}

pub fn next_run(state: &AgentState, pairs_done: usize) -> (Option<String>, u64) {
    if state.challenger == 0 {
        return (None, state.rules);
    }
    if let Some(half) = &state.half {
        let other = if half.version == state.rules {
            state.challenger
        } else {
            state.rules
        };
        return (Some(half.front.clone()), other);
    }
    let first = if pairs_done.is_multiple_of(2) {
        state.rules
    } else {
        state.challenger
    };
    (None, first)
}

pub fn settle(
    state: &mut AgentState,
    front: &str,
    version: u64,
    reward: f64,
    episode: u64,
) -> Option<Pair> {
    if state.challenger == 0 || (version != state.rules && version != state.challenger) {
        return None;
    }
    let half = Half {
        front: front.to_string(),
        version,
        reward,
        episode,
    };
    match state.half.take() {
        Some(first) if first.front == half.front && first.version != half.version => {
            let (champion, challenger) = if first.version == state.rules {
                (first, half)
            } else {
                (half, first)
            };
            Some(Pair {
                front: champion.front,
                champion: champion.reward,
                challenger: challenger.reward,
                champion_episode: champion.episode,
                challenger_episode: challenger.episode,
            })
        }
        _ => {
            state.half = Some(half);
            None
        }
    }
}

fn reason(summary: &str) -> String {
    let text = summary.strip_prefix(REPEATED).unwrap_or(summary);
    let text = text.split(" You sent ").next().unwrap_or(text).trim();
    let sentence = match text.find(". ") {
        Some(at) => &text[..=at],
        None => text,
    };
    let clipped: String = sentence.chars().take(140).collect();
    if clipped.len() < sentence.len() {
        format!("{clipped}…")
    } else {
        clipped
    }
}

pub fn frictions(acted: &[Acted]) -> Vec<(String, u32)> {
    let mut counts: Vec<(String, u32)> = Vec::new();
    let mut bump = |what: String| match counts.iter_mut().find(|(seen, _)| *seen == what) {
        Some((_, count)) => *count += 1,
        None => counts.push((what, 1)),
    };
    for turn in acted {
        if turn.calls.is_empty() {
            bump("no tool call".to_string());
        }
        for call in turn.calls.iter().filter(|call| !call.ok) {
            bump(format!("{}: {}", call.tool, reason(&call.summary)));
        }
    }
    counts.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    counts.truncate(FRICTIONS);
    counts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::memory::Call;
    use serde_json::json;

    fn lost(change: Change) -> Rules {
        let mut rules = Rules::seed(Layer::Playbook, Vec::new(), 0);
        rules.version = 4;
        rules.standing = Standing::Lost;
        rules.p = Some(0.5);
        rules.change = Some(change);
        rules
    }

    #[test]
    fn edits_add_drop_and_rewrite_one_rule() {
        let lines = vec!["Pass claim on every measurement.".to_string()];
        let (added, change) = apply(
            Layer::Playbook,
            &lines,
            &json!({"change": "add", "text": "Plan with the instrument you will use.", "because": "Plans named no tool."}),
            &[],
        )
        .unwrap();
        assert_eq!(added.len(), 2);
        assert_eq!(change.rule, None);
        let (dropped, change) = apply(
            Layer::Playbook,
            &lines,
            &json!({"change": "drop", "rule": "1", "because": "It never helped."}),
            &[],
        )
        .unwrap();
        assert!(dropped.is_empty());
        assert_eq!(change.was, lines[0]);
        let (rewritten, _) = apply(
            Layer::Playbook,
            &lines,
            &json!({"change": "rewrite", "rule": 1, "text": "Pass claim whenever a conjecture is open.", "because": "Sharper."}),
            &[],
        )
        .unwrap();
        assert_eq!(rewritten[0], "Pass claim whenever a conjecture is open.");
    }

    #[test]
    fn refuses_what_cannot_be_tested_cleanly() {
        let lines = vec!["Pass claim on every measurement.".to_string()];
        let refused = |args: Value| apply(Layer::Playbook, &lines, &args, &[]).unwrap_err();
        assert!(refused(
            json!({"change": "add", "text": "Pass claim on every measurement!", "because": "x"})
        )
        .contains("already says"));
        assert!(refused(
            json!({"change": "add", "text": "Maximize the reward every time.", "because": "x"})
        )
        .contains("not about the score"));
        assert!(
            refused(json!({"change": "drop", "rule": 3, "because": "x"})).contains("from 1 to 1")
        );
        assert!(
            refused(json!({"change": "add", "text": "Plan first please.", "because": ""}))
                .contains("because")
        );
        assert!(refused(json!({"change": "swap", "because": "x"})).contains("add, drop or rewrite"));
        let full: Vec<String> = (0..6)
            .map(|i| format!("Rule number {i} says something."))
            .collect();
        assert!(apply(
            Layer::Playbook,
            &full,
            &json!({"change": "add", "text": "One more rule to follow.", "because": "x"}),
            &[]
        )
        .unwrap_err()
        .contains("drop or rewrite"));
    }

    #[test]
    fn a_change_that_lost_is_not_tried_again() {
        let args =
            json!({"change": "add", "text": "Use reduce before formalize.", "because": "Try it."});
        let (_, change) = apply(Layer::Playbook, &[], &args, &[]).unwrap();
        let error = apply(Layer::Playbook, &[], &args, &[lost(change)]).unwrap_err();
        assert!(
            error.contains("v4 tried exactly this and lost (p = 0.50)"),
            "{error}"
        );
        let other = json!({"change": "add", "text": "Use reduce with one obligation.", "because": "Try it."});
        assert!(apply(Layer::Playbook, &[], &other, &[]).is_ok());
    }

    #[test]
    fn the_exact_sign_test_counts_every_relabeling() {
        assert_eq!(sign_flip(&[0.2, 0.1, 0.3, 0.4]), 1.0 / 16.0);
        assert_eq!(sign_flip(&[0.5, 0.4, 0.3, 0.2, -0.1]), 2.0 / 32.0);
        assert_eq!(sign_flip(&[0.0, 0.0, 0.0]), 1.0);
        assert_eq!(sign_flip(&[-0.2, -0.1]), 1.0);
        assert_eq!(sign_flip(&[]), 1.0);
        let pairs: Vec<Pair> = [0.3, 0.2, 0.4, 0.1, 0.2]
            .iter()
            .map(|gain| Pair {
                front: "line".into(),
                champion: 0.1,
                challenger: 0.1 + gain,
                champion_episode: 1,
                challenger_episode: 2,
            })
            .collect();
        let judged = verdict(&pairs);
        assert!(judged.kept && judged.p <= ALPHA && judged.gain > 0.0);
        let judged = verdict(&pairs[..3]);
        assert!(!judged.kept, "three pairs can never reach p ≤ 0.1");
    }

    #[test]
    fn pairs_share_a_front_and_alternate_which_rules_go_first() {
        let mut state = AgentState {
            rules: 1,
            challenger: 2,
            ..Default::default()
        };
        assert_eq!(next_run(&state, 0), (None, 1));
        assert_eq!(next_run(&state, 1), (None, 2));
        assert!(settle(&mut state, "line", 1, 0.2, 10).is_none());
        assert_eq!(next_run(&state, 0), (Some("line".into()), 2));
        let pair = settle(&mut state, "line", 2, 0.5, 11).unwrap();
        assert_eq!((pair.champion, pair.challenger), (0.2, 0.5));
        assert_eq!((pair.champion_episode, pair.challenger_episode), (10, 11));
        assert!(state.half.is_none());
        assert!(settle(&mut state, "lean", 2, 0.4, 12).is_none());
        let pair = settle(&mut state, "lean", 1, 0.1, 13).unwrap();
        assert_eq!((pair.champion, pair.challenger), (0.1, 0.4));
        let mut idle = AgentState {
            rules: 3,
            ..Default::default()
        };
        assert_eq!(next_run(&idle, 0), (None, 3));
        assert!(settle(&mut idle, "line", 3, 0.2, 1).is_none());
        assert!(idle.half.is_none());
    }

    #[test]
    fn a_method_is_kept_only_if_its_trials_gain_more() {
        let mut parent = Rules::seed(Layer::Method, Vec::new(), 0);
        parent.gains = vec![0.1, -0.1, 0.0];
        let mut child = parent.clone();
        child.version = 2;
        child.gains = vec![0.2, 0.0, 0.1];
        assert!(method_holds(&child, Some(&parent)));
        child.gains = vec![-0.2, 0.0, 0.1];
        assert!(!method_holds(&child, Some(&parent)));
        assert!(method_holds(&child, None));
    }

    #[test]
    fn frictions_group_refusals_by_their_first_sentence() {
        let refused = |tool: &str, summary: &str| Call {
            id: "c".into(),
            tool: tool.into(),
            args: Value::Null,
            ok: false,
            summary: summary.into(),
            verdict: None,
            data: Value::Null,
        };
        let acted = vec![
            Acted {
                episode: 1,
                calls: vec![refused(
                    "contour",
                    "Rectangles need a height of at most 40. You sent {\"t_to\":90}.",
                )],
            },
            Acted {
                episode: 1,
                calls: vec![refused(
                    "contour",
                    &format!("{REPEATED}Rectangles need a height of at most 40. You sent {{}}."),
                )],
            },
            Acted {
                episode: 2,
                calls: Vec::new(),
            },
        ];
        let found = frictions(&acted);
        assert_eq!(
            found[0],
            (
                "contour: Rectangles need a height of at most 40.".to_string(),
                2
            )
        );
        assert_eq!(found[1], ("no tool call".to_string(), 1));
    }
}
