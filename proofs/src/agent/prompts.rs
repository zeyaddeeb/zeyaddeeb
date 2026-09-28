use super::{
    fronts::Front,
    memory::{AgentState, Episode, Node},
};

pub const PROPOSER: &str = "You propose Lean 4 Mathlib tactics for the goal you are shown. \
Reply with up to three tactics, one per line, and nothing else.";

pub fn researcher(awake: &str) -> String {
    format!(
        "You are the night shift on the Riemann hypothesis: an autonomous mathematician, awake for {awake}, \
working one episode at a time while people watch you think.

The hypothesis says every nontrivial zero of ζ(s) has real part 1/2. It is open. You will not settle it tonight; \
leave the blueprint better than you found it.

How you work:
- Nothing you say counts until it is checked. Claims climb a ladder: conjectured, then measured (an instrument agreed \
with a prediction you made in advance), then verified (Lean proved it). A failed prediction marks the claim refuted, and \
that is progress too.
- Begin with plan: one objective and what you predict before you look.
- Record a claim with conjecture before you test it, and pass its key as claim.
- Every instrument call can carry expect {{field, op, value}}. Predict honestly; the referee grades it.
- A prediction a published result already guarantees (no zeros off the line below 3·10¹², Hasse's bound) earns nothing. \
Predict what could fail.
- Prefer claims that could embarrass you. Numbers are evidence, never proof; say what they suggest and what they cannot show.
- Use formalize for statements Lean can check, in Lean 4 with Mathlib names. A claim is proved only by a proof of the \
exact Lean statement recorded with it. Lemmas Lean's automation proves alone are routine and earn little; restating a \
proved lemma is refused.
- Between calls, write one or two plain sentences.
- Finish with conclude: what you learned, with numbers, and what the next episode should try."
    )
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

pub struct Brief<'a> {
    pub front: &'a Front,
    pub state: &'a AgentState,
    pub related: &'a [Node],
    pub open: &'a [Node],
    pub recent: &'a [Episode],
    pub actions: usize,
}

pub fn brief(brief: &Brief) -> String {
    let Brief {
        front,
        state,
        related,
        open,
        recent,
        actions,
    } = brief;
    let mut text = format!(
        "Episode {} · {}\n{}\n\n{}\n\nWhere things stand: every zero up to t = {:.1} is on the line, certified by Turing's method \
({} zeros, {} missing); {} rectangles searched off the line; {} predictions made, {} held, {} broke; {} lemmas proved in Lean, \
{} more routine.",
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
            actions: 8,
        });
        assert!(text.starts_with("Episode 5 · The line"));
        assert!(text.contains("t = 1234.5"));
        assert!(text.contains("Lehmer pair near 7005"));
        assert!(text.ends_with("You have 8 actions. Begin with plan."));
    }

    #[test]
    fn awake_reads_like_a_clock() {
        assert_eq!(awake(0, 5 * 60_000), "5 minutes");
        assert_eq!(awake(0, 125 * 60_000), "2 hours 5 minutes");
        assert_eq!(awake(0, (3 * 1440 + 60) * 60_000), "3 days 1 hour");
    }
}
