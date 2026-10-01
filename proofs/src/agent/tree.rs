use super::memory::{Link, Node, Reduction, Relation, Trust};
use crate::lean::workbench::{declared, signature};
use serde::Serialize;
use std::collections::HashMap;

pub const ROOT: &str = "rh";
pub const OBLIGATIONS: usize = 3;
pub const ROUTES: usize = 4;
const DEPTH: usize = 5;
const ROWS: usize = 40;
pub const OPEN_PROBLEM: f64 = 1000.0;
const FAILURE: f64 = 0.5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Via {
    Root,
    Reduction,
    Uses,
    Implies,
    Supports,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub key: String,
    pub depth: usize,
    pub via: Via,
    pub lemma: Option<String>,
    pub title: String,
    pub trust: Trust,
    pub lean: Option<String>,
    pub number: Option<f64>,
}

pub fn proposition(statement: &str) -> Option<(String, String)> {
    let text = statement
        .trim()
        .trim_end_matches(":= by")
        .trim_end_matches(":=")
        .trim();

    let mut words = text.splitn(3, char::is_whitespace);

    if !matches!(words.next()?, "theorem" | "lemma") {
        return None;
    }

    let name = words.next()?.to_string();
    let rest = words.next()?.trim().to_string();

    rest.contains(':').then_some((name, rest))
}

pub fn reduction(target: &str, name: &str, hypotheses: &[String]) -> Option<String> {
    let (_, rest) = proposition(target)?;

    let binders: Vec<String> = hypotheses
        .iter()
        .enumerate()
        .map(|(at, hypothesis)| format!("(ob{} : {hypothesis})", at + 1))
        .collect();

    Some(format!("theorem {name} {} {rest}", binders.join(" ")))
}

pub fn obligation(name: &str, at: usize, hypothesis: &str) -> String {
    format!("theorem {name}_h{} : {hypothesis}", at + 1)
}

pub fn assembly(target: &str, lemma: &str, proofs: &[String]) -> String {
    let arguments = proofs.join(" ");

    format!(
        "{} := by\n  first\n  | exact {lemma} {arguments}\n  | (apply {lemma} {arguments} <;> assumption)",
        target.trim().trim_end_matches(":= by").trim_end_matches(":=").trim()
    )
}

pub fn conclusion(rest: &str) -> &str {
    let mut depth = 0i32;

    for (at, c) in rest.char_indices() {
        match c {
            '(' | '[' | '{' | '⦃' => depth += 1,
            ')' | ']' | '}' | '⦄' => depth -= 1,
            ':' if depth == 0 && !rest[at + 1..].starts_with('=') => {
                return rest[at + 1..].trim();
            }
            _ => {}
        }
    }

    rest.trim()
}

pub fn restates(target: &str, hypothesis: &str) -> bool {
    let Some((name, rest)) = proposition(target) else {
        return false;
    };

    let squeeze = |text: &str| text.split_whitespace().collect::<String>();
    let wanted = squeeze(conclusion(&rest));

    squeeze(hypothesis).contains(&wanted)
        || signature(&format!("theorem x : {hypothesis}")) == signature(target)
        || hypothesis.contains(&name)
}

pub fn proved_by(node: &Node) -> Option<String> {
    node.proof
        .as_deref()
        .and_then(|code| declared(code).into_iter().next())
}

pub fn rows(nodes: &[Node], links: &[Link], reductions: &[Reduction]) -> Vec<Row> {
    let find = |key: &str| nodes.iter().find(|node| node.key == key);
    let mut rows = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let mut stack: Vec<(String, usize, Via, Option<String>)> =
        vec![(ROOT.to_string(), 0, Via::Root, None)];

    while let Some((key, depth, via, lemma)) = stack.pop() {
        if rows.len() >= ROWS || seen.contains(&key) {
            continue;
        }

        let Some(node) = find(&key) else { continue };

        seen.push(key.clone());

        rows.push(Row {
            key: key.clone(),
            depth,
            via,
            lemma,
            title: node.title.clone(),
            trust: node.trust,
            lean: node.lean.clone(),
            number: None,
        });

        if depth >= DEPTH {
            continue;
        }

        let mut children: Vec<(String, Via, Option<String>)> = Vec::new();

        for reduction in reductions.iter().filter(|r| r.target == key) {
            for obligation in &reduction.obligations {
                children.push((
                    obligation.clone(),
                    Via::Reduction,
                    Some(reduction.lemma.clone()),
                ));
            }
        }

        for link in links {
            let child = match link.relation {
                Relation::Uses if link.from == key => &link.to,
                Relation::Implies | Relation::Equivalent | Relation::Supports if link.to == key => {
                    &link.from
                }
                _ => continue,
            };

            let formal = find(child).is_some_and(|node| {
                node.lean.is_some() || matches!(node.trust, Trust::Mathlib | Trust::Verified)
            });

            if formal && !children.iter().any(|(k, _, _)| k == child) {
                let via = match link.relation {
                    Relation::Uses => Via::Uses,
                    Relation::Supports => Via::Supports,
                    _ => Via::Implies,
                };

                children.push((child.clone(), via, None));
            }
        }

        for (child, via, lemma) in children.into_iter().rev() {
            stack.push((child, depth + 1, via, lemma));
        }
    }

    rows
}

#[derive(Debug, Clone, PartialEq)]
enum Choice {
    Settled,
    Direct(Vec<String>),
    Route(Vec<String>),
}

pub struct Numbers {
    numbers: HashMap<String, (f64, Choice)>,
}

pub fn failures(node: &Node) -> usize {
    node.evidence
        .iter()
        .filter(|e| e.tool == "lean" && e.held == Some(false))
        .count()
}

pub fn open_problem(node: &Node) -> bool {
    node.kind == super::memory::Kind::Target
        && !node
            .source
            .as_deref()
            .is_some_and(|source| source.starts_with("Obligation of"))
}

impl Numbers {
    pub fn new(nodes: &[Node], links: &[Link], reductions: &[Reduction]) -> Self {
        let mut numbers = Numbers {
            numbers: HashMap::new(),
        };

        let mut visiting = Vec::new();

        numbers.number(ROOT, nodes, links, reductions, &mut visiting);

        numbers
    }

    fn number(
        &mut self,
        key: &str,
        nodes: &[Node],
        links: &[Link],
        reductions: &[Reduction],
        visiting: &mut Vec<String>,
    ) -> f64 {
        if let Some((number, _)) = self.numbers.get(key) {
            return *number;
        }

        let Some(node) = nodes.iter().find(|node| node.key == key) else {
            return f64::INFINITY;
        };

        if settled(node.trust) {
            self.numbers.insert(key.to_string(), (0.0, Choice::Settled));

            return 0.0;
        }

        if node.trust == Trust::Refuted
            || visiting.iter().any(|seen| seen == key)
            || visiting.len() > DEPTH * 2
        {
            return f64::INFINITY;
        }

        visiting.push(key.to_string());

        let routes: Vec<&Reduction> = reductions
            .iter()
            .filter(|r| r.target == key && !r.closed)
            .collect();

        let mut best = (f64::INFINITY, Choice::Direct(Vec::new()));

        if node.lean.is_some() {
            let needs: Vec<String> = links
                .iter()
                .filter(|link| link.relation == Relation::Uses && link.from == key)
                .map(|link| link.to.clone())
                .filter(|to| !routes.iter().any(|r| r.obligations.contains(to)))
                .collect();

            let base = if open_problem(node) {
                OPEN_PROBLEM
            } else {
                1.0 + FAILURE * failures(node) as f64
            };

            let cost = base
                + needs
                    .iter()
                    .map(|need| self.number(need, nodes, links, reductions, visiting))
                    .sum::<f64>();

            best = (cost, Choice::Direct(needs));
        }

        for route in routes {
            let cost: f64 = route
                .obligations
                .iter()
                .map(|ob| self.number(ob, nodes, links, reductions, visiting))
                .sum();

            if cost < best.0 {
                best = (cost, Choice::Route(route.obligations.clone()));
            }
        }

        visiting.pop();

        let number = best.0;

        self.numbers.insert(key.to_string(), best);

        number
    }

    pub fn of(&self, key: &str) -> Option<f64> {
        self.numbers
            .get(key)
            .map(|(number, _)| *number)
            .filter(|number| number.is_finite())
    }

    pub fn focus(&self) -> Option<String> {
        let mut key = ROOT.to_string();

        for _ in 0..DEPTH * 2 {
            let (_, choice) = self.numbers.get(&key)?;

            let next = match choice {
                Choice::Settled => return None,
                Choice::Direct(needs) => needs
                    .iter()
                    .filter(|need| self.of(need).is_some_and(|n| n > 0.0))
                    .min_by(|a, b| self.of(a).partial_cmp(&self.of(b)).unwrap()),
                Choice::Route(obligations) => obligations
                    .iter()
                    .filter(|ob| self.of(ob).is_some_and(|n| n > 0.0))
                    .min_by(|a, b| self.of(a).partial_cmp(&self.of(b)).unwrap()),
            };

            match next {
                Some(next) => key = next.clone(),
                None => return Some(key),
            }
        }

        Some(key)
    }
}

pub fn numbered(mut rows: Vec<Row>, numbers: &Numbers) -> Vec<Row> {
    for row in &mut rows {
        row.number = numbers.of(&row.key);
    }

    rows
}

fn settled(trust: Trust) -> bool {
    matches!(trust, Trust::Verified | Trust::Mathlib)
}

pub fn open_leaves(rows: &[Row]) -> Vec<&Row> {
    rows.iter()
        .enumerate()
        .filter(|(at, row)| {
            row.lean.is_some()
                && !settled(row.trust)
                && row.trust != Trust::Refuted
                && rows[at + 1..]
                    .iter()
                    .take_while(|next| next.depth > row.depth)
                    .filter(|next| next.depth == row.depth + 1 && next.via != Via::Supports)
                    .all(|child| settled(child.trust))
        })
        .map(|(_, row)| row)
        .collect()
}

pub fn outline(rows: &[Row]) -> Vec<String> {
    rows.iter()
        .map(|row| {
            let mark = match row.trust {
                Trust::Verified | Trust::Mathlib => "proved",
                Trust::Refuted => "refuted",
                _ => "open",
            };

            let number = match row.number {
                Some(n) if n > 0.0 && n < OPEN_PROBLEM => format!(" [proof number {n:.1}]"),
                _ => String::new(),
            };

            let via = match (&row.via, &row.lemma) {
                (Via::Reduction, Some(lemma)) => format!(" (by {lemma})"),
                (Via::Uses, _) => " (needed)".to_string(),
                (Via::Implies, _) => " (would imply its parent)".to_string(),
                (Via::Supports, _) => " (supports it)".to_string(),
                _ => String::new(),
            };

            let lean = match (&row.lean, mark) {
                (Some(lean), "open") => format!(" Lean: {lean}"),
                _ => String::new(),
            };

            format!(
                "{}[{}] {mark}{via}{number}: {}.{lean}",
                "  ".repeat(row.depth),
                row.key,
                row.title
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{memory::Kind, seed};

    #[test]
    fn reductions_put_the_obligations_before_the_target_binders() {
        let target = "theorem zero_mirror (s : ℂ) (h0 : 0 < s.re) : riemannZeta (1 - s) = 0";

        assert_eq!(
            reduction(target, "zero_mirror_from_e3_1", &["P".into(), "Q".into()]).unwrap(),
            "theorem zero_mirror_from_e3_1 (ob1 : P) (ob2 : Q) (s : ℂ) (h0 : 0 < s.re) : riemannZeta (1 - s) = 0"
        );

        assert_eq!(
            reduction(
                "theorem riemann_hypothesis : RiemannHypothesis",
                "rh_from_e1_1",
                &["P".into()]
            )
            .unwrap(),
            "theorem rh_from_e1_1 (ob1 : P) : RiemannHypothesis"
        );

        assert!(reduction("RiemannHypothesis", "x", &[]).is_none());

        assert_eq!(
            obligation("rh_from_e1_1", 0, "P"),
            "theorem rh_from_e1_1_h1 : P"
        );

        assert!(assembly("theorem t : Q", "red", &["a".into(), "b".into()])
            .contains("| exact red a b\n  | (apply red a b <;> assumption)"));
    }

    #[test]
    fn the_conclusion_follows_the_first_top_level_colon() {
        assert_eq!(conclusion(": RiemannHypothesis"), "RiemannHypothesis");

        assert_eq!(
            conclusion("(s : ℂ) (h : s.re < 1) : riemannZeta (1 - s) = 0"),
            "riemannZeta (1 - s) = 0"
        );

        assert_eq!(conclusion("(x : ℕ) : ∃ n : ℕ, x = n"), "∃ n : ℕ, x = n");
    }

    #[test]
    fn restating_the_target_is_not_a_reduction() {
        let rh = "theorem riemann_hypothesis : RiemannHypothesis";

        assert!(restates(rh, "RiemannHypothesis ∧ True"));
        assert!(restates(rh, "riemann_hypothesis"));

        assert!(!restates(
            rh,
            "∀ s : ℂ, riemannZeta s = 0 → 1 / 2 < s.re → s.re < 1 → False"
        ));
    }

    #[test]
    fn the_tree_starts_at_the_hypothesis_and_follows_reductions() {
        let mut nodes = seed::nodes();

        let mut core = Node::new(
            "ob-2-1",
            Kind::Target,
            Trust::Open,
            "Nothing right of the line",
            "P",
        );

        core.lean = Some("theorem rh_from_e2_1_h1 : P".into());
        nodes.push(core);

        let reductions = vec![Reduction {
            lemma: "rh_from_e2_1".into(),
            target: "rh".into(),
            obligations: vec!["ob-2-1".into()],
            episode: 2,
            closed: false,
        }];

        let rows = rows(&nodes, &seed::links(), &reductions);

        assert_eq!(rows[0].key, "rh");
        assert_eq!(rows[1].key, "ob-2-1");
        assert_eq!(rows[1].via, Via::Reduction);
        assert!(rows.iter().any(|row| row.key == "strip" && row.depth == 1));

        assert!(rows
            .iter()
            .any(|row| row.key == "no-zero-right" && row.depth == 2 && row.via == Via::Uses));

        let leaves: Vec<&str> = open_leaves(&rows)
            .iter()
            .map(|row| row.key.as_str())
            .collect();

        assert!(leaves.contains(&"ob-2-1") && leaves.contains(&"no-zero-right"));
        assert!(!leaves.contains(&"rh") && !leaves.contains(&"strip"));

        let text = outline(&rows).join("\n");

        assert!(text.contains("  [ob-2-1] open (by rh_from_e2_1)"), "{text}");
    }

    #[test]
    fn proof_numbers_send_the_work_to_the_cheapest_leaf_under_rh() {
        let mut nodes = seed::nodes();
        let links = seed::links();
        let numbers = Numbers::new(&nodes, &links, &[]);

        assert_eq!(numbers.of("rh"), Some(OPEN_PROBLEM));
        assert_eq!(numbers.focus().as_deref(), Some("rh"));

        let obligation = |key: &str, failed: usize| {
            let mut node = Node::new(key, Kind::Target, Trust::Open, key, "P");

            node.lean = Some(format!("theorem {key} : P"));
            node.source = Some("Obligation of r".into());

            for _ in 0..failed {
                node.evidence.push(crate::agent::memory::Evidence {
                    episode: 1,
                    tool: "lean".into(),
                    summary: "Lean rejected an attempt".into(),
                    held: Some(false),
                });
            }

            node
        };

        nodes.push(obligation("a", 4));
        nodes.push(obligation("b", 0));
        nodes.push(obligation("c", 1));

        let reductions = vec![
            Reduction {
                lemma: "r1".into(),
                target: "rh".into(),
                obligations: vec!["a".into(), "b".into()],
                episode: 1,
                closed: false,
            },
            Reduction {
                lemma: "r2".into(),
                target: "rh".into(),
                obligations: vec!["c".into()],
                episode: 2,
                closed: false,
            },
        ];

        let numbers = Numbers::new(&nodes, &links, &reductions);

        assert_eq!(numbers.of("rh"), Some(1.5));
        assert_eq!(numbers.focus().as_deref(), Some("c"));
        nodes.iter_mut().find(|n| n.key == "c").unwrap().trust = Trust::Refuted;

        let numbers = Numbers::new(&nodes, &links, &reductions);

        assert_eq!(numbers.of("rh"), Some(4.0));
        assert_eq!(numbers.focus().as_deref(), Some("b"));
        nodes.iter_mut().find(|n| n.key == "b").unwrap().trust = Trust::Verified;

        let numbers = Numbers::new(&nodes, &links, &reductions);

        assert_eq!(numbers.focus().as_deref(), Some("a"));
    }
}
