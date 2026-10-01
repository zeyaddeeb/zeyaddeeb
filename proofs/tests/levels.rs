use proofs::playground::{
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

fn literals(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut chars = text.chars();

    while let Some(c) = chars.next() {
        match c {
            ']' => return found,
            '"' | '\'' => {
                let mut literal = String::new();

                while let Some(next) = chars.next() {
                    match next {
                        '\\' => match chars.next() {
                            Some('n') => literal.push('\n'),
                            Some('t') => literal.push('\t'),
                            Some(other) => literal.push(other),
                            None => break,
                        },
                        end if end == c => break,
                        other => literal.push(other),
                    }
                }

                found.push(literal);
            }
            _ => {}
        }
    }

    panic!("unterminated array in levels.ts");
}

fn client_levels() -> Vec<(String, Vec<String>)> {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../www/apps/www/features/proofs/levels.ts");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let mut ids = Vec::new();
    let mut solutions = Vec::new();

    for (offset, line) in text.split_inclusive('\n').scan(0, |at, line| {
        let start = *at;

        *at += line.len();

        Some((start, line))
    }) {
        let trimmed = line.trim_start();

        if let Some(rest) = trimmed.strip_prefix("id: \"") {
            ids.push(rest.split('"').next().unwrap_or_default().to_string());
        } else if trimmed.starts_with("solution: [") {
            let open = offset + line.find('[').unwrap() + 1;

            solutions.push(literals(&text[open..]));
        }
    }

    assert_eq!(ids.len(), solutions.len(), "every level needs a solution");

    ids.into_iter().zip(solutions).collect()
}

#[test]
fn client_levels_match_server_levels() {
    let client = client_levels();

    let server: Vec<(String, Vec<String>)> = LEVELS
        .iter()
        .map(|level| (level.id.to_string(), owned(level.solution.unwrap_or(&[]))))
        .collect();

    assert_eq!(client, server);
}
