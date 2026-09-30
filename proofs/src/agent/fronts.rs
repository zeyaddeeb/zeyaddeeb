use super::tools::Tool;

pub struct Front {
    pub id: &'static str,
    pub title: &'static str,
    pub question: &'static str,
    pub brief: &'static str,
    pub instruments: &'static [Tool],
    pub query: &'static str,
}

pub const FRONTS: &[Front] = &[
    Front {
        id: "line",
        title: "The line",
        question: "Do the zeros keep landing on the line as we climb?",
        brief: "Extend the stretch of the critical line where every zero has been located and counted. \
Each stretch is cut into Gram blocks; Rosser's rule says how many sign changes of Hardy's Z-function a block must hold, \
and the Riemann–von Mangoldt formula predicts the total. A block that comes up short would be the first sign of zeros off the line. \
Watch the closest pairs: Lehmer pairs are where the line is most fragile.",
        instruments: &[Tool::Line, Tool::Spacing, Tool::Zeta],
        query: "zeros critical line Gram Rosser Lehmer pair",
    },
    Front {
        id: "offline",
        title: "Off the line",
        question: "If a zero hid off the line, where would it be?",
        brief: "Search rectangles right of the critical line with the argument principle: the winding of ζ around a rectangle counts the zeros inside. \
Zeros off the line come in pairs mirrored across Re s = 1/2, so the right half is enough. \
Aim where the line is most fragile, near the closest pairs of zeros, where Z(t) barely crosses zero. \
Rectangles need 0.505 ≤ sigma_from < sigma_to ≤ 1 and a height of at most 40.",
        instruments: &[Tool::Contour, Tool::Line, Tool::Zeta],
        query: "off the line argument principle rectangle Lehmer pair zero-free",
    },
    Front {
        id: "spectra",
        title: "Random matrices",
        question: "Do the zeros repel like eigenvalues?",
        brief: "Montgomery conjectured, and Odlyzko observed, that normalized gaps between zeros follow the statistics of large random Hermitian matrices (GUE), not of independent points (Poisson). \
If the zeros were the eigenvalues of a self-adjoint operator (Hilbert–Pólya), the hypothesis would follow. \
Measure spacing and pair correlation at different heights, compare them, and ask what such an operator would have to look like.",
        instruments: &[Tool::Spacing, Tool::Line],
        query: "GUE pair correlation Montgomery Hilbert Pólya operator spacing",
    },
    Front {
        id: "divisors",
        title: "Divisors",
        question: "Robin's inequality is the hypothesis in arithmetic. How close does it come to failing?",
        brief: "The hypothesis holds exactly when σ(n) < e^γ n log log n for every n > 5040 (Robin 1984). \
The tightest cases are colossally abundant numbers, built from a parameter ε: smaller ε, larger n. \
Measure the margin 1 − σ(n)/(e^γ n log log n) as n grows and model how fast it closes. A negative margin past 5040 would disprove the hypothesis.",
        instruments: &[Tool::Robin],
        query: "Robin inequality divisor sigma colossally abundant Lagarias",
    },
    Front {
        id: "mobius",
        title: "Möbius",
        question: "How fast can the Mertens function wander?",
        brief: "The hypothesis holds exactly when M(x) = Σ μ(n) grows no faster than x^(1/2+ε) for every ε > 0 (Littlewood 1912). \
The stronger Mertens conjecture |M(x)| < √x is false (Odlyzko and te Riele 1985), yet no counterexample has ever been computed. \
Measure the largest |M(x)|/√x you can reach and model how it grows.",
        instruments: &[Tool::Mertens],
        query: "Mertens function Möbius growth Littlewood square root",
    },
    Front {
        id: "curves",
        title: "Where it is true",
        question: "The hypothesis is a theorem for curves over finite fields. What makes it true there?",
        brief: "For an elliptic curve over F_p, the Riemann hypothesis is Hasse's bound |a_p| ≤ 2√p (Hasse 1933); Weil proved it for every curve and Deligne for varieties. \
It holds because the zeros are eigenvalues of Frobenius, a genuine operator, and a positivity argument pins them to a circle. \
Count points, check the bound, watch the Frobenius angles settle into the Sato–Tate law, and write down what the analogue for ζ would need.",
        instruments: &[Tool::Hasse],
        query: "Hasse Weil Frobenius elliptic curve finite field Sato Tate positivity",
    },
    Front {
        id: "lean",
        title: "The proof",
        question: "What stands between Mathlib and a proof of the hypothesis?",
        brief: "Attack RiemannHypothesis in Lean; the proof tree below shows what Lean has checked and what is still open. \
Mathlib already proves the functional equation (riemannZeta_one_sub), the trivial zeros (riemannZeta_neg_two_mul_nat_add_one) \
and non-vanishing on Re s ≥ 1 (riemannZeta_ne_zero_of_one_le_re). Two moves grow the tree: formalize proves an open statement outright, \
passing its key as claim; reduce proves in Lean that an open target follows from one to three smaller statements, which become new obligations under it. \
When every obligation under a target is proved, the target is proved by composition. Work on the open leaves first. \
Every lemma is checked by Lean, and #print axioms must show only propext, Classical.choice and Quot.sound.",
        instruments: &[Tool::Reduce],
        query: "Lean Mathlib lemma critical strip functional equation trivial zeros reduction obligation",
    },
];

pub fn find(id: &str) -> Option<&'static Front> {
    FRONTS.iter().find(|front| front.id == id)
}
