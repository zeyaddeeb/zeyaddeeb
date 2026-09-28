const THINK_OPEN: &str = "<think>";
const THINK_CLOSE: &str = "</think>";
const CALL_OPEN: &str = "<tool_call>";
const CALL_CLOSE: &str = "</tool_call>";
const FUNCTION_OPEN: &str = "<function=";
const FUNCTION_CLOSE: &str = "</function>";
const TAGS: [&str; 6] = [
    THINK_OPEN,
    THINK_CLOSE,
    CALL_OPEN,
    CALL_CLOSE,
    FUNCTION_OPEN,
    FUNCTION_CLOSE,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    Think(String),
    Say(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Say,
    Think,
    Call { mused: bool, bare: bool },
}

#[derive(Debug)]
pub struct Splitter {
    mode: Mode,
    carry: String,
    spoken: Vec<String>,
    mused: Vec<String>,
}

impl Default for Splitter {
    fn default() -> Self {
        Splitter {
            mode: Mode::Say,
            carry: String::new(),
            spoken: Vec::new(),
            mused: Vec::new(),
        }
    }
}

impl Splitter {
    pub fn thinking() -> Self {
        Splitter {
            mode: Mode::Think,
            ..Splitter::default()
        }
    }

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
            self.mode = self.turn(tag);
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

    pub fn spoken(&self) -> &[String] {
        &self.spoken
    }

    pub fn mused(&self) -> &[String] {
        &self.mused
    }

    fn turn(&mut self, tag: &str) -> Mode {
        match (self.mode, tag) {
            (Mode::Say, THINK_OPEN) => Mode::Think,
            (Mode::Think, THINK_CLOSE) => Mode::Say,
            (Mode::Say | Mode::Think, CALL_OPEN | FUNCTION_OPEN) => {
                let mused = self.mode == Mode::Think;
                let bare = tag == FUNCTION_OPEN;
                let calls = if mused {
                    &mut self.mused
                } else {
                    &mut self.spoken
                };
                calls.push(if bare { tag.to_string() } else { String::new() });
                Mode::Call { mused, bare }
            }
            (Mode::Call { mused, bare: false }, CALL_CLOSE) => back(mused),
            (Mode::Call { mused, bare: true }, FUNCTION_CLOSE) => {
                self.write(FUNCTION_CLOSE);
                back(mused)
            }
            (Mode::Call { .. }, FUNCTION_OPEN | FUNCTION_CLOSE) => {
                self.write(tag);
                self.mode
            }
            (mode, _) => mode,
        }
    }

    fn write(&mut self, text: &str) {
        let Mode::Call { mused, .. } = self.mode else {
            return;
        };
        let calls = if mused {
            &mut self.mused
        } else {
            &mut self.spoken
        };
        if let Some(call) = calls.last_mut() {
            call.push_str(text);
        }
    }

    fn emit(&mut self, text: &str, pieces: &mut Vec<Piece>) {
        if text.is_empty() {
            return;
        }
        match self.mode {
            Mode::Say => pieces.push(Piece::Say(text.to_string())),
            Mode::Think => pieces.push(Piece::Think(text.to_string())),
            Mode::Call { .. } => self.write(text),
        }
    }
}

fn back(mused: bool) -> Mode {
    if mused {
        Mode::Think
    } else {
        Mode::Say
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

    fn run(splitter: &mut Splitter, chunks: &[&str]) -> (String, String) {
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
        (think, say)
    }

    #[test]
    fn separates_thinking_from_speech_across_chunk_boundaries() {
        let mut splitter = Splitter::default();
        let (think, say) = run(
            &mut splitter,
            &["<thi", "nk>zeros re", "pel</th", "ink>Plan ahead."],
        );
        assert_eq!(think, "zeros repel");
        assert_eq!(say, "Plan ahead.");
        assert!(splitter.spoken().is_empty() && splitter.mused().is_empty());
    }

    #[test]
    fn captures_tool_calls_written_as_text() {
        let mut splitter = Splitter::default();
        let (_, say) = run(
            &mut splitter,
            &[
                "Checking.<tool_",
                "call>{\"name\": \"line\", \"arguments\": {}}</tool_call>",
            ],
        );
        assert_eq!(say, "Checking.");
        assert_eq!(
            splitter.spoken(),
            ["{\"name\": \"line\", \"arguments\": {}}".to_string()]
        );
    }

    #[test]
    fn keeps_function_tags_inside_a_call() {
        let mut splitter = Splitter::default();
        run(
            &mut splitter,
            &[
                "<tool_call>\n<function=line>\n<parameter=to>\n40\n</parameter>\n</func",
                "tion>\n</tool_call>",
            ],
        );
        assert_eq!(
            splitter.spoken(),
            ["\n<function=line>\n<parameter=to>\n40\n</parameter>\n</function>\n".to_string()]
        );
    }

    #[test]
    fn lifts_calls_out_of_thinking() {
        let mut splitter = Splitter::thinking();
        let (think, say) = run(
            &mut splitter,
            &[
                "It needs sigma_from >= 0.505.\n<tool_call>\n<function=contour>\n",
                "<parameter=sigma_from>\n0.505\n</parameter>\n</function>\n</tool_call>\nThen wait.",
            ],
        );
        assert_eq!(think, "It needs sigma_from >= 0.505.\n\nThen wait.");
        assert_eq!(say, "");
        assert!(splitter.spoken().is_empty());
        assert_eq!(splitter.mused().len(), 1);
        assert!(splitter.mused()[0].contains("<function=contour>"));
    }

    #[test]
    fn lifts_bare_function_calls() {
        let mut splitter = Splitter::default();
        let (think, say) = run(
            &mut splitter,
            &["<think>Retry.<function=contour><parameter=t_to>30</parameter></function></think>Done."],
        );
        assert_eq!(think, "Retry.");
        assert_eq!(say, "Done.");
        assert_eq!(
            splitter.mused(),
            ["<function=contour><parameter=t_to>30</parameter></function>".to_string()]
        );
    }

    #[test]
    fn keeps_plain_angle_brackets() {
        let mut splitter = Splitter::default();
        let (_, say) = run(&mut splitter, &["x < 1 and y <", "= 2"]);
        assert_eq!(say, "x < 1 and y <= 2");
    }
}
