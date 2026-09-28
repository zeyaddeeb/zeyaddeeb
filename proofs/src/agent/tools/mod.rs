pub mod instruments;
pub mod referee;

use super::fronts::Front;
use rig_core::completion::ToolDefinition;
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Plan,
    Conjecture,
    Formalize,
    Recall,
    Link,
    Conclude,
    Line,
    Contour,
    Spacing,
    Robin,
    Mertens,
    Hasse,
    Zeta,
    Insight,
    Letter,
}

const SHARED: &[Tool] = &[
    Tool::Plan,
    Tool::Conjecture,
    Tool::Formalize,
    Tool::Recall,
    Tool::Link,
    Tool::Conclude,
];

const SLEEP: &[Tool] = &[Tool::Insight, Tool::Link, Tool::Letter];

const ALL: &[Tool] = &[
    Tool::Plan,
    Tool::Conjecture,
    Tool::Formalize,
    Tool::Recall,
    Tool::Link,
    Tool::Conclude,
    Tool::Line,
    Tool::Contour,
    Tool::Spacing,
    Tool::Robin,
    Tool::Mertens,
    Tool::Hasse,
    Tool::Zeta,
    Tool::Insight,
    Tool::Letter,
];

impl Tool {
    pub fn name(self) -> &'static str {
        match self {
            Tool::Plan => "plan",
            Tool::Conjecture => "conjecture",
            Tool::Formalize => "formalize",
            Tool::Recall => "recall",
            Tool::Link => "link",
            Tool::Conclude => "conclude",
            Tool::Line => "line",
            Tool::Contour => "contour",
            Tool::Spacing => "spacing",
            Tool::Robin => "robin",
            Tool::Mertens => "mertens",
            Tool::Hasse => "hasse",
            Tool::Zeta => "zeta",
            Tool::Insight => "insight",
            Tool::Letter => "letter",
        }
    }

    pub fn parse(name: &str) -> Option<Self> {
        ALL.iter().copied().find(|tool| tool.name() == name)
    }

    pub fn is_instrument(self) -> bool {
        matches!(
            self,
            Tool::Line
                | Tool::Contour
                | Tool::Spacing
                | Tool::Robin
                | Tool::Mertens
                | Tool::Hasse
                | Tool::Zeta
        )
    }

    pub fn definition(self) -> ToolDefinition {
        let (description, properties, required) = self.shape();
        let mut properties = properties;
        if self.is_instrument() {
            add_prediction(&mut properties);
        }
        ToolDefinition {
            name: self.name().to_string(),
            description: description.to_string(),
            parameters: json!({
                "type": "object",
                "properties": Value::Object(properties),
                "required": required,
            }),
        }
    }

    fn shape(self) -> (&'static str, Map<String, Value>, Vec<&'static str>) {
        match self {
            Tool::Plan => (
                "Begin the episode: one objective, and what you predict before you look.",
                fields(&[
                    ("objective", string("What this episode will settle or test.")),
                    ("prediction", string("What you expect to see, stated so it could be wrong.")),
                    ("instrument", string("The tool you will use first.")),
                ]),
                vec!["objective", "prediction", "instrument"],
            ),
            Tool::Conjecture => (
                "Record a claim before testing it. Returns its key; pass the key as claim when you measure or formalize.",
                fields(&[
                    ("title", string("A short name.")),
                    ("statement", string("The claim, precise enough to be refuted.")),
                    (
                        "lean",
                        string("Optional Lean 4 statement: theorem name (args) : prop. Only a proof of exactly this statement marks the claim proved."),
                    ),
                ]),
                vec!["title", "statement"],
            ),
            Tool::Formalize => (
                "Ask Lean 4 with Mathlib to check a theorem. Give statement as 'theorem name (args) : prop'. \
Give proof as a term or 'by' followed by tactics; leave proof out to let the proof search try automation first. \
A statement your library already proves is refused.",
                fields(&[
                    ("statement", string("theorem name (args) : prop")),
                    ("proof", string("Optional: a term, or by and tactics.")),
                    ("claim", string("Optional key of the conjecture this proves.")),
                ]),
                vec!["statement"],
            ),
            Tool::Recall => (
                "Search the blueprint and past episodes by words.",
                fields(&[("query", string("Words to look for."))]),
                vec!["query"],
            ),
            Tool::Link => (
                "Connect two blueprint keys so that the sentence 'from relation to' is true, e.g. robin equivalent rh.",
                fields(&[
                    ("from", string("Key.")),
                    ("to", string("Key.")),
                    (
                        "relation",
                        json!({"type": "string", "enum": ["implies", "equivalent", "uses", "supports", "refutes", "analogy"]}),
                    ),
                ]),
                vec!["from", "to", "relation"],
            ),
            Tool::Conclude => (
                "End the episode.",
                fields(&[
                    ("summary", string("What you learned, in two sentences, with the numbers.")),
                    ("next", string("What the next episode on this front should try.")),
                ]),
                vec!["summary", "next"],
            ),
            Tool::Line => (
                "Locate every zero of Hardy's Z on the critical line between heights from and to (width ≤ 200), counted against Gram's and Rosser's predictions. \
Leave both out to extend the verified stretch. Fields: zeros, expected, missing, bad_gram, closest_gap, from, to.",
                fields(&[
                    ("from", number("Starting height t.")),
                    ("to", number("Ending height t.")),
                ]),
                vec![],
            ),
            Tool::Contour => (
                "Count zeros of ζ inside a rectangle with the argument principle. Fields: zeros, winding, smallest.",
                fields(&[
                    ("sigma_from", number("Left edge, at least 0.505.")),
                    ("sigma_to", number("Right edge, at most 1.")),
                    ("t_from", number("Bottom edge.")),
                    ("t_to", number("Top edge, at most 40 above the bottom.")),
                ]),
                vec!["sigma_from", "sigma_to", "t_from", "t_to"],
            ),
            Tool::Spacing => (
                "Compare normalized gaps between located zeros with GUE and Poisson. Fields: distance_gue, distance_poisson, smallest, zeros.",
                fields(&[
                    ("from", number("Lowest height to include.")),
                    ("to", number("Highest height to include.")),
                ]),
                vec![],
            ),
            Tool::Robin => (
                "Measure Robin's margin 1 − σ(n)/(e^γ n log log n) for the colossally abundant number with parameter epsilon, or for an integer n. \
Fields: margin, ratio, digits.",
                fields(&[
                    ("epsilon", number("Between 0.000001 and 1; smaller builds a larger n.")),
                    ("n", integer("An integer up to 10^15.")),
                ]),
                vec![],
            ),
            Tool::Mertens => (
                "Compute the Mertens function up to x (at most 200 million). Fields: value, worst_ratio (max |M|/√x past 100), worst_at.",
                fields(&[("x", integer("Upper limit."))]),
                vec!["x"],
            ),
            Tool::Hasse => (
                "Count points on y² = x³ + ax + b over F_p for primes up to primes_up_to (at most 30000). Fields: worst_ratio (max |a_p|/2√p), primes.",
                fields(&[
                    ("a", integer("Coefficient a.")),
                    ("b", integer("Coefficient b.")),
                    ("primes_up_to", integer("Largest prime, default 5000.")),
                ]),
                vec!["a", "b"],
            ),
            Tool::Zeta => (
                "Evaluate ζ(re + i·im). Fields: re, im, modulus, z (Hardy's Z when re = 0.5).",
                fields(&[("re", number("Real part.")), ("im", number("Imaginary part, |im| ≤ 100000."))]),
                vec!["re", "im"],
            ),
            Tool::Insight => (
                "Keep a pattern that spans episodes, tied to the keys that support it.",
                fields(&[
                    ("title", string("A short name.")),
                    ("body", string("The pattern, in two sentences.")),
                    ("basis", json!({"type": "array", "items": {"type": "string"}, "description": "Supporting keys."})),
                ]),
                vec!["title", "body"],
            ),
            Tool::Letter => (
                "Finish sleeping: a note under 80 words to your future self about where to look next and what not to repeat.",
                fields(&[("text", string("The note."))]),
                vec!["text"],
            ),
        }
    }
}

pub fn work(front: &Front) -> Vec<Tool> {
    let mut tools = SHARED.to_vec();
    tools.extend(front.instruments);
    tools
}

pub fn sleep() -> Vec<Tool> {
    SLEEP.to_vec()
}

pub fn definitions(tools: &[Tool]) -> Vec<ToolDefinition> {
    tools.iter().map(|tool| tool.definition()).collect()
}

fn fields(entries: &[(&str, Value)]) -> Map<String, Value> {
    entries
        .iter()
        .map(|(name, schema)| (name.to_string(), schema.clone()))
        .collect()
}

fn string(description: &str) -> Value {
    json!({"type": "string", "description": description})
}

fn number(description: &str) -> Value {
    json!({"type": "number", "description": description})
}

fn integer(description: &str) -> Value {
    json!({"type": "integer", "description": description})
}

fn add_prediction(properties: &mut Map<String, Value>) {
    properties.insert(
        "claim".into(),
        string("Optional key of the conjecture this measurement tests."),
    );
    properties.insert(
        "expect".into(),
        json!({
            "type": "object",
            "description": "Your prediction, graded by the referee.",
            "properties": {
                "field": {"type": "string"},
                "op": {"type": "string", "enum": ["<", "<=", ">", ">=", "="]},
                "value": {"type": "number"}
            },
            "required": ["field", "op", "value"]
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::fronts::FRONTS;

    #[test]
    fn names_round_trip() {
        for tool in ALL {
            assert_eq!(Tool::parse(tool.name()), Some(*tool));
        }
    }

    #[test]
    fn every_front_can_plan_and_conclude() {
        for front in FRONTS {
            let tools = work(front);
            assert!(tools.contains(&Tool::Plan) && tools.contains(&Tool::Conclude));
            assert!(tools.len() <= 10, "{} has {} tools", front.id, tools.len());
        }
    }

    #[test]
    fn instruments_take_a_prediction() {
        let line = Tool::Line.definition();
        assert!(line.parameters["properties"]["expect"].is_object());
        let plan = Tool::Plan.definition();
        assert!(plan.parameters["properties"]["expect"].is_null());
    }
}
