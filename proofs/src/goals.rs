use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hypothesis {
    pub names: Vec<String>,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Goal {
    pub case: Option<String>,
    pub hyps: Vec<Hypothesis>,
    pub target: String,
}

pub fn parse(text: &str) -> Goal {
    let mut case = None;
    let mut hyps: Vec<Hypothesis> = Vec::new();
    let mut target: Option<String> = None;
    for (index, line) in text.lines().enumerate() {
        if index == 0 {
            if let Some(name) = line.strip_prefix("case ") {
                case = Some(name.trim().to_string());
                continue;
            }
        }
        if let Some(rest) = line.strip_prefix("⊢ ") {
            target = Some(rest.to_string());
            continue;
        }
        let continued = line.starts_with(' ');
        if continued {
            let piece = line.trim();
            match (&mut target, hyps.last_mut()) {
                (Some(t), _) => {
                    t.push(' ');
                    t.push_str(piece);
                }
                (None, Some(h)) => {
                    if !h.kind.is_empty() {
                        h.kind.push(' ');
                    }
                    h.kind.push_str(piece);
                }
                (None, None) => {}
            }
            continue;
        }
        if let Some(names) = line.strip_suffix(" :") {
            hyps.push(Hypothesis {
                names: names.split_whitespace().map(str::to_string).collect(),
                kind: String::new(),
            });
        } else if let Some((names, kind)) = line.split_once(" : ") {
            hyps.push(Hypothesis {
                names: names.split_whitespace().map(str::to_string).collect(),
                kind: kind.to_string(),
            });
        }
    }
    Goal {
        case,
        hyps,
        target: target.unwrap_or_default(),
    }
}

pub fn clean_error(message: &str) -> String {
    let body = message.strip_prefix("Lean error:\n").unwrap_or(message);
    let mut parts: Vec<&str> = body.split("\n\n").collect();
    while parts.len() > 1 && parts.last().is_some_and(|p| p.contains('⊢')) {
        parts.pop();
    }
    parts.join("\n\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cases_grouped_names_and_target() {
        let goal = parse("case left\np q : Prop\nh : p ∧ q\n⊢ q");
        assert_eq!(goal.case.as_deref(), Some("left"));
        assert_eq!(goal.hyps.len(), 2);
        assert_eq!(goal.hyps[0].names, vec!["p", "q"]);
        assert_eq!(goal.hyps[0].kind, "Prop");
        assert_eq!(goal.hyps[1].kind, "p ∧ q");
        assert_eq!(goal.target, "q");
    }

    #[test]
    fn parses_a_bare_goal() {
        let goal = parse("⊢ 2 + 2 = 4");
        assert_eq!(goal.case, None);
        assert!(goal.hyps.is_empty());
        assert_eq!(goal.target, "2 + 2 = 4");
    }

    #[test]
    fn joins_wrapped_lines() {
        let goal = parse("h :\n  a = b\n⊢ a +\n    0 = b");
        assert_eq!(goal.hyps[0].kind, "a = b");
        assert_eq!(goal.target, "a + 0 = b");
        let goal = parse("h : a =\n  b\n⊢ b");
        assert_eq!(goal.hyps[0].kind, "a = b");
    }

    #[test]
    fn drops_the_goal_echo_from_errors() {
        let message = "Lean error:\nTactic `rfl` failed: The left-hand side\n  2 + 2\nis not definitionally equal to the right-hand side\n  5\n\n⊢ 2 + 2 = 5";
        assert_eq!(
            clean_error(message),
            "Tactic `rfl` failed: The left-hand side\n  2 + 2\nis not definitionally equal to the right-hand side\n  5"
        );
    }
}
