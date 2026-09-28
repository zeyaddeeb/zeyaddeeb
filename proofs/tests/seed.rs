use proofs::{
    agent::seed,
    lean::workbench::{Config, Workbench},
};

const REACHABLE: &[&str] = &[
    "theorem zero_re_lt_one (s : ℂ) (hs : riemannZeta s = 0) : s.re < 1 := by
  by_contra h
  exact riemannZeta_ne_zero_of_one_le_re (not_lt.mp h) hs",
    "theorem zero_mirror (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 0 := by
  have hn : ∀ n : ℕ, s ≠ -n := by
    rintro n rfl
    have : (0 : ℝ) ≤ n := n.cast_nonneg
    simp at h0
    linarith
  have h1' : s ≠ 1 := by
    rintro rfl
    simp at h1
  rw [riemannZeta_one_sub hn h1', hs, mul_zero]",
];

#[tokio::test]
async fn formal_targets_elaborate_and_the_first_rungs_are_reachable() {
    let mut bench = Workbench::new(Config::from_env(), Vec::new());
    if !bench.available() {
        eprintln!("skipping: no REPL or Mathlib");
        return;
    }
    for node in seed::nodes() {
        if let Some(statement) = &node.lean {
            let opened = bench.open(statement).await;
            assert!(opened.is_ok(), "{}: {opened:?}", node.key);
        }
    }
    for proof in REACHABLE {
        let checked = bench.check(proof).await;
        assert!(checked.ok, "{proof}\n{checked:?}");
    }
}
