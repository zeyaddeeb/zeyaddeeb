use super::{
    desk::Desk,
    fronts::Front,
    live::Event,
    llm::{Ask, Reply},
    memory::{Episode, Trust, Turn},
    now, prompts,
    tools::{self, Tool},
    Agent, Stop,
};
use rig_core::message::{Message, ToolResultContent, UserContent};

const CALLS_PER_TURN: usize = 2;
const NUDGES: u32 = 2;
const RELATED: usize = 6;
const OPEN: usize = 3;
const RECENT: usize = 2;

pub async fn run(agent: &mut Agent, front: &'static Front) -> Result<Episode, Stop> {
    let number = agent.state.episodes + 1;
    let started = now();
    let allowed = tools::work(front);
    let definitions = tools::definitions(&allowed);
    let preamble = prompts::researcher(&prompts::awake(agent.state.awake_since, started));
    let mut desk = Desk::new(number, front, allowed);
    let mut history: Vec<Message> = Vec::new();
    let mut pending = Some(Message::user(brief(agent, front).await?));
    let mut nudges = 0;
    let mut record = Episode {
        number,
        front: front.id.to_string(),
        started,
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
        let reply = agent.ask(turn, ask).await?;
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
            Some(Message::user("Act now with exactly one tool call."))
        } else {
            None
        };
    }
    if desk.conclusion.is_none() {
        conclude(agent, &mut desk, &preamble, &history, pending, &mut record).await?;
    }
    finish(agent, desk, record).await
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
        results.push(UserContent::tool_result_for(
            call.id.clone(),
            call.provider.clone(),
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
    let reply = agent.ask(turn, ask).await?;
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
    Ok(prompts::brief(&prompts::Brief {
        front,
        state: &agent.state,
        related: &related,
        open: &open,
        recent: &recent,
        actions: agent.config.actions,
    }))
}
