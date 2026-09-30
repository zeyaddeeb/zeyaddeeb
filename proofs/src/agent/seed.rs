use super::memory::{Kind, Link, Node, Relation, Trust};

struct Entry {
    key: &'static str,
    kind: Kind,
    trust: Trust,
    front: &'static str,
    title: &'static str,
    body: &'static str,
    source: Option<&'static str>,
    lean: Option<&'static str>,
}

const ENTRIES: &[Entry] = &[
    Entry {
        key: "rh",
        kind: Kind::Target,
        trust: Trust::Open,
        front: "lean",
        title: "The Riemann hypothesis",
        body: "Every nontrivial zero of ζ(s) has real part 1/2.",
        source: Some("Riemann 1859"),
        lean: Some("theorem riemann_hypothesis : RiemannHypothesis"),
    },
    Entry {
        key: "functional-equation",
        kind: Kind::Theorem,
        trust: Trust::Mathlib,
        front: "lean",
        title: "Functional equation",
        body: "ζ(1 − s) = 2 (2π)^(−s) Γ(s) cos(πs/2) ζ(s) away from s = 1 and the non-positive integers. In Mathlib: riemannZeta_one_sub.",
        source: Some("Riemann 1859"),
        lean: None,
    },
    Entry {
        key: "trivial-zeros",
        kind: Kind::Theorem,
        trust: Trust::Mathlib,
        front: "lean",
        title: "Trivial zeros",
        body: "ζ(−2(n + 1)) = 0 for every natural n. In Mathlib: riemannZeta_neg_two_mul_nat_add_one.",
        source: None,
        lean: None,
    },
    Entry {
        key: "nonvanishing",
        kind: Kind::Theorem,
        trust: Trust::Mathlib,
        front: "lean",
        title: "No zeros on Re s ≥ 1",
        body: "ζ(s) ≠ 0 when Re s ≥ 1; this is the heart of the prime number theorem. In Mathlib: riemannZeta_ne_zero_of_one_le_re.",
        source: Some("Hadamard; de la Vallée Poussin 1896"),
        lean: None,
    },
    Entry {
        key: "zeta-two",
        kind: Kind::Theorem,
        trust: Trust::Mathlib,
        front: "lean",
        title: "The Basel problem",
        body: "ζ(2) = π²/6. In Mathlib: riemannZeta_two.",
        source: Some("Euler 1734"),
        lean: None,
    },
    Entry {
        key: "hardy",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "line",
        title: "Infinitely many zeros on the line",
        body: "Infinitely many zeros of ζ have real part exactly 1/2.",
        source: Some("Hardy 1914"),
        lean: None,
    },
    Entry {
        key: "conrey",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "line",
        title: "Two fifths on the line",
        body: "More than two fifths of the nontrivial zeros lie on the critical line.",
        source: Some("Conrey 1989"),
        lean: None,
    },
    Entry {
        key: "platt-trudgian",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "line",
        title: "Verified to 3·10¹²",
        body: "Every zero with 0 < t ≤ 3·10¹² lies on the critical line.",
        source: Some("Platt and Trudgian 2021"),
        lean: None,
    },
    Entry {
        key: "lehmer-pairs",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "offline",
        title: "Lehmer pairs",
        body: "Some neighboring zeros sit unusually close, and Z(t) barely crosses zero between them. Such pairs are why the de Bruijn–Newman constant cannot be negative.",
        source: Some("Lehmer 1956; Csordas, Smith and Varga 1994"),
        lean: None,
    },
    Entry {
        key: "de-bruijn-newman",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "offline",
        title: "De Bruijn–Newman constant",
        body: "The hypothesis holds exactly when Λ ≤ 0. Rodgers and Tao proved Λ ≥ 0, so it says Λ = 0: the hypothesis, if true, is barely true.",
        source: Some("Newman 1976; Rodgers and Tao 2020; Polymath 15 2019 (Λ ≤ 0.22)"),
        lean: None,
    },
    Entry {
        key: "montgomery",
        kind: Kind::Conjecture,
        trust: Trust::Literature,
        front: "spectra",
        title: "Pair correlation",
        body: "Normalized differences between zeros have density 1 − (sin πu / πu)², the statistics of eigenvalues of large random Hermitian matrices.",
        source: Some("Montgomery 1973; Odlyzko 1987"),
        lean: None,
    },
    Entry {
        key: "hilbert-polya",
        kind: Kind::Conjecture,
        trust: Trust::Literature,
        front: "spectra",
        title: "Hilbert–Pólya",
        body: "If the zeros were 1/2 + iγ with γ the eigenvalues of a self-adjoint operator, every γ would be real and the hypothesis would follow.",
        source: Some("Hilbert and Pólya, around 1914"),
        lean: None,
    },
    Entry {
        key: "robin",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "divisors",
        title: "Robin's inequality",
        body: "The hypothesis holds exactly when σ(n) < e^γ n log log n for every n > 5040.",
        source: Some("Robin 1984"),
        lean: None,
    },
    Entry {
        key: "lagarias",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "divisors",
        title: "Lagarias's inequality",
        body: "The hypothesis holds exactly when σ(n) ≤ H_n + exp(H_n) log H_n for every n ≥ 1, with H_n the harmonic numbers.",
        source: Some("Lagarias 2002"),
        lean: None,
    },
    Entry {
        key: "mertens-growth",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "mobius",
        title: "Mertens growth",
        body: "The hypothesis holds exactly when M(x) = O(x^(1/2 + ε)) for every ε > 0.",
        source: Some("Littlewood 1912"),
        lean: None,
    },
    Entry {
        key: "mertens-false",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "mobius",
        title: "Mertens was wrong",
        body: "|M(x)| < √x fails for some x, though no counterexample has ever been computed.",
        source: Some("Odlyzko and te Riele 1985"),
        lean: None,
    },
    Entry {
        key: "li",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "spectra",
        title: "Li's criterion",
        body: "The hypothesis holds exactly when λ_n = Σ_ρ [1 − (1 − 1/ρ)^n] ≥ 0 for every n ≥ 1.",
        source: Some("Li 1997"),
        lean: None,
    },
    Entry {
        key: "nyman-beurling",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "spectra",
        title: "Nyman–Beurling",
        body: "The hypothesis holds exactly when the indicator of (0, 1) lies in the L² closure of the span of the functions {θ/x} with 0 < θ ≤ 1.",
        source: Some("Nyman 1950; Beurling 1955"),
        lean: None,
    },
    Entry {
        key: "weil-curves",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "curves",
        title: "The hypothesis for curves",
        body: "For a curve over a finite field, every zero of its zeta function lies on the critical line. Deligne extended it to all smooth projective varieties.",
        source: Some("Weil 1948; Deligne 1974"),
        lean: None,
    },
    Entry {
        key: "hasse",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "curves",
        title: "Hasse's bound",
        body: "For an elliptic curve over F_p, |p + 1 − #E(F_p)| ≤ 2√p. This is the Riemann hypothesis for that curve.",
        source: Some("Hasse 1933"),
        lean: None,
    },
    Entry {
        key: "sato-tate",
        kind: Kind::Theorem,
        trust: Trust::Literature,
        front: "curves",
        title: "Sato–Tate",
        body: "For an elliptic curve over Q without complex multiplication, the angles θ_p with a_p = 2√p cos θ_p are distributed with density (2/π) sin²θ.",
        source: Some("Barnet-Lamb, Geraghty, Harris and Taylor 2011"),
        lean: None,
    },
    Entry {
        key: "weil-positivity",
        kind: Kind::Equivalence,
        trust: Trust::Literature,
        front: "curves",
        title: "Weil's positivity",
        body: "The hypothesis holds exactly when Weil's explicit-formula distribution is positive definite. Over finite fields this positivity is what the proof supplies.",
        source: Some("Weil 1952"),
        lean: None,
    },
    Entry {
        key: "no-zero-right",
        kind: Kind::Conjecture,
        trust: Trust::Open,
        front: "lean",
        title: "Nothing to the right",
        body: "A zero of ζ has real part below 1.",
        source: None,
        lean: Some("theorem zero_re_lt_one (s : ℂ) (hs : riemannZeta s = 0) : s.re < 1"),
    },
    Entry {
        key: "mirror",
        kind: Kind::Conjecture,
        trust: Trust::Open,
        front: "lean",
        title: "Zeros come in mirrored pairs",
        body: "If s is a zero inside the strip, so is 1 − s.",
        source: None,
        lean: Some("theorem zero_mirror (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 0"),
    },
    Entry {
        key: "nothing-left",
        kind: Kind::Conjecture,
        trust: Trust::Open,
        front: "lean",
        title: "Nothing to the left but trivial zeros",
        body: "A zero with real part at most 0 is a non-positive integer.",
        source: None,
        lean: Some("theorem zero_left (s : ℂ) (hs : riemannZeta s = 0) (h : s.re ≤ 0) : ∃ n : ℕ, s = -n"),
    },
    Entry {
        key: "strip",
        kind: Kind::Equivalence,
        trust: Trust::Open,
        front: "lean",
        title: "Only the strip matters",
        body: "The hypothesis is equivalent to: every zero with 0 < Re s < 1 has Re s = 1/2.",
        source: None,
        lean: Some("theorem rh_iff_strip : RiemannHypothesis ↔ ∀ s : ℂ, riemannZeta s = 0 → 0 < s.re → s.re < 1 → s.re = 1 / 2"),
    },
    Entry {
        key: "real-segment",
        kind: Kind::Conjecture,
        trust: Trust::Open,
        front: "lean",
        title: "No zeros on the real segment",
        body: "ζ(σ) ≠ 0 for real σ with 0 < σ < 1; in fact ζ(σ) < 0 there. A special case: the part of the strip on the real axis holds no zeros at all.",
        source: None,
        lean: Some("theorem zeta_ne_zero_real_strip (σ : ℝ) (h0 : 0 < σ) (h1 : σ < 1) : riemannZeta (σ : ℂ) ≠ 0"),
    },
];

const LINKS: &[(&str, Relation, &str)] = &[
    ("robin", Relation::Equivalent, "rh"),
    ("lagarias", Relation::Equivalent, "rh"),
    ("mertens-growth", Relation::Equivalent, "rh"),
    ("li", Relation::Equivalent, "rh"),
    ("nyman-beurling", Relation::Equivalent, "rh"),
    ("de-bruijn-newman", Relation::Equivalent, "rh"),
    ("weil-positivity", Relation::Equivalent, "rh"),
    ("hilbert-polya", Relation::Implies, "rh"),
    ("hardy", Relation::Supports, "rh"),
    ("conrey", Relation::Supports, "rh"),
    ("platt-trudgian", Relation::Supports, "rh"),
    ("montgomery", Relation::Supports, "hilbert-polya"),
    ("lehmer-pairs", Relation::Supports, "de-bruijn-newman"),
    ("hasse", Relation::Analogy, "rh"),
    ("weil-curves", Relation::Analogy, "rh"),
    ("weil-curves", Relation::Implies, "hasse"),
    ("sato-tate", Relation::Analogy, "montgomery"),
    ("no-zero-right", Relation::Uses, "nonvanishing"),
    ("mirror", Relation::Uses, "functional-equation"),
    ("nothing-left", Relation::Uses, "functional-equation"),
    ("nothing-left", Relation::Uses, "nonvanishing"),
    ("strip", Relation::Uses, "trivial-zeros"),
    ("strip", Relation::Uses, "no-zero-right"),
    ("strip", Relation::Uses, "nothing-left"),
    ("strip", Relation::Equivalent, "rh"),
    ("real-segment", Relation::Supports, "rh"),
];

pub fn nodes() -> Vec<Node> {
    ENTRIES
        .iter()
        .map(|entry| {
            let mut node = Node::new(entry.key, entry.kind, entry.trust, entry.title, entry.body);
            node.front = entry.front.to_string();
            node.source = entry.source.map(str::to_string);
            node.lean = entry.lean.map(str::to_string);
            node
        })
        .collect()
}

pub fn links() -> Vec<Link> {
    LINKS
        .iter()
        .map(|(from, relation, to)| Link {
            from: from.to_string(),
            to: to.to_string(),
            relation: *relation,
            episode: 0,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::fronts;

    #[test]
    fn links_point_at_seeded_keys() {
        let keys: Vec<&str> = ENTRIES.iter().map(|e| e.key).collect();
        for (from, _, to) in LINKS {
            assert!(keys.contains(from), "{from}");
            assert!(keys.contains(to), "{to}");
        }
    }

    #[test]
    fn every_entry_belongs_to_a_front() {
        for entry in ENTRIES {
            assert!(fronts::find(entry.front).is_some(), "{}", entry.key);
        }
        let mut keys: Vec<&str> = ENTRIES.iter().map(|e| e.key).collect();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), ENTRIES.len());
    }
}
