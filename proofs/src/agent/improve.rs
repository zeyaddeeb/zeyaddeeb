use super::{
    bandit,
    fronts::{self, Front, FRONTS},
    live::{self, Event},
    llm::Ask,
    memory::{Episode, Layer, Rules, Standing},
    prompts, rules,
    tools::{self, Tool},
    tree, Agent, Stop,
};
use rig_core::message::{Message, ToolResultContent, UserContent};
use serde_json::json;

const TURNS: u32 = 3;
const RECENT: usize = 8;
const PROOF_EVERY: usize = 3;

pub struct Run {
    pub front: &'static Front,
    pub version: u64,
    pub lines: Vec<String>,
    pub arms: Vec<live::Arm>,
}

impl Agent {
    pub(super) async fn seed_rules(&mut self) -> anyhow::Result<()> {
        let born = self.state.episodes;
        if self.store.rules(Layer::Playbook, 1).await?.is_none() {
            self.store
                .put_rules(&Rules::seed(Layer::Playbook, Vec::new(), born))
                .await?;
        }
        if self.store.rules(Layer::Method, 1).await?.is_none() {
            self.store
                .put_rules(&Rules::seed(Layer::Method, rules::seed_method(), born))
                .await?;
        }
        if self.state.rules == 0 {
            self.state.rules = 1;
        }
        if self.state.method == 0 {
            self.state.method = 1;
        }
        if self.state.challenger != 0
            && self
                .store
                .rules(Layer::Playbook, self.state.challenger)
                .await?
                .is_none_or(|rules| rules.standing != Standing::Trial)
        {
            self.state.challenger = 0;
            self.state.half = None;
        }
        Ok(())
    }

    async fn put(&self, rules: Rules) -> anyhow::Result<()> {
        self.store.put_rules(&rules).await?;
        self.hub.emit(Event::Rules { rules });
        Ok(())
    }
}

pub async fn next(agent: &mut Agent) -> anyhow::Result<Run> {
    let pairs = match agent.state.challenger {
        0 => 0,
        version => agent
            .store
            .rules(Layer::Playbook, version)
            .await?
            .map_or(0, |rules| rules.pairs.len()),
    };
    let (forced, version) = rules::next_run(&agent.state, pairs);
    let ids: Vec<&str> = FRONTS.iter().map(|front| front.id).collect();
    let (chosen, arms) = bandit::choose(&agent.state.arms, &ids, &agent.state.last_front);
    let chosen = match forced {
        Some(front) => front,
        None if chosen != "lean" && overdue(agent).await? => "lean".to_string(),
        None => chosen,
    };
    let front = fronts::find(&chosen)
        .or_else(|| fronts::find(&agent.state.last_front))
        .unwrap_or(&FRONTS[0]);
    let lines = agent
        .store
        .rules(Layer::Playbook, version)
        .await?
        .map(|rules| rules.lines)
        .unwrap_or_default();
    Ok(Run {
        front,
        version,
        lines,
        arms,
    })
}

async fn overdue(agent: &Agent) -> anyhow::Result<bool> {
    let recent = agent.store.episodes(PROOF_EVERY - 1).await?;
    Ok(recent.len() == PROOF_EVERY - 1 && recent.iter().all(|e| e.front != "lean"))
}

pub async fn settle(agent: &mut Agent, record: &Episode) -> Result<bool, Stop> {
    let Some(pair) = rules::settle(
        &mut agent.state,
        &record.front,
        record.rules,
        record.reward,
        record.number,
    ) else {
        return Ok(false);
    };
    let Some(mut challenger) = agent
        .store
        .rules(Layer::Playbook, agent.state.challenger)
        .await?
    else {
        agent.state.challenger = 0;
        return Ok(false);
    };
    challenger.pairs.push(pair);
    if challenger.pairs.len() < agent.config.trial_pairs {
        agent.put(challenger).await?;
        return Ok(false);
    }
    let verdict = rules::verdict(&challenger.pairs);
    let episodes = agent.state.episodes;
    challenger.gain = Some(verdict.gain);
    challenger.p = Some(verdict.p);
    challenger.decided = episodes;
    if verdict.kept {
        if let Some(mut champion) = agent
            .store
            .rules(Layer::Playbook, agent.state.rules)
            .await?
        {
            champion.standing = Standing::Retired;
            champion.decided = episodes;
            agent.put(champion).await?;
        }
        challenger.standing = Standing::Champion;
        agent.state.rules = challenger.version;
    } else {
        challenger.standing = Standing::Lost;
    }
    agent.state.challenger = 0;
    agent.state.half = None;
    let method = challenger.method;
    agent.put(challenger).await?;
    if let Some(mut author) = agent.store.rules(Layer::Method, method).await? {
        author.gains.push(verdict.gain);
        author.wins += u32::from(verdict.kept);
        author.gain = Some(rules::mean(&author.gains));
        agent.put(author).await?;
    }
    tracing::info!(
        gain = verdict.gain,
        p = verdict.p,
        kept = verdict.kept,
        "a rules trial was decided"
    );
    Ok(true)
}

pub async fn review(agent: &mut Agent) -> Result<(), Stop> {
    let Some(mut method) = agent.store.rules(Layer::Method, agent.state.method).await? else {
        return Ok(());
    };
    let judged = method.gains.len();
    if judged == 0 || !judged.is_multiple_of(rules::META) {
        return Ok(());
    }
    if method.standing == Standing::Trial {
        let parent = agent.store.rules(Layer::Method, method.parent).await?;
        let holds = rules::method_holds(&method, parent.as_ref());
        method.decided = agent.state.episodes;
        if holds {
            method.standing = Standing::Champion;
            if let Some(mut parent) = parent {
                parent.standing = Standing::Retired;
                agent.put(parent).await?;
            }
        } else {
            method.standing = Standing::Reverted;
            agent.state.method = method.parent;
        }
        agent.put(method).await?;
        agent.save().await?;
    }
    revise(agent, Layer::Method).await?;
    Ok(())
}

pub async fn revise(agent: &mut Agent, layer: Layer) -> Result<bool, Stop> {
    let episodes = agent.state.episodes;
    let lineage = agent.store.lineage().await?;
    let current = match layer {
        Layer::Playbook => agent.state.rules,
        Layer::Method => agent.state.method,
    };
    let Some(target) = lineage
        .iter()
        .find(|r| r.layer == layer && r.version == current)
        .cloned()
    else {
        return Ok(false);
    };
    let (preamble, digest) = match layer {
        Layer::Playbook => {
            let method = lineage
                .iter()
                .find(|r| r.layer == Layer::Method && r.version == agent.state.method)
                .map(|r| r.lines.clone())
                .unwrap_or_else(rules::seed_method);
            let recent = agent.store.episodes(RECENT).await?;
            let since = recent.last().map_or(0, |e| e.number);
            let frictions = rules::frictions(&agent.store.acted_since(since).await?);
            let nodes = agent.store.nodes().await?;
            let links = agent.store.links().await?;
            let reductions = agent.store.reductions().await?;
            let numbers = tree::Numbers::new(&nodes, &links, &reductions);
            let rows = tree::numbered(tree::rows(&nodes, &links, &reductions), &numbers);
            (
                prompts::reviser(&method, agent.config.trial_pairs),
                prompts::revision(
                    &target,
                    &lineage,
                    &frictions,
                    &recent,
                    &tree::outline(&rows),
                ),
            )
        }
        Layer::Method => (
            prompts::methodologist(rules::META),
            prompts::method_record(&target, &lineage),
        ),
    };
    agent.emit(Event::Revise {
        after: episodes,
        layer,
    });
    let definitions = tools::definitions(&[Tool::Revise]);
    let next = lineage
        .iter()
        .filter(|r| r.layer == layer)
        .map(|r| r.version)
        .max()
        .unwrap_or(0)
        + 1;
    let mut history = Vec::new();
    let mut prompt = Message::user(digest);
    let mut tried = Vec::new();
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
        let mut made = None;
        for call in &reply.calls {
            let name = call.function.name.as_str();
            let args = &call.function.arguments;
            let id = call.id.to_string();
            agent.emit(Event::Call {
                turn,
                id: id.clone(),
                tool: name.to_string(),
                args: args.clone(),
            });
            let (ok, mut summary) = if made.is_some() {
                (
                    false,
                    "One change at a time; this one was not made.".to_string(),
                )
            } else if Tool::parse(name) != Some(Tool::Revise) {
                (false, "Only revise is available now.".to_string())
            } else {
                match rules::apply(layer, &target.lines, args, &lineage) {
                    Ok(change) => {
                        made = Some(change);
                        let summary = match layer {
                            Layer::Playbook => format!(
                                "On trial as v{next}: the next {} episodes run in pairs against v{current}.",
                                agent.config.trial_pairs * 2
                            ),
                            Layer::Method => format!(
                                "In use as method v{next}; kept only if its next {} trials gain more than v{current}'s.",
                                rules::META
                            ),
                        };
                        (true, summary)
                    }
                    Err(refusal) => (false, refusal),
                }
            };
            if !ok {
                let attempt = (name.to_string(), args.clone());
                if tried.contains(&attempt) {
                    summary = format!("{}{summary}", super::desk::REPEATED);
                } else {
                    tried.push(attempt);
                }
            }
            agent.emit(Event::Outcome {
                turn,
                id,
                tool: name.to_string(),
                ok,
                summary: summary.clone(),
                verdict: None,
                data: json!({"layer": layer.name(), "version": next}),
            });
            results.push(UserContent::tool_result(
                call.id.clone(),
                call.function.name.clone(),
                vec![ToolResultContent::text(summary)],
            ));
        }
        if let Some((lines, change)) = made {
            let rules = Rules {
                layer,
                version: next,
                parent: current,
                lines,
                change: Some(change),
                standing: Standing::Trial,
                method: match layer {
                    Layer::Playbook => agent.state.method,
                    Layer::Method => 0,
                },
                pairs: Vec::new(),
                gains: Vec::new(),
                wins: 0,
                gain: None,
                p: None,
                born: episodes,
                decided: 0,
            };
            agent.put(rules).await?;
            match layer {
                Layer::Playbook => {
                    agent.state.challenger = next;
                    agent.state.half = None;
                }
                Layer::Method => agent.state.method = next,
            }
            agent.save().await?;
            return Ok(true);
        }
        prompt = if results.is_empty() {
            Message::user("No tool call arrived, so nothing changed. Call revise once now.")
        } else {
            Message::User { content: results }
        };
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agent::{config, governor::Limits, live::Hub, memory::Store},
        lean::workbench,
    };
    use std::time::Duration;

    async fn agent(pairs: usize) -> Agent {
        let settings = config::Config {
            mode: config::Mode::Always,
            llm_url: "http://127.0.0.1:9/v1".into(),
            model: "mock".into(),
            api_key: "none".into(),
            database: "mem://".into(),
            holder: "test".into(),
            actions: 8,
            max_tokens: 256,
            turn_limit: Duration::from_secs(5),
            rest_watched: Duration::ZERO,
            rest_unwatched: Duration::ZERO,
            sleep_every: 100,
            keep_episodes: 10,
            search_budget: 2,
            trial_pairs: pairs,
            limits: Limits {
                tokens_per_day: 1000,
                backoff_base: Duration::ZERO,
                backoff_max: Duration::ZERO,
                failures_before_giving_up: 1,
            },
            workbench: workbench::Config::from_env(),
        };
        let store = Store::connect("mem://", None).await.unwrap();
        let mut agent = Agent::new(settings, store, Hub::new()).await.unwrap();
        let mut challenger = Rules::seed(Layer::Playbook, vec!["Plan with reduce.".into()], 1);
        challenger.version = 2;
        challenger.parent = 1;
        challenger.method = 1;
        challenger.standing = Standing::Trial;
        agent.store.put_rules(&challenger).await.unwrap();
        agent.state.challenger = 2;
        agent
    }

    fn episode(number: u64, front: &str, rules: u64, reward: f64) -> Episode {
        Episode {
            number,
            front: front.into(),
            rules,
            reward,
            ..Default::default()
        }
    }

    async fn play(agent: &mut Agent, champion: f64, challenger: f64) -> bool {
        let mut decided = false;
        for pair in 0..agent.config.trial_pairs as u64 {
            let front = FRONTS[pair as usize].id;
            let order = if pair % 2 == 0 { [1, 2] } else { [2, 1] };
            for (half, version) in order.into_iter().enumerate() {
                let (forced, planned) = rules::next_run(&agent.state, pair as usize);
                assert_eq!(planned, version, "pair {pair} half {half}");
                if half == 1 {
                    assert_eq!(forced.as_deref(), Some(front));
                }
                let number = agent.state.episodes + 1;
                agent.state.episodes = number;
                let reward = if version == 1 { champion } else { challenger };
                decided = settle(agent, &episode(number, front, version, reward))
                    .await
                    .unwrap();
            }
        }
        decided
    }

    #[tokio::test]
    async fn a_unanimous_trial_promotes_the_new_rules_and_credits_the_method() {
        let mut agent = agent(4).await;
        assert!(play(&mut agent, 0.2, 0.5).await);
        assert_eq!((agent.state.rules, agent.state.challenger), (2, 0));
        let kept = agent
            .store
            .rules(Layer::Playbook, 2)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(kept.standing, Standing::Champion);
        assert_eq!(kept.pairs.len(), 4);
        assert_eq!(kept.p, Some(1.0 / 16.0));
        let old = agent
            .store
            .rules(Layer::Playbook, 1)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(old.standing, Standing::Retired);
        let method = agent.store.rules(Layer::Method, 1).await.unwrap().unwrap();
        assert_eq!((method.gains.len(), method.wins), (1, 1));
        assert!((method.gains[0] - 0.3).abs() < 1e-9);
    }

    #[tokio::test]
    async fn a_tie_keeps_the_old_rules() {
        let mut agent = agent(4).await;
        assert!(play(&mut agent, 0.3, 0.3).await);
        assert_eq!((agent.state.rules, agent.state.challenger), (1, 0));
        let lost = agent
            .store
            .rules(Layer::Playbook, 2)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(lost.standing, Standing::Lost);
        assert_eq!(lost.p, Some(1.0));
        let method = agent.store.rules(Layer::Method, 1).await.unwrap().unwrap();
        assert_eq!(method.wins, 0);
    }

    #[tokio::test]
    async fn an_episode_under_other_rules_is_not_counted() {
        let mut agent = agent(4).await;
        assert!(!settle(&mut agent, &episode(1, "line", 7, 0.9))
            .await
            .unwrap());
        assert!(agent.state.half.is_none());
    }
}
