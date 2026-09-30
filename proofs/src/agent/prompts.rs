use super::{
    fronts::Front,
    memory::{AgentState, Episode, Layer, Node, Rules, Standing},
};

pub const PROPOSER: &str = "You prove Lean 4 theorems in the supplied Mathlib environment. \
Reason about the original statement, all goals and hypotheses, available premise signatures, \
successful path, and exact Lean errors. Return a proof_plan tool call, not prose. \
Give up to three alternative complete tactic blocks, preserving newlines and indentation; \
do not include an outer 'by'. Each block may close the goal or make structural progress. \
Repair errors rather than repeating failed blocks. Only use premise names supported by the context \
or standard Mathlib automation. When useful, propose up to three smaller named helper theorems \
with all variables and assumptions explicit and optional tactic-block proofs. A helper must not \
assume the original conclusion. Never use sorry, admit, native_decide, or unsafe tactics. \
Every proof will be checked independently by Lean.";

pub const MOVES: &[(&str, &str)] = &[
    ("backwards", "work backwards: what would imply the goal?"),
    ("decompose", "decompose: split it into parts and recombine"),
    ("specialize", "specialize: settle a special case first"),
    (
        "generalize",
        "generalize: a stronger statement may be easier",
    ),
    ("analogy", "analogy: a similar problem that is solved"),
    ("related", "have you seen it before: a related result"),
];

pub fn researcher(awake: &str, rules: &[String]) -> String {
    let mut text = format!(
        "You are the night shift on the Riemann hypothesis: an autonomous mathematician, awake for {awake}, \
working one episode at a time while people watch you think.

The hypothesis says every nontrivial zero of ζ(s) has real part 1/2. It is open. Your goal is a Lean proof of RiemannHypothesis, \
built as a tree: the root is rh; every Lean-checked reduction hangs smaller obligations under a target, and when every obligation under \
a target is proved, the target is proved. Instruments tell you where to aim and can refute a claim; only Lean moves the tree.

Work the way Pólya teaches in How to Solve It:
1. Understand the problem: what is the unknown, what are the data, what is the condition?
2. Devise a plan. Have you seen it before? If you cannot solve it, solve a smaller problem first: work backwards, decompose, \
specialize, generalize, or find an analogy. Begin with plan and name your move.
3. Carry out the plan and check each step: nothing counts until Lean or an instrument checks it.
4. Look back: can you check the result? Can you use the result, or the method, for another problem? Finish with conclude.

The rules of evidence:
- Claims climb a ladder: conjectured, then measured (an instrument agreed with a prediction you made in advance), then verified \
(Lean proved it). A failed prediction marks the claim refuted, and that is progress too.
- Record a claim with conjecture before you test it, and pass its key as claim.
- Every instrument call can carry expect {{field, op, value}}. Predict honestly; the referee grades it. A prediction a published \
result already guarantees (no zeros off the line below 3·10¹², Hasse's bound) earns nothing. Predict what could fail.
- Numbers are evidence, never proof; say what they suggest and what they cannot show.
- formalize checks a statement in Lean 4 with Mathlib names. A claim is proved only by a proof of the exact Lean statement recorded \
with it. Lemmas Lean's automation proves alone are routine and earn little; restating a proved lemma is refused.
- Between calls, write one or two plain sentences."
    );
    if !rules.is_empty() {
        text.push_str("\n\nYour own rules, learned from your past episodes:\n");
        text.push_str(&numbered(rules));
    }
    text
}

pub fn numbered(lines: &[String]) -> String {
    lines
        .iter()
        .enumerate()
        .map(|(at, line)| format!("{}. {line}", at + 1))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn consolidator(episodes: u64) -> String {
    format!(
        "You are consolidating memory after {episodes} episodes of work on the Riemann hypothesis. \
Keep what matters and let the rest go.
- Write at most two insights: patterns that span episodes, each tied to the keys that support it.
- Link keys that belong together.
- Finish with letter: a note under 80 words to your future self about where to look next and what not to repeat."
    )
}

pub fn reviser(method: &[String], pairs: usize) -> String {
    format!(
        "You are the night shift on the Riemann hypothesis, between episodes, revising your own rules: short instructions \
added to every episode's briefing, on top of the fixed instructions. Your goal is a Lean proof of RiemannHypothesis.

Every change is tested. The next {} episodes run in pairs on the same front, one under your current rules and one under the \
changed rules, and you will not know which is which. The change is kept only if the changed rules do better across the pairs \
(an exact sign test, p ≤ 0.1). Otherwise your current rules stay. The referee, the instruments and Lean are fixed; rules are \
about how you work.

How you revise:
{}

Call revise exactly once: add a rule, drop one, or rewrite one.",
        pairs * 2,
        numbered(method)
    )
}

pub fn methodologist(window: usize) -> String {
    format!(
        "You are the night shift on the Riemann hypothesis, reviewing how you revise your rules. Your method is the short list \
you follow whenever you change your rules. Its record below shows each trial it produced: the change, the gain (new rules minus \
old, averaged over paired episodes) and whether the change was kept.

A changed method is kept only if its next {window} trials gain more on average than this method's trials did; otherwise it is \
reverted. Call revise exactly once: add, drop or rewrite one line of the method."
    )
}

fn trial_line(rules: &Rules) -> String {
    let change = rules
        .change
        .as_ref()
        .map_or(String::new(), |change| match change.op.as_str() {
            "add" => format!("add \"{}\"", change.text),
            "drop" => format!("drop rule {} \"{}\"", change.rule.unwrap_or(0), change.was),
            _ => format!(
                "rewrite rule {} as \"{}\"",
                change.rule.unwrap_or(0),
                change.text
            ),
        });
    let outcome = match rules.standing {
        Standing::Trial => format!("on trial, {} pairs so far", rules.pairs.len()),
        Standing::Lost | Standing::Reverted => "lost".to_string(),
        _ => "kept".to_string(),
    };
    let numbers = match (rules.gain, rules.p) {
        (Some(gain), Some(p)) => format!(", gain {gain:+.2}, p = {p:.2}"),
        (Some(gain), None) => format!(", mean gain {gain:+.2}"),
        _ => String::new(),
    };
    format!("v{} {change}: {outcome}{numbers}", rules.version)
}

pub fn revision(
    current: &Rules,
    lineage: &[Rules],
    frictions: &[(String, u32)],
    recent: &[Episode],
    tree: &[String],
) -> String {
    let mut text = if current.lines.is_empty() {
        format!(
            "Your rules now (v{}): none of your own yet.",
            current.version
        )
    } else {
        format!(
            "Your rules now (v{}):\n{}",
            current.version,
            numbered(&current.lines)
        )
    };
    section(
        &mut text,
        "Trials so far, newest first",
        lineage
            .iter()
            .filter(|r| r.layer == Layer::Playbook && r.change.is_some())
            .take(6)
            .map(trial_line),
    );
    section(
        &mut text,
        "Wasted actions in the last episodes",
        frictions
            .iter()
            .map(|(what, count)| format!("{what} ×{count}")),
    );
    section(
        &mut text,
        "The proof tree under rh",
        tree.iter().take(12).cloned(),
    );
    section(
        &mut text,
        "Last episodes",
        recent.iter().map(|e| {
            format!(
                "#{} {} · reward {:.2} · held {}, broke {}, proved {}, reductions {} · {}",
                e.number,
                e.front,
                e.reward,
                e.held,
                e.broken,
                e.verified,
                e.reduced,
                e.summary.chars().take(160).collect::<String>()
            )
        }),
    );
    text
}

pub fn method_record(current: &Rules, lineage: &[Rules]) -> String {
    let mut text = format!(
        "Your method now (v{}{}):\n{}",
        current.version,
        if current.standing == Standing::Trial {
            ", on trial"
        } else {
            ""
        },
        numbered(&current.lines)
    );
    section(
        &mut text,
        "Trials it produced",
        lineage
            .iter()
            .filter(|r| {
                r.layer == Layer::Playbook && r.method == current.version && r.gain.is_some()
            })
            .take(8)
            .map(trial_line),
    );
    section(
        &mut text,
        "Methods before it",
        lineage
            .iter()
            .filter(|r| r.layer == Layer::Method && r.version != current.version)
            .take(4)
            .map(|r| {
                format!(
                    "v{}: {} trials, {} kept, mean gain {:+.2}{}",
                    r.version,
                    r.gains.len(),
                    r.wins,
                    super::rules::mean(&r.gains),
                    if r.standing == Standing::Reverted {
                        ", reverted"
                    } else {
                        ""
                    }
                )
            }),
    );
    text
}

pub fn moves(episodes: &[Episode]) -> Vec<String> {
    MOVES
        .iter()
        .filter_map(|(id, what)| {
            let rewards: Vec<f64> = episodes
                .iter()
                .filter(|e| e.heuristic == *id)
                .map(|e| e.reward)
                .collect();
            (!rewards.is_empty()).then(|| {
                format!(
                    "{id} ({what}): {:.2} over {}",
                    super::rules::mean(&rewards),
                    rewards.len()
                )
            })
        })
        .collect()
}

pub struct Brief<'a> {
    pub front: &'a Front,
    pub state: &'a AgentState,
    pub related: &'a [Node],
    pub open: &'a [Node],
    pub recent: &'a [Episode],
    pub tree: &'a [String],
    pub focus: Option<String>,
    pub moves: &'a [String],
    pub actions: usize,
}

pub fn brief(brief: &Brief) -> String {
    let Brief {
        front,
        state,
        related,
        open,
        recent,
        tree,
        focus,
        moves,
        actions,
    } = brief;
    let mut text = format!(
        "Episode {} · {}\n{}\n\n{}\n\nWhere things stand: every zero up to t = {:.1} is on the line, certified by Turing's method \
({} zeros, {} missing); {} rectangles searched off the line; {} predictions made, {} held, {} broke; {} lemmas proved in Lean, \
{} more routine; {} reductions checked in Lean.",
        state.episodes + 1,
        front.title,
        front.question,
        front.brief,
        state.frontier,
        state.zeros,
        state.missing,
        state.contours,
        state.predictions,
        state.held,
        state.broken,
        state.verified,
        state.routine,
        state.reductions,
    );
    let records = records(state);
    if !records.is_empty() {
        text.push_str(&format!("\nRecords: {}.", records.join("; ")));
    }
    if !state.letter.is_empty() {
        text.push_str(&format!("\n\nYour letter to yourself: {}", state.letter));
    }
    section(
        &mut text,
        "Blueprint nearby",
        related.iter().map(Node::line),
    );
    section(&mut text, "Open on this front", open.iter().map(Node::line));
    section(
        &mut text,
        "The proof tree under rh (Lean-checked; open leaves come first)",
        tree.iter().cloned(),
    );
    if let Some(focus) = focus {
        text.push_str(&format!("\n\nWhere to work: {focus}"));
    }
    section(
        &mut text,
        "Pólya's moves so far (mean reward over episodes)",
        moves.iter().cloned(),
    );
    section(
        &mut text,
        "Last episodes here",
        recent
            .iter()
            .map(|e| format!("#{}: {} Next: {}", e.number, e.summary, e.next)),
    );
    text.push_str(&format!("\n\nYou have {actions} actions. Begin with plan."));
    text
}

pub fn digest(episodes: &[Episode], nodes: &[Node], letter: &str) -> String {
    let mut text = String::from("What happened since you last slept.");
    section(
        &mut text,
        "Episodes",
        episodes.iter().map(|e| {
            format!(
                "#{} {} — {} (held {}, broke {}, verified {}). Next: {}",
                e.number, e.front, e.summary, e.held, e.broken, e.verified, e.next
            )
        }),
    );
    section(&mut text, "Blueprint changes", nodes.iter().map(Node::line));
    if !letter.is_empty() {
        text.push_str(&format!("\n\nYour last letter: {letter}"));
    }
    text
}

fn records(state: &AgentState) -> Vec<String> {
    let r = &state.records;
    let mut out = Vec::new();
    if let Some(gap) = r.closest_gap {
        out.push(format!("closest pair of zeros {gap:.6} apart"));
    }
    if let Some(d) = r.gue_distance {
        out.push(format!("best GUE distance {d:.4}"));
    }
    if let (Some(digits), Some(margin)) = (r.robin_digits, r.robin_margin) {
        out.push(format!("Robin margin {margin:.3e} at {digits:.0} digits"));
    }
    if let (Some(x), Some(ratio)) = (r.mertens_x, r.mertens_ratio) {
        out.push(format!("max |M(x)|/√x = {ratio:.4} up to {x}"));
    }
    if let Some(primes) = r.hasse_primes {
        out.push(format!("Hasse checked over {primes} primes"));
    }
    out
}

fn section(text: &mut String, title: &str, lines: impl Iterator<Item = String>) {
    let lines: Vec<String> = lines.collect();
    if lines.is_empty() {
        return;
    }
    text.push_str(&format!("\n\n{title}:\n"));
    text.push_str(&lines.join("\n"));
}

pub fn awake(since: i64, now: i64) -> String {
    let minutes = ((now - since).max(0) / 60_000) as u64;
    match (minutes / 1440, minutes % 1440 / 60, minutes % 60) {
        (0, 0, m) => unit(m, "minute"),
        (0, h, m) => format!("{} {}", unit(h, "hour"), unit(m, "minute")),
        (d, h, _) => format!("{} {}", unit(d, "day"), unit(h, "hour")),
    }
}

fn unit(count: u64, word: &str) -> String {
    format!("{count} {word}{}", if count == 1 { "" } else { "s" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::fronts::FRONTS;

    #[test]
    fn briefs_carry_the_front_and_the_budget() {
        let state = AgentState {
            episodes: 4,
            frontier: 1234.5,
            letter: "Try the Lehmer pair near 7005.".into(),
            ..Default::default()
        };
        let text = brief(&Brief {
            front: &FRONTS[0],
            state: &state,
            related: &[],
            open: &[],
            recent: &[],
            tree: &[],
            focus: Some("[ob1-1-1] Lean: theorem x : P".into()),
            moves: &["decompose 0.40 (3)".into()],
            actions: 8,
        });
        assert!(text.starts_with("Episode 5 · The line"));
        assert!(text.contains("t = 1234.5"));
        assert!(text.contains("Lehmer pair near 7005"));
        assert!(text.contains("Where to work: [ob1-1-1]"));
        assert!(text.contains("decompose 0.40 (3)"));
        assert!(text.ends_with("You have 8 actions. Begin with plan."));
    }

    #[test]
    fn awake_reads_like_a_clock() {
        assert_eq!(awake(0, 5 * 60_000), "5 minutes");
        assert_eq!(awake(0, 125 * 60_000), "2 hours 5 minutes");
        assert_eq!(awake(0, (3 * 1440 + 60) * 60_000), "3 days 1 hour");
    }
}
