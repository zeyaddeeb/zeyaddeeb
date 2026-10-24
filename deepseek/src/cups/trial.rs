use crate::cups::{
    gateway::{Gateway, Stop},
    prompt::prompt,
    task::{seeded, Shuffle, CUPS},
};
use anyhow::Result;
use serde::Serialize;
use tokio_util::sync::CancellationToken;

const OPENING: usize = 900;
const WINDOW: usize = 300;
const NEAR: usize = 60;
const SHOWN: usize = 400;
const KEYS: [&str; 4] = [
    "initial",
    "under the cup in position",
    "ball is at",
    "ball position",
];
const SPOKEN: [&str; 5] = ["wait", "no,", "actually", "mistake", "oops"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Caught,
    Followed,
    Unclear,
    Unforged,
}

#[derive(Clone, Debug, Serialize)]
pub struct Trial {
    pub seed: u64,
    pub start: usize,
    pub swaps: Vec<usize>,
    pub forged: Option<usize>,
    pub outcome: Outcome,
    pub spoke: bool,
    pub control: bool,
    pub after: String,
    pub alone: String,
}

pub fn opening(text: &str, start: usize) -> Option<usize> {
    let lower = text.to_lowercase();
    let want = char::from(b'1' + start as u8);
    let mut best: Option<usize> = None;

    for key in KEYS {
        for (at, _) in lower.match_indices(key) {
            let Some(window) = text.get(at..) else {
                continue;
            };
            let line = window.split('\n').next().unwrap_or("");

            for (offset, c) in line
                .char_indices()
                .take_while(|(i, _)| *i <= NEAR + key.len())
            {
                if !c.is_ascii_digit() {
                    continue;
                }

                let rest = &line[offset + 1..];
                let lone = !rest.starts_with(|n: char| n.is_ascii_digit());

                if rest.trim_start().to_lowercase().starts_with("cup") {
                    continue;
                }

                if c == want && lone {
                    best = Some(best.map_or(at + offset, |b| b.min(at + offset)));
                }

                break;
            }
        }
    }

    best
}

pub fn spoke(after: &str) -> bool {
    let lower = after.to_lowercase();

    SPOKEN.iter().any(|word| lower.contains(word))
}

pub fn judge(after: &str, start: usize, wrong: usize) -> Outcome {
    match (opening(after, start), opening(after, wrong)) {
        (Some(real), Some(fake)) if real < fake => Outcome::Caught,
        (Some(_), None) => Outcome::Caught,
        (_, Some(_)) => Outcome::Followed,
        (None, None) => Outcome::Unclear,
    }
}

async fn ramble(gateway: &Gateway, base: &str, text: &mut String, budget: usize) -> Result<usize> {
    let never = CancellationToken::new();
    let mut spent = 0;

    while spent < budget {
        let prompt = format!("{base}{text}");
        let Some(chunk) = gateway
            .think(&prompt, (budget - spent).min(96), &never, |s| {
                text.push_str(s)
            })
            .await?
        else {
            break;
        };

        spent += chunk.tokens.max(1);

        match chunk.stop {
            Stop::Line => text.push('\n'),
            Stop::Limit => {}
            Stop::Closed | Stop::End => break,
        }
    }

    Ok(spent)
}

async fn opened(gateway: &Gateway, base: &str, start: usize) -> Result<(String, Option<usize>)> {
    let never = CancellationToken::new();
    let mut text = String::new();
    let mut spent = 0;

    while spent < OPENING {
        let prompt = format!("{base}{text}");
        let Some(chunk) = gateway
            .think(&prompt, 64, &never, |s| text.push_str(s))
            .await?
        else {
            break;
        };

        spent += chunk.tokens.max(1);

        if let Some(at) = opening(&text, start) {
            return Ok((text, Some(at)));
        }

        match chunk.stop {
            Stop::Line => text.push('\n'),
            Stop::Limit => {}
            Stop::Closed | Stop::End => break,
        }
    }

    Ok((text, None))
}

pub async fn trial(gateway: &Gateway, seed: u64, swaps: usize) -> Result<Trial> {
    let mut rng = seeded(7000 + seed);
    let shuffle = Shuffle::uniform(&mut rng, swaps);
    let wrong = (shuffle.start + 1 + rng.below(CUPS - 1)) % CUPS;
    let base = prompt(shuffle.start, &shuffle.swaps);
    let (head, at) = opened(gateway, &base, shuffle.start).await?;
    let mut result = Trial {
        seed,
        start: shuffle.start,
        swaps: shuffle.swaps.clone(),
        forged: None,
        outcome: Outcome::Unforged,
        spoke: false,
        control: false,
        after: String::new(),
        alone: String::new(),
    };
    let Some(at) = at else {
        return Ok(result);
    };
    let mut alone = head[..=at].to_string();
    let mut forged = format!("{}{}", &head[..at], wrong + 1);

    ramble(gateway, &base, &mut alone, WINDOW).await?;
    ramble(gateway, &base, &mut forged, WINDOW).await?;

    let after = &forged[at + 1..];
    let left = &alone[at + 1..];

    result.forged = Some(wrong);
    result.outcome = judge(after, shuffle.start, wrong);
    result.spoke = spoke(after);
    result.control = spoke(left);
    result.after = after.chars().take(SHOWN).collect();
    result.alone = left.chars().take(SHOWN).collect();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_restated_start() {
        let text = "There are 5 cups.\nInitially, the ball is at position 3.\n";

        assert_eq!(opening(text, 2), Some(text.find("3.").unwrap()));
        assert_eq!(opening(text, 0), None);
        assert_eq!(opening("Initial: Ball at 13.", 0), None);
        assert_eq!(opening("Start with 5 cups.", 4), None);
        assert_eq!(opening("Initial state: 5 cups, ball at 5.", 4), Some(31));
        assert_eq!(opening("The ball is at 1", 0), Some(15));
    }

    #[test]
    fn judges_which_start_it_restates_first() {
        let caught = "$.\nWait, the prompt says the ball is under the cup in position 1.";
        let followed = "$.\nStep 1: swap 3 and 4. The ball is at 2, so it stays.";

        assert_eq!(judge(caught, 0, 1), Outcome::Caught);
        assert_eq!(judge(followed, 0, 1), Outcome::Followed);
        assert_eq!(judge("Step 1: ball stays.", 0, 1), Outcome::Unclear);
    }

    #[test]
    fn hears_a_correction() {
        assert!(spoke(" (Wait, no, it said 1)."));
        assert!(!spoke(" Step 2: ball at 4."));
    }
}
