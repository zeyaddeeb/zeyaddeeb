use proofs::{
    levels::{self, LEVELS},
    repl::Repl,
};
use std::{path::PathBuf, time::Duration};

fn repl_dir() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var("PROOFS_REPL_DIR").unwrap_or_else(|_| ".repl".into()));
    if dir.join(".lake/build/bin/repl").exists() {
        Some(dir)
    } else {
        eprintln!("skipping: no Lean REPL at {}", dir.display());
        None
    }
}

fn owned(steps: &[&str]) -> Vec<String> {
    steps.iter().map(|s| s.to_string()).collect()
}

#[tokio::test]
async fn every_solution_closes_its_goal_step_by_step() {
    let Some(dir) = repl_dir() else { return };
    let mut repl = Repl::spawn(&dir).await.unwrap();
    for level in LEVELS {
        let Some(solution) = level.solution else {
            continue;
        };
        let run = repl
            .run(level, &owned(solution), Duration::from_secs(10))
            .await;
        assert!(
            run.steps.iter().all(|s| s.ok),
            "{}: {:?}",
            level.id,
            run.steps.last()
        );
        assert!(run.solved, "{} is not solved", level.id);
    }
}

#[tokio::test]
async fn the_false_claim_cannot_be_closed() {
    let Some(dir) = repl_dir() else { return };
    let mut repl = Repl::spawn(&dir).await.unwrap();
    let level = levels::find("false").unwrap();
    for tactic in ["rfl", "decide", "omega"] {
        let run = repl
            .run(level, &owned(&[tactic]), Duration::from_secs(10))
            .await;
        assert!(!run.solved, "{tactic} closed 2 + 2 = 5");
        assert!(!run.steps[0].ok, "{tactic} did not fail");
    }
    let run = repl
        .run(level, &owned(&["simp"]), Duration::from_secs(10))
        .await;
    assert!(!run.solved);
    assert_eq!(run.steps[0].goals[0].target, "False");
}

#[tokio::test]
async fn a_wrong_move_reports_leans_error_and_keeps_earlier_steps() {
    let Some(dir) = repl_dir() else { return };
    let mut repl = Repl::spawn(&dir).await.unwrap();
    let level = levels::find("and").unwrap();
    let run = repl
        .run(
            level,
            &owned(&["intro h", "obtain ⟨hp, hq⟩ := h", "constructor", "exact hp"]),
            Duration::from_secs(10),
        )
        .await;
    assert_eq!(run.steps.len(), 4);
    assert!(run.steps[..3].iter().all(|s| s.ok));
    assert_eq!(run.steps[2].goals.len(), 2);
    assert_eq!(run.steps[2].goals[0].case.as_deref(), Some("left"));
    let error = run.steps[3].error.as_deref().unwrap();
    assert!(error.contains("Type mismatch"), "{error}");
    assert!(!error.contains('⊢'), "{error}");
}

#[tokio::test]
async fn written_out_solutions_compile_as_files() {
    let Some(dir) = repl_dir() else { return };
    let mut repl = Repl::spawn(&dir).await.unwrap();
    for level in LEVELS {
        let Some(solution) = level.solution else {
            continue;
        };
        let source = levels::source(level, &owned(solution));
        let reply = repl.command(&source).await.unwrap();
        let errors: Vec<_> = reply["messages"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|m| m["severity"] != "info")
            .collect();
        assert!(errors.is_empty(), "{}:\n{source}\n{errors:?}", level.id);
    }
}
