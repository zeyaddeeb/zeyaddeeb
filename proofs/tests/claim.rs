use proofs::{
    claim::{self, Audit, Ledger, KEYS},
    lean::workbench::{Config, Workbench},
};

#[test]
fn statements_are_the_archived_file() {
    assert!(claim::STATEMENTS.starts_with("import Mathlib\n"));

    for name in [
        "def RiemannZetaZerosOnLine : Prop",
        "def DirichletLNonvanishingRightOfHalf : Prop",
        "def DirichletLZerosOnLine : Prop",
        "def PrimitiveDirichletLZerosOnLine : Prop",
    ] {
        assert!(claim::STATEMENTS.contains(name), "{name}");
    }

    let steps = claim::steps();

    assert_eq!(steps.len(), KEYS.len());
    assert!(!steps[0].contains("import"));
}

#[tokio::test]
async fn every_step_checks_against_mathlib() {
    if !Workbench::new(Config::from_env(), Vec::new()).available() {
        eprintln!("skipping: no REPL or Mathlib (run moon run proofs:mathlib)");

        return;
    }

    let ledger = Ledger::new();

    ledger.run(Config::from_env()).await;

    let audit = ledger.audit();

    let Audit::Done { lines, .. } = &audit else {
        panic!("the audit did not finish: {audit:?}");
    };

    for line in lines {
        assert!(line.ok, "{}: {:?}", line.key, line.error);
        assert!(
            line.axioms.iter().all(
                |axiom| ["propext", "Classical.choice", "Quot.sound"].contains(&axiom.as_str())
            ),
            "{}: {:?}",
            line.key,
            line.axioms
        );
    }

    assert!(audit.passed());
}

#[tokio::test]
async fn a_wrong_statement_fails_the_audit() {
    let Some(mut bench) =
        Some(Workbench::new(Config::from_env(), Vec::new())).filter(Workbench::available)
    else {
        return;
    };

    let checked = bench
        .audit(&[
            claim::steps()[0].clone(),
            "theorem claim_is_not : DirichletLZerosOnLine = RiemannHypothesis := rfl".into(),
            "theorem after_failure : True := trivial".into(),
        ])
        .await;

    assert!(checked[0].ok, "{checked:?}");
    assert!(!checked[1].ok);
    assert!(!checked[2].ok);
    assert!(checked[2].errors[0].starts_with("Not run"));
}
