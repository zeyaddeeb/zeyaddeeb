use crate::cups::task::{CUPS, MOST, PAIRS};

pub const OPEN: &str = "<think>\n";
pub const CLOSE: &str = "</think>";
pub const ANSWER: &str = "\n</think>\n\nThe ball is in position ";
pub const WAIT: &str = "\nWait";
pub const BRIEF: &str = "Keep your thinking short.";

pub fn valid(start: usize, swaps: &[usize]) -> bool {
    start < CUPS
        && !swaps.is_empty()
        && swaps.len() <= MOST
        && swaps.iter().all(|&p| p < PAIRS.len())
}

pub fn question(start: usize, swaps: &[usize]) -> String {
    let steps: Vec<String> = swaps
        .iter()
        .enumerate()
        .map(|(i, &p)| {
            let (a, b) = PAIRS[p];

            format!(
                "{}. Swap the cups in positions {} and {}.",
                i + 1,
                a + 1,
                b + 1
            )
        })
        .collect();

    format!(
        "Five cups stand in a row, in positions 1 to 5 from left to right. \
         A ball is under the cup in position {}. The cups are then moved in this order:\n{}\n\
         A swap trades two cups between their positions, and the ball travels with its cup. \
         Which position is the ball in now? Answer with the position number.",
        start + 1,
        steps.join("\n")
    )
}

pub fn blurt(start: usize, swaps: &[usize]) -> String {
    format!(
        "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n{OPEN}\n{CLOSE}\n\nThe ball is in position ",
        question(start, swaps)
    )
}

pub fn prompt(start: usize, swaps: &[usize]) -> String {
    format!(
        "<|im_start|>user\n{} {BRIEF}<|im_end|>\n<|im_start|>assistant\n{OPEN}",
        question(start, swaps)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_question_names_every_swap_by_position() {
        let q = question(2, &[8, 0]);

        assert!(q.contains("A ball is under the cup in position 3."));
        assert!(q.contains(
            "1. Swap the cups in positions 3 and 5.\n2. Swap the cups in positions 1 and 2."
        ));
        assert!(prompt(2, &[8])
            .ends_with("Keep your thinking short.<|im_end|>\n<|im_start|>assistant\n<think>\n"));
        assert!(!blurt(2, &[8]).contains(BRIEF));
    }

    #[test]
    fn only_real_shuffles_are_asked() {
        assert!(valid(0, &[9]));
        assert!(!valid(5, &[0]));
        assert!(!valid(0, &[]));
        assert!(!valid(0, &[10]));
        assert!(!valid(0, &vec![0; MOST + 1]));
    }
}
