use super::{
    desk::Desk,
    fronts::Front,
    live::Event,
    llm::{Ask, Reply},
    memory::{Episode, Node, Trust, Turn},
    now, prompts,
    tools::{self, Tool},
    tree, Agent, Stop,
};
use rig_core::message::{Message, ToolResultContent, UserContent};

const CALLS_PER_TURN: usize = 2;
const NUDGES: u32 = 2;
const RELATED: usize = 6;
const OPEN: usize = 3;
const RECENT: usize = 2;
const MOVES_OVER: usize = 60;

pub async fn run(
    agent: &mut Agent,
    front: &'static Front,
    version: u64,
    rules: &[String],
) -> Result<Episode, Stop> {
    let number = agent.state.episodes + 1;
    let started = now();
    let allowed = tools::work(front);
    let definitions = tools::definitions(&allowed);
    let preamble = prompts::researcher(&prompts::awake(agent.state.awake_since, started), rules);
    let mut desk = Desk::new(number, front, allowed);
    let mut history: Vec<Message> = Vec::new();
    let mut pending = Some(Message::user(brief(agent, front).await?));
    let mut nudges = 0;
    let mut record = Episode {
        number,
        front: front.id.to_string(),
        started,
        rules: version,
        ..Default::default()
    };
    for turn in 0..agent.config.actions as u32 {
        let Some(prompt) = pending.take() else { break };
        let ask = Ask {
            preamble: &preamble,
            history: &history,
            prompt: prompt.clone(),
            tools: definitions.clone(),
            thinking: true,
            max_tokens: agent.config.max_tokens,
        };
        let reply = match agent.ask(turn, ask).await {
            Err(Stop::Shutdown) => break,
            reply => reply?,
        };
        record.turns += 1;
        record.tokens += reply.tokens;
        history.push(prompt);
        history.push(reply.message());
        let results = act(agent, &mut desk, number, turn, &reply).await?;
        if desk.conclusion.is_some() {
            break;
        }
        pending = if !results.is_empty() {
            Some(Message::User { content: results })
        } else if nudges < NUDGES {
            nudges += 1;
            Some(Message::user(if reply.looped {
                "You were repeating yourself, so I stopped you. No tool call arrived and nothing ran. Make exactly one tool call now, with arguments you have not tried."
            } else {
                "No tool call arrived, so nothing ran. Make exactly one tool call now."
            }))
        } else {
            None
        };
    }
    if desk.conclusion.is_none() && !agent.stopping() {
        conclude(agent, &mut desk, &preamble, &history, pending, &mut record).await?;
    }
    if desk.conclusion.is_none() {
        desk.conclusion = Some((cut_off(record.turns), String::new()));
    }
    finish(agent, desk, record).await
}

fn cut_off(turns: u32) -> String {
    format!(
        "Cut off by a restart after {turns} {}.",
        if turns == 1 { "action" } else { "actions" }
    )
}

pub fn interrupted(number: u64, front: &str, started: i64, rules: u64, turns: &[Turn]) -> Episode {
    let calls: Vec<_> = turns.iter().flat_map(|turn| &turn.calls).collect();
    let planned = |key: &str| {
        calls
            .iter()
            .find(|call| call.tool == Tool::Plan.name() && call.ok)
            .and_then(|call| call.args[key].as_str())
            .unwrap_or_default()
            .to_string()
    };
    let graded: Vec<bool> = calls
        .iter()
        .filter_map(|call| call.verdict.as_ref())
        .filter(|verdict| verdict.known.is_none())
        .map(|verdict| verdict.held)
        .collect();
    Episode {
        number,
        front: front.to_string(),
        objective: planned("objective"),
        prediction: planned("prediction"),
        summary: cut_off(turns.len() as u32),
        held: graded.iter().filter(|&&held| held).count() as u32,
        broken: graded.iter().filter(|&&held| !held).count() as u32,
        turns: turns.len() as u32,
        tokens: turns.iter().map(|turn| turn.tokens).sum(),
        started,
        ended: turns.last().map_or(started, |turn| turn.at),
        rules,
        ..Default::default()
    }
}

async fn act(
    agent: &mut Agent,
    desk: &mut Desk,
    number: u64,
    turn: u32,
    reply: &Reply,
) -> Result<Vec<UserContent>, Stop> {
    let mut results = Vec::new();
    let mut calls = Vec::new();
    for (index, call) in reply.calls.iter().enumerate() {
        let summary = if index < CALLS_PER_TURN {
            let handled = desk.handle(agent, turn, call).await;
            let summary = handled.summary.clone();
            calls.push(handled);
            summary
        } else {
            "Skipped: at most two calls per turn.".to_string()
        };
        results.push(UserContent::tool_result(
            call.id.clone(),
            call.function.name.clone(),
            vec![ToolResultContent::text(summary)],
        ));
    }
    agent
        .store
        .put_turn(&Turn {
            episode: number,
            index: turn,
            thought: reply.thought.chars().take(12_000).collect(),
            said: reply.said.chars().take(4_000).collect(),
            calls,
            tokens: reply.tokens,
            at: now(),
        })
        .await?;
    Ok(results)
}

async fn conclude(
    agent: &mut Agent,
    desk: &mut Desk,
    preamble: &str,
    history: &[Message],
    pending: Option<Message>,
    record: &mut Episode,
) -> Result<(), Stop> {
    let turn = record.turns;
    let mut content = match pending {
        Some(Message::User { content }) => content,
        _ => Vec::new(),
    };
    content.push(UserContent::text(
        "Your actions are spent. Call conclude now: what you learned, with numbers, and what to try next.",
    ));
    let ask = Ask {
        preamble,
        history,
        prompt: Message::User { content },
        tools: tools::definitions(&[Tool::Conclude]),
        thinking: false,
        max_tokens: 400,
    };
    let reply = match agent.ask(turn, ask).await {
        Err(Stop::Shutdown) => return Ok(()),
        reply => reply?,
    };
    record.turns += 1;
    record.tokens += reply.tokens;
    act(agent, desk, record.number, turn, &reply).await?;
    if desk.conclusion.is_none() {
        let said = reply.said.trim();
        desk.conclusion = Some((
            if said.is_empty() {
                "The episode ended without a conclusion.".to_string()
            } else {
                said.chars().take(600).collect()
            },
            String::new(),
        ));
    }
    Ok(())
}

async fn finish(agent: &mut Agent, desk: Desk, mut record: Episode) -> Result<Episode, Stop> {
    let (objective, prediction) = desk.plan.clone().unwrap_or_default();
    let (summary, next) = desk.conclusion.clone().unwrap_or_default();
    let tally = &desk.tally;
    record.objective = objective;
    record.prediction = prediction;
    record.summary = summary;
    record.next = next;
    record.held = tally.held;
    record.broken = tally.broken;
    record.verified = tally.verified;
    record.routine = tally.routine;
    record.known = tally.known;
    record.reduced = tally.reduced;
    record.heuristic = desk.heuristic.clone();
    record.reward = reward(&desk);
    record.ended = now();
    agent.store.put_episode(&record).await?;
    agent.emit(Event::Concluded {
        episode: record.clone(),
    });
    Ok(record)
}

pub fn reward(desk: &Desk) -> f64 {
    let tally = &desk.tally;
    let raw = 1.0 * tally.verified as f64
        + 0.1 * tally.routine as f64
        + 0.4 * tally.broken as f64
        + 0.3 * tally.held as f64
        + 0.5 * tally.reduced as f64
        + 0.2 * tally.records as f64
        + if tally.advanced { 0.2 } else { 0.0 };
    raw.min(1.5) / 1.5
}

async fn brief(agent: &mut Agent, front: &'static Front) -> anyhow::Result<String> {
    let store = &agent.store;
    let related = store.recall(front.query, RELATED).await?;
    let mut open = store
        .nodes_where(front.id, Trust::Conjectured, OPEN)
        .await?;
    open.extend(store.nodes_where(front.id, Trust::Open, OPEN).await?);
    let recent = store.episodes_on(front.id, RECENT).await?;
    let nodes = store.nodes().await?;
    let links = store.links().await?;
    let reductions = store.reductions().await?;
    let numbers = tree::Numbers::new(&nodes, &links, &reductions);
    let rows = tree::numbered(tree::rows(&nodes, &links, &reductions), &numbers);
    let focus = numbers
        .focus()
        .and_then(|key| nodes.iter().find(|node| node.key == key))
        .map(|node| focus(node, front.id == "lean"));
    let outline = if front.id == "lean" {
        tree::outline(&rows)
    } else {
        Vec::new()
    };
    let moves = prompts::moves(&store.episodes(MOVES_OVER).await?);
    Ok(prompts::brief(&prompts::Brief {
        front,
        state: &agent.state,
        related: &related,
        open: &open,
        recent: &recent,
        tree: &outline,
        focus,
        moves: &moves,
        actions: agent.config.actions,
    }))
}

fn focus(node: &Node, formal: bool) -> String {
    if node.key == tree::ROOT {
        return if formal {
            "No Lean-checked route under rh yet. Work backwards: reduce rh to smaller statements. A zero off the line \
would have to lie in the critical strip, because Mathlib rules out zeros with Re s ≥ 1 and the functional equation \
relates Re s ≤ 0 to Re s ≥ 1."
                .to_string()
        } else {
            "The proof tree under rh has no Lean-checked route yet; the Lean front is working backwards from rh."
                .to_string()
        };
    }
    let failed = tree::failures(node);
    let tried = match failed {
        0 => String::new(),
        1 => " Lean rejected one attempt; try another way, or reduce it.".to_string(),
        n => format!(" Lean rejected {n} attempts; reduce it, or specialize."),
    };
    let lean = node.lean.as_deref().unwrap_or_default();
    if formal {
        format!(
            "the most-proving open leaf is [{}] {}. Lean: {lean}.{tried}",
            node.key, node.title
        )
    } else {
        format!(
            "the Lean front is working on [{}] {}. If an instrument can test it, a failed prediction would refute it.",
            node.key, node.title
        )
    }
}
