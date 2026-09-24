#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Empty,
    TooLong,
    Character,
    Word,
}

impl Refusal {
    pub fn message(self) -> &'static str {
        match self {
            Refusal::Empty => "Write a move first.",
            Refusal::TooLong => "Moves here are limited to 240 characters and 6 lines.",
            Refusal::Character => "That character is not allowed in moves here.",
            Refusal::Word => "That command is disabled here. Proof moves only.",
        }
    }
}

const MAX_BYTES: usize = 240;
const MAX_LINES: usize = 6;

const DENIED: &[&str] = &[
    "sorry",
    "admit",
    "io",
    "eio",
    "baseio",
    "st",
    "lean",
    "system",
    "process",
    "fs",
    "ffi",
    "panic",
    "extern",
    "implemented_by",
    "ofreducebool",
    "reducebool",
    "trustcompiler",
    "set_option",
    "open",
    "import",
    "macro",
    "macro_rules",
    "syntax",
    "elab",
    "notation",
    "infix",
    "infixl",
    "infixr",
    "prefix",
    "postfix",
    "attribute",
    "instance",
    "def",
    "abbrev",
    "axiom",
    "opaque",
    "initialize",
    "eval",
    "exit",
];

const DENIED_PREFIXES: &[&str] = &["unsafe", "native", "run_", "dbg", "builtin", "by_elab"];

pub fn tactic(text: &str) -> Result<(), Refusal> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Refusal::Empty);
    }
    if text.len() > MAX_BYTES || text.lines().count() > MAX_LINES {
        return Err(Refusal::TooLong);
    }
    if text
        .chars()
        .any(|c| (c.is_control() && c != '\n') || matches!(c, '#' | '"' | '`' | '$' | '\\'))
        || text.contains("@[")
    {
        return Err(Refusal::Character);
    }
    let words =
        text.split(|c: char| !(c.is_alphanumeric() || matches!(c, '_' | '\'' | '.' | '!' | '?')));
    for word in words.filter(|w| !w.is_empty()) {
        for part in word.split('.') {
            let part = part.trim_end_matches(['!', '?', '\'']).to_lowercase();
            if DENIED.contains(&part.as_str())
                || DENIED_PREFIXES
                    .iter()
                    .any(|prefix| part.starts_with(prefix))
            {
                return Err(Refusal::Word);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_proof_moves() {
        for text in [
            "rfl",
            "exact hp",
            "intro hp",
            "obtain ⟨hp, hq⟩ := h",
            "obtain hp | hq := h",
            "rw [h₁]",
            "rw [← Nat.add_assoc]",
            "induction n with\n| zero => ?_\n| succ k ih => ?_",
            "simp [Nat.add_comm]",
            "exact?",
            "omega",
            "decide",
            "exact h.2",
        ] {
            assert_eq!(tactic(text), Ok(()), "{text}");
        }
    }

    #[test]
    fn refuses_escape_hatches() {
        for text in [
            "sorry",
            "admit",
            "native_decide",
            "decide +native",
            "run_tac (IO.println 1 : IO Unit)",
            "exact (unsafeBaseIO (pure ()))",
            "exact Lean.ofReduceBool _ _ rfl",
            "set_option maxHeartbeats 0 in omega",
            "exact (dbg_trace 1 fun _ => rfl)",
            "exact System.Platform.numBits",
            "decide (config := {native := true})",
        ] {
            assert_eq!(tactic(text), Err(Refusal::Word), "{text}");
        }
        assert_eq!(tactic("#eval 1"), Err(Refusal::Character));
        assert_eq!(tactic("exact \"x\""), Err(Refusal::Character));
        assert_eq!(tactic("exact `(x)"), Err(Refusal::Character));
        assert_eq!(tactic("  "), Err(Refusal::Empty));
        assert_eq!(tactic(&"a".repeat(241)), Err(Refusal::TooLong));
    }
}
