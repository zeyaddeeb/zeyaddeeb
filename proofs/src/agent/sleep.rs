use super::{
    desk::{link, normalized, text},
    live::Event,
    llm::Ask,
    memory::{Kind, Link, Node, Relation, Trust},
    now, prompts,
    tools::{self, Tool},
    Agent, Stop,
};
use rig_core::message::{Message, ToolResultContent, UserContent};

const TURNS: u32 = 5;
const INSIGHTS: u32 = 2;

pub async fn run(agent: &mut Agent) -> Result<(), Stop> {
    let episodes = agent.state.episodes;
    agent.emit(Event::Sleep { after: episodes });
    let recent = agent
        .store
        .episodes(agent.config.sleep_every as usize)
        .await?;
    let since = recent.last().map_or(0, |e| e.number);
    let changed: Vec<Node> = agent
        .store
        .nodes()
        .await?
        .into_iter()
        .filter(|node| node.episode >= since && node.kind != Kind::Insight)
        .take(12)
        .collect();
    let preamble = prompts::consolidator(episodes);
    let definitions = tools::definitions(&tools::sleep());
    let mut history = Vec::new();
    let mut prompt = Message::user(prompts::digest(&recent, &changed, &agent.state.letter));
    let mut insights = 0;
    for turn in 0..TURNS {
        let ask = Ask {
            preamble: &preamble,
            history: &history,
            prompt: prompt.clone(),
            tools: definitions.clone(),
            thinking: true,
            max_tokens: agent.config.max_tokens,
        };
        let reply = agent.ask(turn, ask).await?;
        history.push(prompt);
        history.push(reply.message());
        let mut results = Vec::new();
        let mut done = false;
        for call in &reply.calls {
            let args = &call.function.arguments;
            let summary = match Tool::parse(&call.function.name) {
                Some(Tool::Insight) if insights < INSIGHTS => {
                    insights += 1;
                    insight(agent, episodes, insights, args).await
                }
                Some(Tool::Insight) => "Two insights are enough; write the letter.".to_string(),
                Some(Tool::Link) => link(agent, episodes, args).await.summary,
                Some(Tool::Letter) => {
                    done = true;
                    agent.state.letter = text(args, "text", 800).unwrap_or_default();
                    "Letter kept.".to_string()
                }
                _ => "Only insight, link and letter are available while sleeping.".to_string(),
            };
            results.push(UserContent::tool_result_for(
                call.id.clone(),
                call.provider.clone(),
                call.function.name.clone(),
                vec![ToolResultContent::text(summary)],
            ));
        }
        if done {
            break;
        }
        prompt = if results.is_empty() {
            Message::user("Write the letter now.")
        } else {
            Message::User { content: results }
        };
    }
    let keep_from = episodes.saturating_sub(agent.config.keep_episodes);
    agent.store.forget_turns_before(keep_from).await?;
    Ok(())
}

async fn insight(agent: &mut Agent, episodes: u64, index: u32, args: &serde_json::Value) -> String {
    let (Some(title), Some(body)) = (text(args, "title", 120), text(args, "body", 600)) else {
        return "insight needs a title and a body.".to_string();
    };
    let wanted = normalized(&title);
    if let Some(kept) = agent.store.nodes().await.ok().and_then(|nodes| {
        nodes
            .into_iter()
            .find(|node| node.kind == Kind::Insight && normalized(&node.title) == wanted)
    }) {
        return format!(
            "You kept this insight already as {}. Link to it, or write the letter.",
            kept.key
        );
    }
    let key = format!("s{episodes}-{index}");
    let mut node = Node::new(&key, Kind::Insight, Trust::Conjectured, &title, &body);
    node.episode = episodes;
    node.updated = now();
    if agent.store.put_node(&node).await.is_err() {
        return "Memory is unavailable.".to_string();
    }
    agent.emit(Event::Node { node });
    let basis: Vec<String> = args["basis"]
        .as_array()
        .map(|keys| {
            keys.iter()
                .filter_map(|k| k.as_str().map(str::to_string))
                .take(6)
                .collect()
        })
        .unwrap_or_default();
    for from in basis {
        if matches!(agent.store.node(&from).await, Ok(Some(_))) {
            let link = Link {
                from,
                to: key.clone(),
                relation: Relation::Supports,
                episode: episodes,
            };
            if let Ok(true) = agent.store.link(&link).await {
                agent.emit(Event::Link { link });
            }
        }
    }
    format!("Kept as {key}.")
}
