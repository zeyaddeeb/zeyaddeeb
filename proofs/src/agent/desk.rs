use super::{
    fronts::Front,
    live::Event,
    memory::{
        Call, Evidence, Kind, Lemma, Link, Node, Probe, Reduction, Relation, Stretch, Trust,
        Verdict,
    },
    search,
    tools::{
        instruments::{self, number, Reading},
        referee, Tool,
    },
    tree, Agent,
};
use crate::{
    lean::workbench::{declared, signature},
    math::line::{distinct, Certificate},
};
use rig_core::message::ToolCall;
use serde_json::{json, Value};
use std::{
    f64::consts::PI,
    time::{Duration, Instant},
};

const INSTRUMENT_LIMIT: Duration = Duration::from_secs(120);
pub(super) const REPEATED: &str =
    "You sent exactly this before and it was refused the same way. Change the arguments. ";
const DEFAULT_WIDTH: f64 = 60.0;

#[derive(Debug, Default)]
pub struct Tally {
    pub held: u32,
    pub broken: u32,
    pub verified: u32,
    pub routine: u32,
    pub known: u32,
    pub records: u32,
    pub reduced: u32,
    pub composed: u32,
    pub advanced: bool,
    pub touched: Vec<String>,
}

pub struct Desk {
    pub episode: u64,
    pub front: &'static Front,
    allowed: Vec<Tool>,
    pub plan: Option<(String, String)>,
    pub heuristic: String,
    pub conclusion: Option<(String, String)>,
    pub tally: Tally,
    claims: u32,
    reductions: u32,
    refusals: Vec<(String, Value)>,
}

pub(super) struct Done {
    pub ok: bool,
    pub summary: String,
    pub verdict: Option<Verdict>,
    pub data: Value,
}

impl Done {
    fn said(summary: impl Into<String>) -> Self {
        Done {
            ok: true,
            summary: summary.into(),
            verdict: None,
            data: Value::Null,
        }
    }

    fn refused(summary: impl Into<String>) -> Self {
        Done {
            ok: false,
            ..Done::said(summary)
        }
    }
}

fn sent(args: &Value) -> String {
    let text = args.to_string();

    match text.char_indices().nth(300) {
        Some((at, _)) => format!("{}…", &text[..at]),
        None => text,
    }
}

pub(super) fn text(args: &Value, key: &str, limit: usize) -> Option<String> {
    let value = args[key].as_str()?.trim();

    (!value.is_empty()).then(|| value.chars().take(limit).collect())
}

impl Desk {
    pub fn new(episode: u64, front: &'static Front, allowed: Vec<Tool>) -> Self {
        Desk {
            episode,
            front,
            allowed,
            plan: None,
            heuristic: String::new(),
            conclusion: None,
            tally: Tally::default(),
            claims: 0,
            reductions: 0,
            refusals: Vec::new(),
        }
    }

    pub async fn handle(&mut self, agent: &mut Agent, turn: u32, call: &ToolCall) -> Call {
        let name = call.function.name.as_str();
        let args = &call.function.arguments;
        let id = call.id.to_string();

        agent.emit(Event::Call {
            turn,
            id: id.clone(),
            tool: name.to_string(),
            args: args.clone(),
        });

        let mut done = match Tool::parse(name).filter(|tool| self.allowed.contains(tool)) {
            None => Done::refused(format!(
                "There is no tool called {name} here. Tools here: {}.",
                self.allowed
                    .iter()
                    .map(|tool| tool.name())
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
            Some(tool) if self.plan.is_none() && tool != Tool::Plan => {
                Done::refused("Begin with plan: the objective and your prediction.")
            }
            Some(tool) => self.dispatch(agent, tool, args).await,
        };

        if !done.ok {
            let attempt = (name.to_string(), args.clone());

            if self.refusals.contains(&attempt) {
                done.summary = format!("{REPEATED}{}", done.summary);
            } else {
                self.refusals.push(attempt);
            }
        }

        let summary = done.summary.clone();

        agent.emit(Event::Outcome {
            turn,
            id: id.clone(),
            tool: name.to_string(),
            ok: done.ok,
            summary: summary.clone(),
            verdict: done.verdict.clone(),
            data: done.data.clone(),
        });

        Call {
            id,
            tool: name.to_string(),
            args: args.clone(),
            ok: done.ok,
            summary,
            verdict: done.verdict,
            data: slim(done.data),
        }
    }

    async fn dispatch(&mut self, agent: &mut Agent, tool: Tool, args: &Value) -> Done {
        match tool {
            Tool::Plan => self.plan(args),
            Tool::Conjecture => self.conjecture(agent, args).await,
            Tool::Formalize => self.formalize(agent, args).await,
            Tool::Recall => recall(agent, args).await,
            Tool::Link => link(agent, self.episode, args).await,
            Tool::Conclude => self.conclude(args),
            Tool::Reduce => self.reduce(agent, args).await,
            instrument => self.measure(agent, instrument, args).await,
        }
    }

    fn plan(&mut self, args: &Value) -> Done {
        let (Some(objective), Some(prediction)) =
            (text(args, "objective", 400), text(args, "prediction", 400))
        else {
            return Done::refused("plan needs an objective and a prediction.");
        };

        self.plan = Some((objective, prediction));

        let wanted = args["move"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_lowercase();

        self.heuristic = super::prompts::MOVES
            .iter()
            .find(|(id, _)| *id == wanted)
            .map(|(id, _)| id.to_string())
            .unwrap_or_default();

        Done::said("Planned. Go.")
    }

    fn conclude(&mut self, args: &Value) -> Done {
        let summary = text(args, "summary", 600).unwrap_or_default();

        if summary.is_empty() {
            return Done::refused("conclude needs a summary.");
        }

        let next = text(args, "next", 400).unwrap_or_default();

        self.conclusion = Some((summary, next));

        Done::said("Episode concluded.")
    }

    async fn conjecture(&mut self, agent: &mut Agent, args: &Value) -> Done {
        let (Some(title), Some(statement)) =
            (text(args, "title", 120), text(args, "statement", 600))
        else {
            return Done::refused("conjecture needs a title and a statement.");
        };

        if let Some(known) = self.known_claim(agent, &title).await {
            return Done::said(format!(
                "You recorded this before as {}. Test it again with claim: \"{}\".",
                known.key, known.key
            ));
        }

        self.claims += 1;

        let key = format!("e{}-{}", self.episode, self.claims);

        let mut node = Node::new(
            &key,
            Kind::Conjecture,
            Trust::Conjectured,
            &title,
            &statement,
        );

        node.front = self.front.id.to_string();
        node.episode = self.episode;
        node.lean = text(args, "lean", 1000);
        node.updated = super::now();

        if let Err(error) = agent.store.put_node(&node).await {
            return Done::refused(format!("Could not record it: {error}"));
        }

        self.tally.touched.push(key.clone());
        agent.emit(Event::Node { node });

        Done::said(format!(
            "Recorded as {key}. Test it, and pass claim: \"{key}\"."
        ))
    }

    async fn known_claim(&self, agent: &mut Agent, title: &str) -> Option<Node> {
        let wanted = normalized(title);

        agent.store.nodes().await.ok()?.into_iter().find(|node| {
            node.kind == Kind::Conjecture
                && node.front == self.front.id
                && normalized(&node.title) == wanted
        })
    }

    async fn measure(&mut self, agent: &mut Agent, tool: Tool, args: &Value) -> Done {
        let began = Instant::now();

        let mut reading = match self.read(agent, tool, args).await {
            Ok(reading) => reading,
            Err(error) => return Done::refused(format!("{error} You sent {}.", sent(args))),
        };

        if let Some(data) = reading.data.as_object_mut() {
            data.insert("millis".into(), json!(began.elapsed().as_millis() as u64));
        }

        if let (Some(reason), false) = (reading.ungraded, args["expect"].is_null()) {
            return Done {
                ok: true,
                summary: format!("{} Not graded: {reason}.", reading.summary),
                verdict: None,
                data: reading.data,
            };
        }

        let verdict = match referee::grade(&args["expect"], &reading.fields) {
            Ok(verdict) => verdict.map(|mut verdict| {
                if verdict.held {
                    verdict.known =
                        referee::known(tool.name(), &verdict, &reading.fields).map(str::to_string);
                }

                verdict
            }),
            Err(error) => {
                return Done {
                    ok: true,
                    summary: format!(
                        "{} (The referee could not grade it: {error})",
                        reading.summary
                    ),
                    verdict: None,
                    data: reading.data,
                }
            }
        };

        let mut summary = reading.summary.clone();

        if let Some(verdict) = &verdict {
            let stated = format!("{} {} {}", verdict.field, verdict.op, verdict.value);

            if let Some(source) = &verdict.known {
                agent.state.known += 1;
                self.tally.known += 1;

                summary.push_str(&format!(
                    " Your prediction {stated} held, as {source} already guarantees, so it earns nothing: predict something that could fail."
                ));
            } else {
                agent.state.predictions += 1;

                if verdict.held {
                    agent.state.held += 1;
                    self.tally.held += 1;
                } else {
                    agent.state.broken += 1;
                    self.tally.broken += 1;
                }

                summary.push_str(&format!(
                    " Your prediction {stated} {}: observed {}.",
                    if verdict.held { "held" } else { "broke" },
                    verdict.observed
                ));

                if let Some(key) = text(args, "claim", 60) {
                    let moved = self
                        .judge(agent, &key, tool, &reading.summary, verdict.held)
                        .await;

                    summary.push_str(&moved);
                }
            }
        }

        Done {
            ok: true,
            summary,
            verdict,
            data: reading.data,
        }
    }

    async fn judge(
        &mut self,
        agent: &mut Agent,
        key: &str,
        tool: Tool,
        summary: &str,
        held: bool,
    ) -> String {
        let Ok(Some(mut node)) = agent.store.node(key).await else {
            return format!(" There is no claim {key}.");
        };

        if node.kind != Kind::Conjecture || node.front != self.front.id {
            return format!(" {key} is not a claim on this front, so it did not move.");
        }

        let before = node.trust;

        if node.trust == Trust::Conjectured || node.trust == Trust::Measured {
            node.trust = if held {
                Trust::Measured
            } else {
                Trust::Refuted
            };
        }

        node.evidence.push(Evidence {
            episode: self.episode,
            tool: tool.name().to_string(),
            summary: summary.chars().take(300).collect(),
            held: Some(held),
        });

        node.updated = super::now();

        let after = node.trust;

        if agent.store.put_node(&node).await.is_ok() {
            self.tally.touched.push(node.key.clone());
            agent.emit(Event::Node { node });
        }

        let word = format!("{after:?}").to_lowercase();

        if before == after {
            format!(" {key} stays {word}.")
        } else {
            format!(" {key} is now {word}.")
        }
    }

    async fn read(
        &mut self,
        agent: &mut Agent,
        tool: Tool,
        args: &Value,
    ) -> Result<Reading, String> {
        match tool {
            Tool::Line => self.line(agent, args).await,
            Tool::Contour => {
                let args = args.clone();
                let (reading, found) = blocking(move || instruments::contour(&args)).await?;

                agent.state.contours += 1;

                let probe = Probe {
                    sigma_from: found.sigma.0,
                    sigma_to: found.sigma.1,
                    t_from: found.t.0,
                    t_to: found.t.1,
                    zeros: found.zeros,
                    episode: self.episode,
                };

                agent
                    .store
                    .put_probe(&probe)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(reading)
            }
            Tool::Spacing => {
                let from = number(args, "from").unwrap_or(0.0);
                let to = number(args, "to").unwrap_or(f64::MAX);
                let stretches = agent.store.stretches().await.map_err(|e| e.to_string())?;

                let mut zeros: Vec<f64> = stretches
                    .iter()
                    .flat_map(|s| s.zeros.iter().copied())
                    .filter(|z| (from..=to).contains(z))
                    .collect();

                distinct(&mut zeros);

                let start = zeros.len().saturating_sub(20_000);
                let reading = blocking(move || instruments::spacing(&zeros[start..])).await?;
                let distance = reading.fields["distance_gue"].as_f64();

                if record_min(&mut agent.state.records.gue_distance, distance) {
                    self.tally.records += 1;
                }

                Ok(reading)
            }
            Tool::Robin => {
                let args = args.clone();
                let reading = blocking(move || instruments::robin(&args)).await?;
                let digits = reading.fields["digits"].as_f64().unwrap_or(0.0);
                let records = &mut agent.state.records;

                if digits > records.robin_digits.unwrap_or(0.0) && digits > 5040f64.log10() {
                    records.robin_digits = Some(digits);
                    records.robin_margin = reading.fields["margin"].as_f64();
                    self.tally.records += 1;
                }

                Ok(reading)
            }
            Tool::Mertens => {
                let args = args.clone();
                let reading = blocking(move || instruments::mertens(&args)).await?;
                let x = reading.data["x"].as_u64().unwrap_or(0);
                let records = &mut agent.state.records;

                if x > records.mertens_x.unwrap_or(0) {
                    records.mertens_x = Some(x);
                    records.mertens_ratio = reading.fields["worst_ratio"].as_f64();
                    self.tally.records += 1;
                }

                Ok(reading)
            }
            Tool::Hasse => {
                let args = args.clone();
                let reading = blocking(move || instruments::hasse(&args)).await?;
                let primes = reading.fields["primes"].as_u64();
                let records = &mut agent.state.records;

                if primes > records.hasse_primes {
                    records.hasse_primes = primes;
                    self.tally.records += 1;
                }

                Ok(reading)
            }
            Tool::Zeta => {
                let args = args.clone();

                blocking(move || instruments::zeta_at(&args)).await
            }
            other => Err(format!("{} is not an instrument.", other.name())),
        }
    }

    async fn line(&mut self, agent: &mut Agent, args: &Value) -> Result<Reading, String> {
        let frontier = agent.state.frontier.max(10.0);
        let from = number(args, "from").unwrap_or(frontier);
        let to = number(args, "to").unwrap_or(from + DEFAULT_WIDTH);
        let (mut reading, stretch) = blocking(move || instruments::line(from, to)).await?;
        let contiguous = stretch.from <= frontier + 1e-6 && stretch.to > frontier;

        let certificate = stretch
            .certified
            .clone()
            .filter(|c| contiguous && c.height > frontier);

        let normalized = stretch
            .zeros
            .windows(2)
            .map(|w| (w[1] - w[0]) * (w[0] / (2.0 * PI)).ln() / (2.0 * PI))
            .fold(f64::INFINITY, f64::min);

        if normalized.is_finite()
            && record_min(&mut agent.state.records.closest_gap, Some(normalized))
        {
            self.tally.records += 1;
        }

        let record = Stretch {
            from: stretch.from,
            to: stretch.to,
            expected: stretch.expected,
            missing: stretch.missing,
            bad_gram: stretch.bad_gram as u64,
            closest_gap: normalized,
            episode: self.episode,
            zeros: stretch.zeros,
        };

        agent
            .store
            .put_stretch(&record)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(certificate) = certificate {
            self.turing(agent, &mut reading, &certificate).await?;
        }

        Ok(reading)
    }

    async fn turing(
        &mut self,
        agent: &mut Agent,
        reading: &mut Reading,
        certificate: &Certificate,
    ) -> Result<(), String> {
        let mut zeros: Vec<f64> = agent
            .store
            .stretches()
            .await
            .map_err(|e| e.to_string())?
            .iter()
            .flat_map(|s| s.zeros.iter().copied())
            .filter(|&z| z <= certificate.height)
            .collect();

        distinct(&mut zeros);

        let found = zeros.len() as u64;
        let exact = (certificate.gram + 1) as u64;

        let sentence = if found == exact {
            agent.state.frontier = certificate.height;
            agent.state.zeros = exact;
            agent.state.missing = 0;
            self.tally.advanced = true;

            format!(
                " Turing's method: {} Rosser blocks past t = {:.3} fix N = {exact} below it, and all {exact} were found on the line.",
                certificate.blocks, certificate.height
            )
        } else {
            agent.state.missing = exact.abs_diff(found);

            format!(
                " Turing's method: N({:.3}) = {exact}, but {found} were found on the line.",
                certificate.height
            )
        };

        reading.summary.push_str(&sentence);

        if let Some(data) = reading.data.as_object_mut() {
            data.insert(
                "turing".into(),
                json!({
                    "gram": certificate.gram,
                    "height": certificate.height,
                    "count": exact,
                    "found": found,
                    "blocks": certificate.blocks,
                }),
            );
        }

        Ok(())
    }

    async fn formalize(&mut self, agent: &mut Agent, args: &Value) -> Done {
        let Some(statement) = text(args, "statement", 1200) else {
            return Done::refused("formalize needs a statement: theorem name (args) : prop");
        };

        let statement = statement
            .trim_end_matches(":= by")
            .trim_end_matches(":=")
            .trim()
            .to_string();

        let names = declared(&statement);

        let Some(name) = names.first().cloned() else {
            return Done::refused("Name the theorem: start with theorem name.");
        };

        if agent
            .bench
            .library()
            .iter()
            .any(|code| declared(code).contains(&name))
        {
            return Done::refused(format!("{name} is already proved; choose a new name."));
        }

        let shape = signature(&statement);

        if let Some(twin) = agent
            .bench
            .library()
            .iter()
            .find(|code| signature(code) == shape)
            .and_then(|code| declared(code).into_iter().next())
        {
            return Done::refused(format!(
                "Your library already proves this statement as {twin}. Prove something new."
            ));
        }

        if !agent.bench.available() {
            return Done::refused("Lean is not available right now.");
        }

        let claim = match text(args, "claim", 60) {
            Some(claim) => Some(claim),
            None => self.matching(agent, &statement).await,
        };

        let mut helped = None;

        let proof = match text(args, "proof", 3000) {
            Some(proof) => proof.trim_start_matches(":=").trim().to_string(),
            None => match search::prove(agent, &statement).await {
                Ok(Some(found)) => {
                    helped = Some(found.helped);

                    search::script(&found.tactics)
                }
                Ok(None) => {
                    self.attempted(
                        agent,
                        claim.as_deref(),
                        &statement,
                        "the proof search ran out of moves",
                    )
                    .await;

                    return Done::refused(
                        "The proof search ran out of moves. Try a proof, or a smaller lemma.",
                    );
                }
                Err(error) => return Done::refused(error),
            },
        };

        let code = format!("{statement} := {proof}");
        let checked = agent.bench.check(&code).await;

        if !checked.ok {
            let error = checked
                .errors
                .join(" ")
                .chars()
                .take(500)
                .collect::<String>();

            self.attempted(agent, claim.as_deref(), &statement, &error)
                .await;

            return Done {
                ok: false,
                summary: format!("Lean rejected it: {error}"),
                verdict: None,
                data: json!({"code": code, "errors": checked.errors}),
            };
        }

        let routine = match helped {
            Some(helped) => !helped,
            None => agent.bench.automatic(&statement).await,
        };

        let lemma = Lemma {
            name: name.clone(),
            code: code.clone(),
            node: claim,
            episode: self.episode,
            axioms: checked.axioms.clone(),
            routine,
        };

        if let Err(error) = agent.keep_lemma(&lemma).await {
            return Done::refused(format!("Lean accepted it but could not keep it: {error}"));
        }

        if routine {
            agent.state.routine += 1;
            self.tally.routine += 1;
        } else {
            agent.state.verified += 1;
            self.tally.verified += 1;
        }

        let claim = self.verify(agent, &lemma, &statement).await;
        let axioms = checked.axioms.join(", ");

        let kept = if routine {
            "Lean's automation proves it with no help, so it is filed as routine and earns little. Aim at statements about ζ."
        } else {
            "It is now in your library."
        };

        Done {
            ok: true,
            summary: format!(
                "Lean accepted {name} in {} ms; it rests only on {axioms}. {kept}{claim}",
                checked.millis
            ),
            verdict: None,
            data: json!({
                "code": code,
                "axioms": checked.axioms,
                "millis": checked.millis,
                "routine": routine,
            }),
        }
    }

    async fn verify(&mut self, agent: &mut Agent, lemma: &Lemma, statement: &str) -> String {
        let claimed = match &lemma.node {
            Some(key) => agent.store.node(key).await.ok().flatten(),
            None => None,
        };

        if lemma.routine && claimed.is_none() {
            return String::new();
        }

        let exact = claimed.as_ref().is_some_and(|node| {
            node.lean
                .as_deref()
                .is_some_and(|lean| signature(lean) == signature(statement))
        });

        let note = match (&claimed, exact) {
            (Some(node), true) => format!(" {} is now proved.", node.key),
            (Some(node), false) => format!(
                " It is not the Lean statement registered for {}, so {} stays where it is; the lemma is linked as support.",
                node.key, node.key
            ),
            (None, _) => String::new(),
        };

        let mut node = claimed.clone().filter(|_| exact).unwrap_or_else(|| {
            let key = format!("lean-{}", lemma.name);
            let mut node = Node::new(&key, Kind::Theorem, Trust::Verified, &lemma.name, statement);

            node.front = self.front.id.to_string();

            node
        });

        node.trust = Trust::Verified;
        node.lean = Some(statement.to_string());
        node.proof = Some(lemma.code.clone());
        node.episode = self.episode;
        node.updated = super::now();

        node.evidence.push(Evidence {
            episode: self.episode,
            tool: "lean".into(),
            summary: format!(
                "Checked by Lean{}; axioms {}",
                if lemma.routine {
                    ", by automation alone"
                } else {
                    ""
                },
                lemma.axioms.join(", ")
            ),
            held: Some(true),
        });

        let proved = node.key.clone();

        if agent.store.put_node(&node).await.is_ok() {
            self.tally.touched.push(node.key.clone());
            agent.emit(Event::Node { node });
        }

        if let (Some(claim), false) = (claimed, exact) {
            let link = Link {
                from: proved,
                to: claim.key,
                relation: Relation::Supports,
                episode: self.episode,
            };

            if let Ok(true) = agent.store.link(&link).await {
                agent.emit(Event::Link { link });
            }

            return note;
        }

        format!("{note}{}", self.compose(agent, &proved).await)
    }

    async fn attempted(
        &mut self,
        agent: &mut Agent,
        key: Option<&str>,
        statement: &str,
        why: &str,
    ) {
        let Some(key) = key else { return };

        let Ok(Some(mut node)) = agent.store.node(key).await else {
            return;
        };

        let exact = node
            .lean
            .as_deref()
            .is_some_and(|lean| signature(lean) == signature(statement));

        if !exact || matches!(node.trust, Trust::Verified | Trust::Mathlib) {
            return;
        }

        node.evidence.push(Evidence {
            episode: self.episode,
            tool: "lean".into(),
            summary: format!(
                "Lean rejected an attempt: {}",
                why.chars().take(200).collect::<String>()
            ),
            held: Some(false),
        });

        node.updated = super::now();

        if agent.store.put_node(&node).await.is_ok() {
            self.tally.touched.push(node.key.clone());
            agent.emit(Event::Node { node });
        }
    }

    async fn matching(&self, agent: &mut Agent, statement: &str) -> Option<String> {
        let shape = signature(statement);

        agent
            .store
            .nodes()
            .await
            .ok()?
            .into_iter()
            .find(|node| {
                !matches!(node.trust, Trust::Verified | Trust::Mathlib)
                    && node
                        .lean
                        .as_deref()
                        .is_some_and(|lean| signature(lean) == shape)
            })
            .map(|node| node.key)
    }

    async fn reduce(&mut self, agent: &mut Agent, args: &Value) -> Done {
        let Some(key) = text(args, "target", 60) else {
            return Done::refused(
                "reduce needs target: the key of an open Lean target, such as rh.",
            );
        };

        let target = match agent.store.node(&key).await {
            Ok(Some(node)) => node,
            _ => return Done::refused(format!("There is no key {key}.")),
        };

        let Some(lean) = target.lean.clone() else {
            return Done::refused(format!("{key} has no Lean statement to reduce."));
        };

        if matches!(target.trust, Trust::Verified | Trust::Mathlib) {
            return Done::refused(format!("{key} is already proved."));
        }

        if target.trust == Trust::Refuted {
            return Done::refused(format!("{key} was refuted; reduce an open target."));
        }

        let hypotheses: Vec<String> = match &args["from"] {
            Value::Array(items) => items
                .iter()
                .filter_map(Value::as_str)
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect(),
            Value::String(item) if !item.trim().is_empty() => vec![item.trim().to_string()],
            _ => Vec::new(),
        };

        if hypotheses.is_empty() || hypotheses.len() > tree::OBLIGATIONS {
            return Done::refused(
                "from needs one to three Lean propositions the target should follow from.",
            );
        }

        if let Some(long) = hypotheses.iter().find(|h| h.chars().count() > 600) {
            return Done::refused(format!(
                "Keep each statement under 600 characters; one has {}.",
                long.chars().count()
            ));
        }

        if hypotheses.iter().any(|h| h.contains(":=")) {
            return Done::refused("Give each statement as a proposition, without a proof.");
        }

        if let Some(same) = hypotheses.iter().find(|h| tree::restates(&lean, h)) {
            return Done::refused(format!(
                "\"{same}\" restates {key}; reduce it to something smaller."
            ));
        }

        let routes = agent
            .store
            .reductions()
            .await
            .map(|all| all.iter().filter(|r| r.target == key).count())
            .unwrap_or(0);

        if routes >= tree::ROUTES {
            return Done::refused(format!(
                "{key} already has {routes} routes; prove one of their obligations instead."
            ));
        }

        let Some((target_name, _)) = tree::proposition(&lean) else {
            return Done::refused(format!("{key}'s Lean statement cannot be reduced."));
        };

        self.reductions += 1;

        let name = format!("{target_name}_from_e{}_{}", self.episode, self.reductions);

        let Some(statement) = tree::reduction(&lean, &name, &hypotheses) else {
            return Done::refused(format!("{key}'s Lean statement cannot be reduced."));
        };

        if !agent.bench.available() {
            return Done::refused("Lean is not available right now.");
        }

        if agent.bench.restated(&statement).await {
            return Done::refused(
                "Lean's automation gets the target straight from these statements, so they only restate it. Reduce to something smaller.",
            );
        }

        for (at, hypothesis) in hypotheses.iter().enumerate() {
            if agent.bench.disproved(hypothesis).await {
                return Done::refused(format!(
                    "Lean disproves statement {} on its own, so this route leads nowhere.",
                    at + 1
                ));
            }
        }

        let proof = match text(args, "proof", 3000) {
            Some(proof) => proof.trim_start_matches(":=").trim().to_string(),
            None => match search::prove(agent, &statement).await {
                Ok(Some(found)) => search::script(&found.tactics),
                Ok(None) => {
                    return Done::refused(
                        "The proof search could not derive the target from these. Give a proof, or reduce differently.",
                    )
                }
                Err(error) => return Done::refused(error),
            },
        };

        let code = format!("{statement} := {proof}");
        let checked = agent.bench.check(&code).await;

        if !checked.ok {
            let error = checked
                .errors
                .join(" ")
                .chars()
                .take(500)
                .collect::<String>();

            return Done {
                ok: false,
                summary: format!("Lean rejected the reduction: {error}"),
                verdict: None,
                data: json!({"code": code, "errors": checked.errors}),
            };
        }

        let lemma = Lemma {
            name: name.clone(),
            code: code.clone(),
            node: Some(key.clone()),
            episode: self.episode,
            axioms: checked.axioms.clone(),
            routine: false,
        };

        if let Err(error) = agent.keep_lemma(&lemma).await {
            return Done::refused(format!("Lean accepted it but could not keep it: {error}"));
        }

        let titles: Vec<String> = args["titles"]
            .as_array()
            .map(|all| {
                all.iter()
                    .filter_map(Value::as_str)
                    .map(|t| t.trim().chars().take(80).collect())
                    .collect()
            })
            .unwrap_or_default();

        let mut obligations = Vec::new();

        for (at, hypothesis) in hypotheses.iter().enumerate() {
            let obligation = format!("ob{}-{}-{}", self.episode, self.reductions, at + 1);

            let title = titles
                .get(at)
                .filter(|t| !t.is_empty())
                .cloned()
                .unwrap_or_else(|| format!("Step {} toward {}", at + 1, target.title));

            let mut node = Node::new(&obligation, Kind::Target, Trust::Open, &title, hypothesis);

            node.front = "lean".into();
            node.episode = self.episode;
            node.source = Some(format!("Obligation of {name}"));
            node.lean = Some(tree::obligation(&name, at, hypothesis));
            node.updated = super::now();

            if agent.store.put_node(&node).await.is_ok() {
                agent.emit(Event::Node { node });
            }

            let link = Link {
                from: key.clone(),
                to: obligation.clone(),
                relation: Relation::Uses,
                episode: self.episode,
            };

            if let Ok(true) = agent.store.link(&link).await {
                agent.emit(Event::Link { link });
            }

            obligations.push(obligation);
        }

        let reduction = Reduction {
            lemma: name.clone(),
            target: key.clone(),
            obligations: obligations.clone(),
            episode: self.episode,
            closed: false,
        };

        if let Err(error) = agent.store.put_reduction(&reduction).await {
            return Done::refused(format!(
                "Lean accepted it but could not keep the route: {error}"
            ));
        }

        let mut target = target;

        target.evidence.push(Evidence {
            episode: self.episode,
            tool: "lean".into(),
            summary: format!("Reduced by {name} to {}", obligations.join(", ")),
            held: None,
        });

        target.updated = super::now();

        if agent.store.put_node(&target).await.is_ok() {
            agent.emit(Event::Node { node: target });
        }

        agent.state.reductions += 1;
        self.tally.reduced += 1;
        self.tally.touched.push(key.clone());

        let listed: Vec<String> = obligations
            .iter()
            .zip(&hypotheses)
            .enumerate()
            .map(|(at, (key, _))| {
                format!("{key}: {}", tree::obligation(&name, at, &hypotheses[at]))
            })
            .collect();

        Done {
            ok: true,
            summary: format!(
                "Lean accepted {name} in {} ms: {key} follows from {}. Prove {} with formalize, passing claim. {}",
                checked.millis,
                obligations.join(" and "),
                if obligations.len() == 1 { "it" } else { "them" },
                listed.join("; ")
            ),
            verdict: None,
            data: json!({
                "code": code,
                "axioms": checked.axioms,
                "millis": checked.millis,
                "target": key,
                "obligations": obligations,
            }),
        }
    }

    async fn compose(&mut self, agent: &mut Agent, proved: &str) -> String {
        let mut notes = String::new();
        let mut queue = vec![proved.to_string()];

        while let Some(key) = queue.pop() {
            let Ok(reductions) = agent.store.reductions().await else {
                break;
            };

            for mut reduction in reductions
                .into_iter()
                .filter(|r| !r.closed && r.obligations.contains(&key))
            {
                let mut proofs = Vec::new();

                for obligation in &reduction.obligations {
                    match agent.store.node(obligation).await {
                        Ok(Some(node)) if node.trust == Trust::Verified => {
                            proofs.extend(tree::proved_by(&node))
                        }
                        _ => break,
                    }
                }

                if proofs.len() != reduction.obligations.len() {
                    continue;
                }

                let Ok(Some(mut target)) = agent.store.node(&reduction.target).await else {
                    continue;
                };

                if matches!(target.trust, Trust::Verified | Trust::Mathlib) {
                    reduction.closed = true;

                    let _ = agent.store.put_reduction(&reduction).await;

                    continue;
                }

                let Some(lean) = target.lean.clone() else {
                    continue;
                };

                let code = tree::assembly(&lean, &reduction.lemma, &proofs);
                let checked = agent.bench.check(&code).await;

                let Some(name) = declared(&code).into_iter().next().filter(|_| checked.ok) else {
                    continue;
                };

                let lemma = Lemma {
                    name,
                    code: code.clone(),
                    node: Some(target.key.clone()),
                    episode: self.episode,
                    axioms: checked.axioms.clone(),
                    routine: false,
                };

                if agent.keep_lemma(&lemma).await.is_err() {
                    continue;
                }

                target.trust = Trust::Verified;
                target.proof = Some(code);
                target.episode = self.episode;
                target.updated = super::now();

                target.evidence.push(Evidence {
                    episode: self.episode,
                    tool: "lean".into(),
                    summary: format!(
                        "Proved by composing {} with {}",
                        reduction.lemma,
                        proofs.join(", ")
                    ),
                    held: Some(true),
                });

                if agent.store.put_node(&target).await.is_ok() {
                    self.tally.touched.push(target.key.clone());

                    agent.emit(Event::Node {
                        node: target.clone(),
                    });
                }

                reduction.closed = true;

                let _ = agent.store.put_reduction(&reduction).await;

                agent.state.verified += 1;
                self.tally.verified += 1;
                self.tally.composed += 1;

                notes.push_str(&format!(
                    " With that, {} is proved by composition.",
                    target.key
                ));

                queue.push(target.key);
            }
        }

        notes
    }
}

pub(super) async fn recall(agent: &mut Agent, args: &Value) -> Done {
    let Some(query) = text(args, "query", 200) else {
        return Done::refused("recall needs a query.");
    };

    match agent.store.recall(&query, 6).await {
        Ok(nodes) if nodes.is_empty() => Done::said("Nothing in memory matches."),
        Ok(nodes) => Done {
            ok: true,
            summary: nodes.iter().map(Node::line).collect::<Vec<_>>().join("\n"),
            verdict: None,
            data: json!({"keys": nodes.iter().map(|n| n.key.clone()).collect::<Vec<_>>()}),
        },
        Err(error) => Done::refused(format!("Memory is unavailable: {error}")),
    }
}

pub(super) async fn link(agent: &mut Agent, episode: u64, args: &Value) -> Done {
    let (Some(from), Some(to), Some(relation)) = (
        text(args, "from", 60),
        text(args, "to", 60),
        args["relation"].as_str().and_then(Relation::parse),
    ) else {
        return Done::refused("link needs from, to and a relation.");
    };

    for key in [&from, &to] {
        if !matches!(agent.store.node(key).await, Ok(Some(_))) {
            return Done::refused(format!("There is no key {key}."));
        }
    }

    let link = Link {
        from,
        to,
        relation,
        episode,
    };

    match agent.store.link(&link).await {
        Ok(true) => {
            agent.emit(Event::Link { link });

            Done::said("Linked.")
        }
        Ok(false) => Done::said("Already linked."),
        Err(error) => Done::refused(format!("Could not link: {error}")),
    }
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    match tokio::time::timeout(INSTRUMENT_LIMIT, tokio::task::spawn_blocking(work)).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("The instrument crashed.".into()),
        Err(_) => Err("The instrument ran out of time; ask for less.".into()),
    }
}

pub(super) fn normalized(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn slim(mut data: Value) -> Value {
    if let Some(zeros) = data.get_mut("zeros").and_then(Value::as_array_mut) {
        zeros.truncate(400);
    }

    data
}

fn record_min(slot: &mut Option<f64>, candidate: Option<f64>) -> bool {
    match candidate {
        Some(value) if value.is_finite() && slot.is_none_or(|current| value < current) => {
            *slot = Some(value);

            true
        }
        _ => false,
    }
}
