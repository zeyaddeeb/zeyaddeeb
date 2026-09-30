#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Empty,
    TooLong,
    BlockTooLong,
    Character,
    Word,
}

impl Refusal {
    pub fn message(self) -> &'static str {
        match self {
            Refusal::Empty => "Write a move first.",
            Refusal::TooLong => "Moves here are limited to 240 characters and 6 lines.",
            Refusal::BlockTooLong => "Proof blocks are limited to 1200 bytes and 24 lines.",
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

const DECLARATION_BYTES: usize = 4000;
const DECLARATION_LINES: usize = 60;
const DECLARATION_DENIED: &[&str] = &["partial", "mutual", "local", "scoped"];
const OPENERS: &[&str] = &["theorem", "lemma", "example", "open"];

pub fn tactic(text: &str) -> Result<(), Refusal> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Refusal::Empty);
    }
    if text.len() > MAX_BYTES || text.lines().count() > MAX_LINES {
        return Err(Refusal::TooLong);
    }
    words(text, &[])
}

pub fn declaration(text: &str) -> Result<(), Refusal> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Refusal::Empty);
    }
    if text.len() > DECLARATION_BYTES || text.lines().count() > DECLARATION_LINES {
        return Err(Refusal::TooLong);
    }
    let first = text.split_whitespace().next().unwrap_or("");
    if !OPENERS.contains(&first) {
        return Err(Refusal::Word);
    }
    for word in text.split(|c: char| !(c.is_alphanumeric() || c == '_')) {
        if DECLARATION_DENIED.contains(&word) {
            return Err(Refusal::Word);
        }
    }
    words(text, &["open"])
}

pub fn proof_block(text: &str) -> Result<(), Refusal> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Refusal::Empty);
    }
    if text.len() > 1200 || text.lines().count() > 24 {
        return Err(Refusal::BlockTooLong);
    }
    words(text, &[])
}

fn words(text: &str, allowed: &[&str]) -> Result<(), Refusal> {
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
            if (DENIED.contains(&part.as_str()) && !allowed.contains(&part.as_str()))
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
    fn proof_blocks_preserve_playground_limits_and_safety() {
        let script = "have hn : ∀ n : ℕ, s ≠ -n := by\n  rintro n rfl\n  have : (0 : ℝ) ≤ n := n.cast_nonneg\n  simp at h0\n  linarith\nhave h1' : s ≠ 1 := by\n  rintro rfl\n  simp at h1\nrw [riemannZeta_one_sub hn h1', hs, mul_zero]";
        assert_eq!(proof_block(script), Ok(()));
        assert_eq!(tactic(script), Err(Refusal::TooLong));
        for unsafe_script in [
            "have h : False := by sorry\nexact h.elim",
            "native_decide",
            "run_tac pure ()",
        ] {
            assert_eq!(proof_block(unsafe_script), Err(Refusal::Word));
        }
        assert_eq!(proof_block(&"rfl\n".repeat(25)), Err(Refusal::BlockTooLong));
        assert_eq!(proof_block(&"x".repeat(1201)), Err(Refusal::BlockTooLong));
    }

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

    #[test]
    fn declarations_allow_theorems_only() {
        for text in [
            "theorem zeta_two : riemannZeta 2 = (Real.pi : ℂ) ^ 2 / 6 := riemannZeta_two",
            "lemma sq_pos (x : ℝ) (h : 0 < x) : 0 < x ^ 2 := by positivity",
            "open Complex in\ntheorem t (s : ℂ) (h : 1 < s.re) : riemannZeta s ≠ 0 := by\n  exact riemannZeta_ne_zero_of_one_lt_re h",
            "example : (2 : ℕ) + 2 = 4 := by norm_num",
        ] {
            assert_eq!(declaration(text), Ok(()), "{text}");
        }
        for text in [
            "axiom rh : RiemannHypothesis",
            "theorem rh : RiemannHypothesis := sorry",
            "def f : ℕ := 1",
            "instance : Inhabited ℕ := ⟨0⟩",
            "theorem t : True := by native_decide",
            "open Lean in\ntheorem t : True := trivial",
            "theorem t : True := by run_tac pure ()",
            "partial theorem t : True := trivial",
            "theorem t : True := trivial\n#eval 1",
            "@[implemented_by f] theorem t : True := trivial",
            "theorem t : True := trivial\nset_option maxHeartbeats 0 in\ntheorem u : True := trivial",
            "theorem t : True := trivial\naxiom bad : False",
            "theorem t : True := trivial\nlocal notation \"x\" => 1",
        ] {
            assert!(declaration(text).is_err(), "{text}");
        }
    }
}
