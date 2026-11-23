use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Preset {
    #[default]
    Default,
    Plain,
    Sat,
    Unsat,
}

impl Preset {
    pub const ALL: [Preset; 4] = [Preset::Default, Preset::Plain, Preset::Sat, Preset::Unsat];

    pub fn name(self) -> &'static str {
        match self {
            Preset::Default => "default",
            Preset::Plain => "plain",
            Preset::Sat => "sat",
            Preset::Unsat => "unsat",
        }
    }

    pub fn default_option(self, name: &str) -> i32 {
        match self {
            Preset::Plain => match name {
                "elim" | "vivify" | "probe" | "subsume" | "congruence" | "sweep" => 0,
                _ => 1,
            },
            Preset::Unsat => match name {
                "stabilize" | "walk" => 0,
                _ => 1,
            },
            Preset::Default | Preset::Sat => 1,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Breaks {
    pub distinct: bool,
    pub colex: bool,
    pub reapply: bool,
    pub amo: bool,
    pub op_order: bool,
    pub symmetry: bool,
    pub pair_cuts: bool,
}

impl Breaks {
    pub fn get(self, name: &str) -> Option<bool> {
        match name {
            "distinct" => Some(self.distinct),
            "colex" => Some(self.colex),
            "reapply" => Some(self.reapply),
            "amo" => Some(self.amo),
            "opOrder" => Some(self.op_order),
            "symmetry" => Some(self.symmetry),
            "pairCuts" => Some(self.pair_cuts),
            _ => None,
        }
    }

    pub fn set(&mut self, name: &str, on: bool) {
        match name {
            "distinct" => self.distinct = on,
            "colex" => self.colex = on,
            "reapply" => self.reapply = on,
            "amo" => self.amo = on,
            "opOrder" => self.op_order = on,
            "symmetry" => self.symmetry = on,
            "pairCuts" => self.pair_cuts = on,
            _ => {}
        }
    }
}

pub const BREAKS: [(&str, &str); 7] = [
    ("distinct", "no two gates compute the same thing"),
    (
        "colex",
        "independent neighboring gates come in a fixed order",
    ),
    ("reapply", "no gate re-reads an input of a gate it reads"),
    ("amo", "each gate selects at most one pair of inputs"),
    (
        "opOrder",
        "adjacent gates on the same inputs follow a fixed op order",
    ),
    (
        "symmetry",
        "interchangeable inputs enter the circuit in order",
    ),
    (
        "pairCuts",
        "two-input restriction bounds cap combined gate fanout",
    ),
];

pub const OPTIONS: [(&str, &str); 9] = [
    ("elim", "variable elimination"),
    ("vivify", "clause vivification"),
    ("probe", "failed-literal probing"),
    ("subsume", "subsumption"),
    ("congruence", "congruence closure"),
    ("sweep", "SAT sweeping"),
    ("walk", "local search"),
    ("chrono", "chronological backtracking"),
    ("stabilize", "stabilizing phases"),
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Method {
    pub version: u64,
    pub parent: Option<u64>,
    pub change: Option<String>,
    pub preset: Preset,
    pub breaks: Breaks,
    pub options: BTreeMap<String, i32>,
}

impl Default for Method {
    fn default() -> Self {
        Method {
            version: 1,
            parent: None,
            change: None,
            preset: Preset::Default,
            breaks: Breaks::default(),
            options: BTreeMap::new(),
        }
    }
}

impl Method {
    pub fn option(&self, name: &str) -> i32 {
        self.options
            .get(name)
            .copied()
            .unwrap_or_else(|| self.preset.default_option(name))
    }

    pub fn sanitize(&mut self) {
        if let Some(value) = self.options.remove("stable") {
            self.options.entry("stabilize".into()).or_insert(value);
        }

        let preset = self.preset;
        self.options.retain(|name, value| {
            !OPTIONS.iter().any(|(known, _)| known == name)
                || *value != preset.default_option(name)
        });
    }

    pub fn recipe_key(&self) -> String {
        let mut canonical = self.clone();

        canonical.sanitize();

        let mut parts = vec![
            format!("preset:{}", canonical.preset.name()),
            format!(
                "breaks:{}{}{}{}{}{}{}",
                u8::from(canonical.breaks.distinct),
                u8::from(canonical.breaks.colex),
                u8::from(canonical.breaks.reapply),
                u8::from(canonical.breaks.amo),
                u8::from(canonical.breaks.op_order),
                u8::from(canonical.breaks.symmetry),
                u8::from(canonical.breaks.pair_cuts),
            ),
        ];

        for (name, value) in &canonical.options {
            parts.push(format!("{name}={value}"));
        }

        parts.join("|")
    }

    pub fn same_recipe(&self, other: &Method) -> bool {
        self.recipe_key() == other.recipe_key()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Move {
    Break { name: String, on: bool },
    Preset { preset: Preset },
    Option { name: String, value: i32 },
    Combo { steps: Vec<Move> },
}

impl Move {
    pub fn id(&self) -> String {
        match self {
            Move::Break { name, on } => format!("break:{name}={}", if *on { "on" } else { "off" }),
            Move::Preset { preset } => format!("preset:{}", preset.name()),
            Move::Option { name, value } => format!("option:{name}={value}"),
            Move::Combo { steps } => steps
                .iter()
                .map(Move::id)
                .collect::<Vec<_>>()
                .join("+"),
        }
    }

    pub fn atomic_ids(&self) -> Vec<String> {
        match self {
            Move::Combo { steps } => steps.iter().flat_map(Move::atomic_ids).collect(),
            single => vec![single.id()],
        }
    }

    pub fn label(&self) -> String {
        match self {
            Move::Break { name, on } => {
                let rule = BREAKS
                    .iter()
                    .find(|(id, _)| id == name)
                    .map_or(name.as_str(), |(_, rule)| rule);

                if *on {
                    format!("Require that {rule}")
                } else {
                    format!("Stop requiring that {rule}")
                }
            }
            Move::Preset { preset } => format!("Switch the solver to its {} preset", preset.name()),
            Move::Option { name, value } => {
                let what = OPTIONS
                    .iter()
                    .find(|(id, _)| id == name)
                    .map_or(name.as_str(), |(_, what)| what);

                if *value == 0 {
                    format!("Turn off {what}")
                } else {
                    format!("Turn on {what}")
                }
            }
            Move::Combo { steps } => steps
                .iter()
                .map(Move::label)
                .collect::<Vec<_>>()
                .join("; "),
        }
    }

    fn apply_into(&self, next: &mut Method) {
        match self {
            Move::Break { name, on } => next.breaks.set(name, *on),
            Move::Preset { preset } => {
                next.preset = *preset;
                next.options
                    .retain(|name, value| *value != preset.default_option(name));
            }
            Move::Option { name, value } => {
                if *value == next.preset.default_option(name) {
                    next.options.remove(name);
                } else {
                    next.options.insert(name.clone(), *value);
                }
            }
            Move::Combo { steps } => {
                for step in steps {
                    step.apply_into(next);
                }
            }
        }
    }

    pub fn apply(&self, method: &Method) -> Method {
        let mut next = method.clone();

        next.sanitize();
        self.apply_into(&mut next);
        next.parent = Some(method.version);
        next.change = Some(self.id());
        next
    }
}

pub fn moves(method: &Method) -> Vec<Move> {
    let mut all = Vec::new();

    for (name, _) in BREAKS {
        let on = method.breaks.get(name).unwrap_or(false);

        all.push(Move::Break {
            name: name.to_string(),
            on: !on,
        });
    }

    for preset in Preset::ALL {
        if preset != method.preset {
            all.push(Move::Preset { preset });
        }
    }

    for (name, _) in OPTIONS {
        all.push(Move::Option {
            name: name.to_string(),
            value: 1 - method.option(name),
        });
    }

    all
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_move_changes_exactly_one_thing() {
        for preset in Preset::ALL {
            let method = Method {
                preset,
                ..Method::default()
            };

            for change in moves(&method) {
                let next = change.apply(&method);

                assert!(
                    !next.same_recipe(&method),
                    "preset={preset:?} move={}",
                    change.id()
                );
                assert_eq!(next.parent, Some(1));
            }
        }
    }

    #[test]
    fn turning_an_option_back_on_restores_the_default() {
        let method = Method::default();
        let off = Move::Option {
            name: "elim".into(),
            value: 0,
        }
        .apply(&method);

        assert_eq!(off.option("elim"), 0);

        let back = Move::Option {
            name: "elim".into(),
            value: 1,
        }
        .apply(&off);

        assert!(back.same_recipe(&method));
    }

    #[test]
    fn plain_and_unsat_presets_track_real_option_defaults() {
        let plain = Method {
            preset: Preset::Plain,
            ..Method::default()
        };

        assert_eq!(plain.option("elim"), 0);
        assert_eq!(plain.option("walk"), 1);

        let elim_on = Move::Option {
            name: "elim".into(),
            value: 1,
        }
        .apply(&plain);

        assert_eq!(elim_on.options.get("elim"), Some(&1));
        assert_eq!(elim_on.option("elim"), 1);

        let unsat = Method {
            preset: Preset::Unsat,
            ..Method::default()
        };

        assert_eq!(unsat.option("stabilize"), 0);
        assert_eq!(unsat.option("walk"), 0);
        assert_eq!(unsat.option("elim"), 1);

        let walk_on = Move::Option {
            name: "walk".into(),
            value: 1,
        }
        .apply(&unsat);

        assert_eq!(walk_on.options.get("walk"), Some(&1));
    }

    #[test]
    fn sanitize_migrates_legacy_stable_option() {
        let mut method = Method::default();

        method.options.insert("stable".into(), 0);
        method.sanitize();

        assert!(!method.options.contains_key("stable"));
        assert_eq!(method.options.get("stabilize"), Some(&0));
    }

    #[test]
    fn moves_are_named_plainly() {
        let change = Move::Break {
            name: "colex".into(),
            on: true,
        };

        assert_eq!(change.id(), "break:colex=on");
        assert_eq!(
            change.label(),
            "Require that independent neighboring gates come in a fixed order"
        );

        let combo = Move::Combo {
            steps: vec![
                Move::Break {
                    name: "amo".into(),
                    on: true,
                },
                Move::Break {
                    name: "symmetry".into(),
                    on: true,
                },
            ],
        };

        assert_eq!(combo.id(), "break:amo=on+break:symmetry=on");
        assert_eq!(
            combo.atomic_ids(),
            vec!["break:amo=on", "break:symmetry=on"]
        );
    }

    #[test]
    fn every_preset_and_option_is_accepted_by_cadical() {
        for preset in Preset::ALL {
            let base = Method {
                preset,
                ..Method::default()
            };

            for change in moves(&base) {
                let candidate = change.apply(&base);
                let mut solver = rustsat_cadical::CaDiCaL::default();
                let cfg = match candidate.preset {
                    Preset::Default => rustsat_cadical::Config::Default,
                    Preset::Plain => rustsat_cadical::Config::Plain,
                    Preset::Sat => rustsat_cadical::Config::Sat,
                    Preset::Unsat => rustsat_cadical::Config::Unsat,
                };

                solver.set_configuration(cfg).unwrap();

                for (name, &value) in &candidate.options {
                    solver
                        .set_option(name, value)
                        .unwrap_or_else(|e| panic!("rejected {name}={value} on {preset:?}: {e}"));
                }
            }
        }
    }
}
