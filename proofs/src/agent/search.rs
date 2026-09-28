use super::{
    live::{Event, SearchStep},
    Agent,
};
use std::{
    collections::VecDeque,
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

struct State {
    id: u32,
    proof_state: u64,
    goals: Vec<String>,
    path: Vec<String>,
    helped: bool,
}

pub struct Found {
    pub tactics: Vec<String>,
    pub helped: bool,
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

pub async fn prove(agent: &mut Agent, statement: &str) -> Result<Option<Found>, String> {
    let opened = agent
        .bench
        .open(statement)
        .await
        .map_err(|error| format!("Lean could not state it: {error}"))?;
    let began = Instant::now();
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
    }];
    let mut seen: Vec<Vec<String>> = Vec::new();
    let mut expanded = 0;
    while expanded < agent.config.search_budget && began.elapsed() < DEADLINE {
        let Some(best) = frontier
            .iter()
            .enumerate()
            .min_by_key(|(_, state)| state.cost())
            .map(|(index, _)| index)
        else {
            break;
        };
        let node = frontier.swap_remove(best);
        expanded += 1;
        let mut failed = Vec::new();
        let mut candidates: VecDeque<(String, &'static str)> = AUTOMATION
            .iter()
            .map(|t| (t.to_string(), "automation"))
            .collect();
        if node.id == 0 {
            candidates.push_back((LIBRARY_SEARCH.to_string(), "automation"));
        }
        let mut asked = false;
        while let Some((tactic, source)) = candidates.pop_front() {
            if began.elapsed() > DEADLINE {
                break;
            }
            let moved = agent.bench.apply(node.proof_state, &tactic).await;
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
                failed.push(tactic);
            } else if moved.goals.is_empty() {
                let mut tactics = node.path.clone();
                tactics.push(written);
                return Ok(Some(Found { tactics, helped }));
            } else if moved.goals != node.goals && !seen.contains(&moved.goals) {
                seen.push(moved.goals.clone());
                let mut path = node.path.clone();
                path.push(written);
                frontier.push(State {
                    id,
                    proof_state: moved.state.unwrap_or(node.proof_state),
                    goals: moved.goals,
                    path,
                    helped,
                });
            }
            if candidates.is_empty() && !asked {
                asked = true;
                let proposals = agent.propose(&node.goals.join("\n\n"), &failed).await;
                candidates.extend(proposals.into_iter().map(|t| (t, "model")));
            }
        }
    }
    Ok(None)
}

fn first_goal(goals: &[String]) -> String {
    goals
        .first()
        .map(|goal| goal.chars().take(400).collect())
        .unwrap_or_default()
}
