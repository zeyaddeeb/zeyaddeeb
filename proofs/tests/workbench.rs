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
