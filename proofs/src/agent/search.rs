use super::{
    live::{Event, SearchStep},
    llm::Helper,
    memory::{Lemma, ProofExperience, ProofFailure},
    Agent,
};
use crate::lean::{
    goals, guard,
    workbench::{declared, signature},
};
use serde_json::json;
use std::{
    collections::{HashSet, VecDeque},
    hash::{Hash, Hasher},
    time::{Duration, Instant},
};

const AUTOMATION: &[&str] = &[
    "norm_num",
    "simp",
    "positivity",
    "linarith",
    "nlinarith",
    "ring_nf",
    "field_simp",
    "aesop",
    "omega",
];
const LIBRARY_SEARCH: &str = "exact?";
const DEADLINE: Duration = Duration::from_secs(600);
const TOKENS: u64 = 12_000;
const FRONTIER: usize = 24;

struct State {
    id: u32,
    proof_state: u64,
    goals: Vec<String>,
    path: Vec<String>,
    helped: bool,
    strategy: String,
}

pub struct Found {
    pub tactics: Vec<String>,
    pub helped: bool,
}

struct Budget {
    began: Instant,
    expanded: usize,
    tokens: u64,
}

impl Budget {
    fn remaining(&self) -> Duration {
        DEADLINE.saturating_sub(self.began.elapsed())
    }
    fn active(&self, agent: &Agent) -> bool {
        !self.remaining().is_zero()
            && self.expanded < agent.config.search_budget
            && !agent.stopping()
    }
}

struct Obligation {
    statement: String,
    depth: usize,
    initial: Vec<String>,
    resumed: bool,
}

#[derive(Default)]
struct Attempt {
    found: Option<Found>,
    helpers: Vec<Helper>,
    resume: Vec<String>,
}

impl State {
    fn cost(&self) -> (usize, usize, usize) {
        (
            self.goals.len(),
            self.goals.iter().map(String::len).sum(),
            self.path.len(),
        )
    }
}

fn select(frontier: &[State], expanded: usize) -> Option<usize> {
    frontier
        .iter()
        .enumerate()
        .min_by_key(|(_, state)| {
            if expanded % 2 == 1 {
                (0, 0, state.id as usize)
            } else {
                state.cost()
            }
        })
        .map(|(index, _)| index)
}

pub fn script(blocks: &[String]) -> String {
    format!(
        "by\n{}",
        blocks
            .iter()
            .flat_map(|block| block.lines())
            .map(|line| format!("  {line}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

pub async fn prove(agent: &mut Agent, statement: &str) -> Result<Option<Found>, String> {
    let mut budget = Budget {
        began: Instant::now(),
        expanded: 0,
        tokens: TOKENS,
    };
    let mut queue = vec![Obligation {
        statement: statement.into(),
        depth: 0,
        initial: Vec::new(),
        resumed: false,
    }];
    let mut shapes: HashSet<String> = agent
        .bench
        .library()
        .iter()
        .map(|code| signature(code))
        .collect();
    shapes.insert(signature(statement));
    let mut names: HashSet<String> = agent
        .bench
        .library()
        .iter()
        .flat_map(|code| declared(code))
        .collect();
    names.extend(declared(statement));
    let mut helpers = 0;
    while let Some(task) = queue.pop() {
        if !budget.active(agent) {
            break;
        }
        let allow_helpers = task.depth < 2 && !task.resumed && helpers < 3;
        let attempt = match search(
            agent,
            &task.statement,
            &task.initial,
            allow_helpers,
            &mut budget,
        )
        .await
        {
            Ok(attempt) => attempt,
            Err(error) if task.depth == 0 => return Err(error),
            Err(_) => continue,
        };
        if let Some(mut found) = attempt.found {
            if task.depth == 0 {
                found.helped |= helpers > 0;
                return Ok(Some(found));
            }
            let code = format!("{} := {}", task.statement, script(&found.tactics));
            let checked =
                match tokio::time::timeout(budget.remaining(), agent.bench.check(&code)).await {
                    Ok(checked) if checked.ok => checked,
                    _ => continue,
                };
            let lemma = Lemma {
                name: declared(&task.statement)[0].clone(),
                code,
                node: None,
                episode: agent.state.episodes + 1,
                axioms: checked.axioms,
                routine: !found.helped,
            };
            match tokio::time::timeout(budget.remaining(), agent.keep_lemma(&lemma)).await {
                Ok(Ok(())) => {}
                _ => return Err("A helper checked, but could not be kept safely.".into()),
            }
            continue;
        }
        let mut children = Vec::new();
        if allow_helpers {
            for helper in attempt.helpers {
                if helpers >= 3 {
                    break;
                }
                let declared = declared(&helper.statement);
                let shape = signature(&helper.statement);
                if declared.len() != 1
                    || names.contains(&declared[0])
                    || shapes.contains(&shape)
                    || guard::declaration(&helper.statement).is_err()
                    || helper.statement.contains(":=")
                {
                    continue;
                }
                names.insert(declared[0].clone());
                shapes.insert(shape);
                helpers += 1;
                children.push(Obligation {
                    statement: helper.statement,
                    depth: task.depth + 1,
                    initial: helper.proof.into_iter().collect(),
                    resumed: false,
                });
            }
        }
        if !children.is_empty() {
            queue.push(Obligation {
                initial: attempt.resume,
                resumed: true,
                ..task
            });
            queue.extend(children.into_iter().rev());
        }
    }
    Ok(None)
}

async fn search(
    agent: &mut Agent,
    statement: &str,
    initial: &[String],
    allow_helpers: bool,
    budget: &mut Budget,
) -> Result<Attempt, String> {
    let environment = fingerprint(&[
        agent.config.workbench.header.clone(),
        crate::lean::workbench::lean_version().into(),
        include_str!("../../mathlib/lake-manifest.json").into(),
    ]);
    let library = fingerprint(agent.bench.library());
    let key = fingerprint(&[statement.into(), environment.clone(), library.clone()]);
    let previous = agent.store.proof(&key).await.ok().flatten();
    let query = crate::lean::premises::terms(statement)
        .into_iter()
        .collect::<Vec<_>>()
        .join(" ");
    let examples = agent
        .store
        .proof_examples(&query, &environment, 2)
        .await
        .unwrap_or_default();
    let previous = previous.filter(|proof| proof.replayable(statement, &environment, &library));
    let mut initial = initial.to_vec();
    if let Some(proof) = &previous {
        if !proof.blocks.is_empty() {
            initial.push(proof.blocks.join("\n"));
        }
    }
    let mut experience = ProofExperience {
        key,
        statement: statement.into(),
        shape: signature(statement),
        environment,
        library,
        failures: previous
            .as_ref()
            .map(|proof| proof.failures.clone())
            .unwrap_or_default(),
        helpers: agent
            .bench
            .library()
            .iter()
            .flat_map(|code| declared(code))
            .collect(),
        episode: agent.state.episodes + 1,
        ..Default::default()
    };
    let task = Task {
        statement,
        initial: &initial,
        allow_helpers,
        examples: &examples,
        previous: previous.as_ref(),
    };
    let result = search_inner(agent, &task, budget, &mut experience).await;
    experience.text = format!("{} {}", experience.shape, experience.goal);
    if let Err(error) = agent.store.put_proof(&experience).await {
        tracing::warn!(%error, "could not keep proof experience");
    }
    result
}

fn fingerprint(values: &[String]) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    values.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn example_context(examples: &[ProofExperience]) -> Vec<serde_json::Value> {
    let mut remaining = 7998usize;
    let mut selected = Vec::new();
    for example in examples.iter().filter(|example| example.checked) {
        let value = json!({
            "statement": example.statement,
            "blocks": example.blocks,
            "helpers": example.helpers,
            "axioms": example.axioms,
            "checked": true,
        });
        let size = serde_json::to_vec(&value).map_or(usize::MAX, |bytes| bytes.len() + 1);
        if size <= remaining {
            remaining -= size;
            selected.push(value);
            if selected.len() == 2 {
                break;
            }
        }
    }
    selected
}

struct Task<'a> {
    statement: &'a str,
    initial: &'a [String],
    allow_helpers: bool,
    examples: &'a [ProofExperience],
    previous: Option<&'a ProofExperience>,
}

async fn search_inner(
    agent: &mut Agent,
    task: &Task<'_>,
    budget: &mut Budget,
    experience: &mut ProofExperience,
) -> Result<Attempt, String> {
    let Task {
        statement,
        initial,
        allow_helpers,
        examples,
        previous,
    } = *task;
    let opened = tokio::time::timeout(budget.remaining(), agent.bench.open(statement))
        .await
        .map_err(|_| "Lean ran out of search time.".to_string())?
        .map_err(|error| format!("Lean could not state it: {error}"))?;
    let session = agent.bench.session();
    experience.goal = opened.goal.clone();
    let mut next_id = 1;
    agent.emit(Event::Search {
        step: SearchStep {
            id: 0,
            parent: None,
            tactic: String::new(),
            source: "statement",
            ok: true,
            goals: 1,
            goal: first_goal(std::slice::from_ref(&opened.goal)),
            error: None,
        },
    });
    let mut frontier = vec![State {
        id: 0,
        proof_state: opened.state,
        goals: vec![opened.goal],
        path: Vec::new(),
        helped: false,
        strategy: String::new(),
    }];
    let mut seen = vec![frontier[0].goals.clone()];
    while budget.active(agent) {
        let Some(best) = select(&frontier, budget.expanded) else {
            break;
        };
        let node = frontier.swap_remove(best);
        budget.expanded += 1;
        let remembered: Vec<_> = previous
            .into_iter()
            .flat_map(|proof| &proof.failures)
            .filter(|failure| failure.goal == node.goals.join("\n\n"))
            .collect();
        let mut failed: Vec<_> = remembered
            .iter()
            .map(|failure| json!({"script": failure.script, "error": failure.error}))
            .collect();
        let mut tried = HashSet::new();
        let mut strategy = node.strategy.clone();
        let mut candidates: VecDeque<(String, &'static str)> = if node.id == 0 {
            initial
                .iter()
                .cloned()
                .map(|block| (block, "model"))
                .collect()
        } else {
            VecDeque::new()
        };
        candidates.extend(AUTOMATION.iter().map(|t| (t.to_string(), "automation")));
        candidates.push_back((LIBRARY_SEARCH.to_string(), "automation"));
        let mut rounds = 0;
        let mut pending_helpers = Vec::new();
        let mut resume = Vec::new();
        loop {
            if budget.remaining().is_zero() || agent.stopping() || agent.bench.session() != session
            {
                break;
            }
            let Some((tactic, source)) = candidates.pop_front() else {
                if !pending_helpers.is_empty() {
                    return Ok(Attempt {
                        helpers: pending_helpers,
                        resume,
                        ..Attempt::default()
                    });
                }
                if rounds >= 2 || budget.tokens == 0 {
                    break;
                }
                rounds += 1;
                let context = json!({
                    "statement": statement,
                    "environment": experience.environment,
                    "goals": node.goals.iter().map(|goal| goals::parse(goal)).collect::<Vec<_>>(),
                    "path": node.path,
                    "strategy": strategy,
                    "failures": failed,
                    "catalog": agent.premises.status,
                    "premises": agent.premises.select(&node.goals.join("\n\n"), agent.bench.library()),
                    "allow_helpers": allow_helpers,
                    "checked_examples": example_context(examples),
                });
                let (plan, spent) = agent
                    .propose(&context, budget.tokens, budget.remaining())
                    .await;
                budget.tokens = budget.tokens.saturating_sub(spent);
                strategy = plan.strategy;
                if allow_helpers {
                    pending_helpers = plan.helpers;
                }
                resume = plan
                    .candidates
                    .iter()
                    .map(|block| {
                        node.path
                            .iter()
                            .cloned()
                            .chain(std::iter::once(block.clone()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .collect();
                candidates.extend(plan.candidates.into_iter().map(|block| (block, "model")));
                if candidates.is_empty() {
                    if !pending_helpers.is_empty() {
                        return Ok(Attempt {
                            helpers: pending_helpers,
                            resume,
                            ..Attempt::default()
                        });
                    }
                    break;
                }
                continue;
            };
            if !tried.insert(tactic.clone()) {
                continue;
            }
            if remembered.iter().any(|failure| failure.script == tactic) {
                continue;
            }
            let moved = match tokio::time::timeout(
                budget.remaining(),
                agent.bench.apply_block(node.proof_state, &tactic),
            )
            .await
            {
                Ok(moved) => moved,
                Err(_) => {
                    agent.bench.release();
                    break;
                }
            };
            let id = next_id;
            next_id += 1;
            let written = moved.suggestion.clone().unwrap_or_else(|| tactic.clone());
            agent.emit(Event::Search {
                step: SearchStep {
                    id,
                    parent: Some(node.id),
                    tactic: written.clone(),
                    source,
                    ok: moved.ok,
                    goals: moved.goals.len(),
                    goal: first_goal(&moved.goals),
                    error: moved.error.clone(),
                },
            });
            let helped = node.helped || source == "model";
            if !moved.ok {
                if experience.failures.len() < 32 {
                    experience.failures.push(ProofFailure {
                        goal: node.goals.join("\n\n"),
                        script: tactic.clone(),
                        error: moved
                            .error
                            .clone()
                            .unwrap_or_default()
                            .chars()
                            .take(1000)
                            .collect(),
                    });
                }
                failed.push(json!({"script": tactic, "error": moved.error}));
            } else if moved.goals.is_empty() {
                let mut tactics = node.path.clone();
                tactics.push(written);
                let code = format!("{statement} := {}", script(&tactics));
                match tokio::time::timeout(budget.remaining(), agent.bench.check(&code)).await {
                    Ok(checked) if checked.ok => {
                        experience.checked = true;
                        experience.axioms = checked.axioms;
                        experience.blocks = tactics.clone();
                        return Ok(Attempt {
                            found: Some(Found { tactics, helped }),
                            ..Attempt::default()
                        });
                    }
                    Ok(checked) => failed.push(json!({"script": tactic, "error": checked.errors})),
                    Err(_) => {
                        agent.bench.release();
                        break;
                    }
                }
            } else if moved.goals != node.goals && !seen.contains(&moved.goals) {
                seen.push(moved.goals.clone());
                let mut path = node.path.clone();
                path.push(written);
                if path.len() > experience.blocks.len() {
                    experience.blocks = path.clone();
                }
                frontier.push(State {
                    id,
                    proof_state: moved.state.unwrap_or(node.proof_state),
                    goals: moved.goals,
                    path,
                    helped,
                    strategy: strategy.clone(),
                });
                if frontier.len() > FRONTIER {
                    frontier.pop();
                }
            } else {
                failed.push(json!({"script": tactic, "error": "No new goals; this block makes no distinct progress."}));
            }
        }
        if agent.bench.session() != session {
            break;
        }
    }
    Ok(Attempt::default())
}

fn first_goal(goals: &[String]) -> String {
    goals
        .first()
        .map(|goal| goal.chars().take(400).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scripts_keep_nested_indentation() {
        assert_eq!(
            script(&["have h : True := by\n  trivial\nexact h".into()]),
            "by\n  have h : True := by\n    trivial\n  exact h"
        );
    }

    #[test]
    fn structural_branches_get_a_fair_turn() {
        let make = |id, goals| State {
            id,
            goals,
            proof_state: 0,
            path: Vec::new(),
            helped: false,
            strategy: String::new(),
        };
        let frontier = vec![
            make(1, vec!["long".repeat(100); 3]),
            make(2, vec!["short".into()]),
        ];
        assert_eq!(select(&frontier, 0), Some(1));
        assert_eq!(select(&frontier, 1), Some(0));
    }

    #[test]
    fn checked_examples_are_compact_bounded_and_never_truncated() {
        let checked = ProofExperience {
            statement: "lemma example : True".into(),
            blocks: vec!["trivial".into()],
            checked: true,
            failures: vec![ProofFailure {
                error: "discarded failure history".repeat(10_000),
                ..Default::default()
            }],
            ..Default::default()
        };
        let too_large = ProofExperience {
            blocks: vec!["large proof".repeat(1000)],
            ..checked.clone()
        };
        let unchecked = ProofExperience {
            checked: false,
            ..checked.clone()
        };
        let context = example_context(&[too_large, unchecked, checked.clone()]);
        assert_eq!(context.len(), 1);
        assert_eq!(context[0]["blocks"][0], "trivial");
        assert!(context[0].get("failures").is_none());
        assert!(serde_json::to_vec(&context).unwrap().len() <= 8000);
        assert_eq!(
            example_context(&[checked.clone(), checked.clone(), checked]).len(),
            2
        );
    }
}
