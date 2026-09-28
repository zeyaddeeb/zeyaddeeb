const THINK_OPEN: &str = "<think>";
const THINK_CLOSE: &str = "</think>";
const CALL_OPEN: &str = "<tool_call>";
const CALL_CLOSE: &str = "</tool_call>";
const TAGS: [&str; 4] = [THINK_OPEN, THINK_CLOSE, CALL_OPEN, CALL_CLOSE];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    Think(String),
    Say(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Say,
    Think,
    Call,
}

#[derive(Debug)]
pub struct Splitter {
    mode: Mode,
    carry: String,
    calls: Vec<String>,
}

impl Default for Splitter {
    fn default() -> Self {
        Splitter {
            mode: Mode::Say,
            carry: String::new(),
            calls: Vec::new(),
        }
    }
}

impl Splitter {
    pub fn push(&mut self, chunk: &str) -> Vec<Piece> {
        let mut text = std::mem::take(&mut self.carry);
        text.push_str(chunk);
        let mut pieces = Vec::new();
        loop {
            let next = TAGS
                .iter()
                .filter_map(|tag| text.find(tag).map(|at| (at, *tag)))
                .min_by_key(|(at, _)| *at);
            let Some((at, tag)) = next else { break };
            self.emit(&text[..at], &mut pieces);
            self.mode = match (self.mode, tag) {
                (Mode::Say, THINK_OPEN) => Mode::Think,
                (Mode::Think, THINK_CLOSE) => Mode::Say,
                (Mode::Say, CALL_OPEN) => {
                    self.calls.push(String::new());
                    Mode::Call
                }
                (Mode::Call, CALL_CLOSE) => Mode::Say,
                (mode, _) => mode,
            };
            text = text[at + tag.len()..].to_string();
        }
        let keep = partial_tag_suffix(&text);
        self.carry = text[text.len() - keep..].to_string();
        self.emit(&text[..text.len() - keep], &mut pieces);
        pieces
    }

    pub fn finish(&mut self) -> Vec<Piece> {
        let rest = std::mem::take(&mut self.carry);
        let mut pieces = Vec::new();
        self.emit(&rest, &mut pieces);
        pieces
    }

    pub fn calls(&self) -> &[String] {
        &self.calls
    }

    fn emit(&mut self, text: &str, pieces: &mut Vec<Piece>) {
        if text.is_empty() {
            return;
        }
        match self.mode {
            Mode::Say => pieces.push(Piece::Say(text.to_string())),
            Mode::Think => pieces.push(Piece::Think(text.to_string())),
            Mode::Call => {
                if let Some(call) = self.calls.last_mut() {
                    call.push_str(text);
                }
            }
        }
    }
}

fn partial_tag_suffix(text: &str) -> usize {
    (1..=text.len().min(CALL_CLOSE.len()))
        .rev()
        .filter(|&n| text.is_char_boundary(text.len() - n))
        .find(|&n| {
            let tail = &text[text.len() - n..];
            TAGS.iter().any(|tag| tag.starts_with(tail))
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(chunks: &[&str]) -> (String, String, Vec<String>) {
        let mut splitter = Splitter::default();
        let mut pieces: Vec<Piece> = chunks.iter().flat_map(|c| splitter.push(c)).collect();
        pieces.extend(splitter.finish());
        let mut think = String::new();
        let mut say = String::new();
        for piece in pieces {
            match piece {
                Piece::Think(t) => think.push_str(&t),
                Piece::Say(s) => say.push_str(&s),
            }
        }
        (think, say, splitter.calls().to_vec())
    }

    #[test]
    fn separates_thinking_from_speech_across_chunk_boundaries() {
        let (think, say, calls) = run(&["<thi", "nk>zeros re", "pel</th", "ink>Plan ahead."]);
        assert_eq!(think, "zeros repel");
        assert_eq!(say, "Plan ahead.");
        assert!(calls.is_empty());
    }

    #[test]
    fn captures_tool_calls_written_as_text() {
        let (_, say, calls) = run(&[
            "Checking.<tool_",
            "call>{\"name\": \"line\", \"arguments\": {}}</tool_call>",
        ]);
        assert_eq!(say, "Checking.");
        assert_eq!(
            calls,
            vec!["{\"name\": \"line\", \"arguments\": {}}".to_string()]
        );
    }

    #[test]
    fn keeps_plain_angle_brackets() {
        let (_, say, _) = run(&["x < 1 and y <", "= 2"]);
        assert_eq!(say, "x < 1 and y <= 2");
    }
}
