use proofs::lean::workbench::{Config, Workbench};

fn bench() -> Option<Workbench> {
    let bench = Workbench::new(Config::from_env(), Vec::new());
    if bench.available() {
        Some(bench)
    } else {
        eprintln!("skipping: no REPL or Mathlib (run moon run proofs:mathlib)");
        None
    }
}

#[tokio::test]
async fn nested_proof_blocks_close_the_original_theorem() {
    let Some(mut bench) = bench() else { return };
    let statement = "theorem block_mirror (s : ℂ) (h0 : 0 < s.re) (h1 : s.re < 1) (hs : riemannZeta s = 0) : riemannZeta (1 - s) = 0";
    let script = "have hn : ∀ n : ℕ, s ≠ -n := by\n  rintro n rfl\n  have : (0 : ℝ) ≤ n := n.cast_nonneg\n  simp at h0\n  linarith\nhave h1' : s ≠ 1 := by\n  rintro rfl\n  simp at h1\nrw [riemannZeta_one_sub hn h1', hs, mul_zero]";
    let opened = bench.open(statement).await.unwrap();
    assert!(!bench.apply(opened.state, script).await.ok);
    let moved = bench.apply_block(opened.state, script).await;
    assert!(moved.ok && moved.goals.is_empty(), "{moved:?}");
    let proof = script
        .lines()
        .map(|line| format!("  {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    let checked = bench.check(&format!("{statement} := by\n{proof}")).await;
    assert!(checked.ok, "{checked:?}");
    assert!(
        !bench
            .check("theorem block_false : 2 + 2 = 5 := by omega")
            .await
            .ok
    );
}

#[tokio::test]
async fn proof_blocks_must_close_every_subgoal() {
    let Some(mut bench) = bench() else { return };
    let statement = "theorem both_parts (p q : Prop) (hp : p) (hq : q) : p ∧ q";
    let opened = bench.open(statement).await.unwrap();
    let split = bench.apply_block(opened.state, "constructor").await;
    assert!(split.ok, "{split:?}");
    assert_eq!(split.goals.len(), 2);
    let left = bench.apply_block(split.state.unwrap(), "exact hp").await;
    assert!(left.ok, "{left:?}");
    assert_eq!(left.goals.len(), 1);
    assert!(
        !bench
            .check(&format!("{statement} := by\n  constructor\n  exact hp"))
            .await
            .ok
    );
    let right = bench.apply_block(left.state.unwrap(), "exact hq").await;
    assert!(right.ok && right.goals.is_empty(), "{right:?}");
    assert!(
        bench
            .check(&format!(
                "{statement} := by\n  constructor\n  exact hp\n  exact hq"
            ))
            .await
            .ok
    );
}

#[tokio::test]
async fn mathlib_checks_adopts_and_searches() {
    let Some(mut bench) = bench() else { return };

    let two = bench
        .check("theorem agent_zeta_two : riemannZeta 2 = (Real.pi : ℂ) ^ 2 / 6 := riemannZeta_two")
        .await;
    assert!(two.ok, "{two:?}");
    assert_eq!(two.names, vec!["agent_zeta_two"]);
    assert!(two
        .axioms
        .iter()
        .all(|a| ["propext", "Classical.choice", "Quot.sound"].contains(&a.as_str())));

    let wrong = bench
        .check("theorem agent_wrong : riemannZeta 2 = 1 := riemannZeta_two")
        .await;
    assert!(!wrong.ok);
    assert!(!wrong.errors.is_empty());

    let cheat = bench
        .check("theorem agent_rh : RiemannHypothesis := sorry")
        .await;
    assert!(!cheat.ok);

    bench
        .adopt("theorem agent_lemma_two : riemannZeta 2 = (Real.pi : ℂ) ^ 2 / 6 := riemannZeta_two")
        .await
        .unwrap();
    let reuse = bench
        .check("theorem agent_reuse : riemannZeta 2 = (Real.pi : ℂ) ^ 2 / 6 := agent_lemma_two")
        .await;
    assert!(reuse.ok, "{reuse:?}");

    let opened = bench
        .open("theorem agent_right (s : ℂ) (h : 1 < s.re) : riemannZeta s ≠ 0")
        .await
        .unwrap();
    assert!(opened.goal.contains("riemannZeta s ≠ 0"), "{}", opened.goal);
    let stuck = bench.apply(opened.state, "norm_num").await;
    assert!(!stuck.ok || !stuck.goals.is_empty());
    let done = bench
        .apply(opened.state, "exact riemannZeta_ne_zero_of_one_lt_re h")
        .await;
    assert!(done.ok, "{done:?}");
    assert!(done.goals.is_empty());
}
