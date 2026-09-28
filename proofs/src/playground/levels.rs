pub struct Level {
    pub id: &'static str,
    pub statement: &'static str,
    pub solution: Option<&'static [&'static str]>,
}

pub const LEVELS: &[Level] = &[
    Level {
        id: "compute",
        statement: "theorem two_add_two : 2 + 2 = 4",
        solution: Some(&["rfl"]),
    },
    Level {
        id: "false",
        statement: "theorem two_add_two_eq_five : 2 + 2 = 5",
        solution: None,
    },
    Level {
        id: "exact",
        statement: "theorem use_it (p : Prop) (hp : p) : p",
        solution: Some(&["exact hp"]),
    },
    Level {
        id: "intro",
        statement: "theorem keep_first (p q : Prop) : p → q → p",
        solution: Some(&["intro hp", "intro hq", "exact hp"]),
    },
    Level {
        id: "and",
        statement: "theorem and_swap (p q : Prop) : p ∧ q → q ∧ p",
        solution: Some(&[
            "intro h",
            "obtain ⟨hp, hq⟩ := h",
            "constructor",
            "exact hq",
            "exact hp",
        ]),
    },
    Level {
        id: "or",
        statement: "theorem or_swap (p q : Prop) : p ∨ q → q ∨ p",
        solution: Some(&[
            "intro h",
            "obtain hp | hq := h",
            "right",
            "exact hp",
            "left",
            "exact hq",
        ]),
    },
    Level {
        id: "rewrite",
        statement: "theorem chain (a b c : Nat) (h₁ : a = b) (h₂ : b = c) : a = c",
        solution: Some(&["rw [h₁]", "rw [h₂]"]),
    },
    Level {
        id: "induction",
        statement: "theorem zero_add' (n : Nat) : 0 + n = n",
        solution: Some(&[
            "induction n with\n| zero => ?_\n| succ k ih => ?_",
            "rfl",
            "rw [← Nat.add_assoc]",
            "rw [ih]",
        ]),
    },
    Level {
        id: "automate",
        statement: "theorem shuffle (a b c : Nat) : a + b + c = c + (b + a)",
        solution: Some(&["omega"]),
    },
];

pub fn find(id: &str) -> Option<&'static Level> {
    LEVELS.iter().find(|level| level.id == id)
}

pub fn source(level: &Level, steps: &[String]) -> String {
    let mut text = format!("{} := by\n", level.statement);
    for step in steps {
        for line in step.lines() {
            text.push_str("  ");
            text.push_str(line);
            text.push('\n');
        }
    }
    text
}
