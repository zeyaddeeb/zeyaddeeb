use std::collections::HashMap;

const SHORTEST: usize = 24;
const REPEATS: u32 = 3;

#[derive(Debug, Default)]
pub struct Echo {
    sentence: String,
    ended: bool,
    seen: HashMap<String, u32>,
}

impl Echo {
    pub fn push(&mut self, text: &str) -> bool {
        let mut looping = false;
        for c in text.chars() {
            if c == '\n' || (self.ended && c.is_whitespace()) {
                looping |= self.close();
            } else {
                self.sentence.push(c);
            }
            self.ended = matches!(c, '.' | '!' | '?');
        }
        looping
    }

    fn close(&mut self) -> bool {
        let sentence = std::mem::take(&mut self.sentence);
        let normal = sentence
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if normal.chars().count() < SHORTEST {
            return false;
        }
        let count = self.seen.entry(normal).or_default();
        *count += 1;
        *count >= REPEATS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hears_a_sentence_said_three_times() {
        let mut echo = Echo::default();
        let line = "Let me try with sigma_from=0.505 and sigma_to=0.6 again. ";
        assert!(!echo.push(line));
        assert!(!echo.push("Hmm, I'm stuck. "));
        assert!(!echo.push(&line.replace("0.6", "0.6 ")));
        assert!(echo.push(&line[..30]) || echo.push(&line[30..]));
    }

    #[test]
    fn lets_short_or_varied_sentences_repeat() {
        let mut echo = Echo::default();
        for height in [100, 200, 300, 400] {
            assert!(!echo.push("Wait, let me check. "));
            assert!(!echo.push(&format!("The block at t = {height}.5 holds its zeros.\n")));
        }
    }
}
