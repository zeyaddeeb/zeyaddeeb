use crate::{card::Card, clock::Clock};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MOST_TRIALS: usize = 4_000;
const TARGET: u8 = 8;
const LISTEN: u8 = 255;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    Card(Card),
    Target { dial: u8, black: bool },
    Listen,
}

impl Step {
    pub fn code(self) -> u8 {
        match self {
            Step::Card(card) => card.id(),
            Step::Target { dial, black } => TARGET + (dial % 6) * 2 + u8::from(black),
            Step::Listen => LISTEN,
        }
    }

    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0..TARGET => Card::new(code).map(Step::Card),
            TARGET..20 => Some(Step::Target {
                dial: (code - TARGET) / 2,
                black: (code - TARGET) % 2 == 1,
            }),
            LISTEN => Some(Step::Listen),
            _ => None,
        }
    }

    pub fn answer(self, dial: u8) -> Option<bool> {
        match self {
            Step::Card(card) => Some(card.dot(dial)),
            Step::Target {
                dial: target,
                black,
            } if dial % 6 == target => Some(black),
            Step::Target {
                dial: target,
                black,
            } if dial % 6 == (target + 3) % 6 => Some(!black),
            Step::Target { .. } | Step::Listen => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Plan {
    pub run: Uuid,
    pub start_ns: i64,
    pub spacing_ns: i64,
    pub steps: Vec<u8>,
    pub dials: Option<Vec<u8>>,
    pub tell: Option<String>,
}

impl Plan {
    pub fn decode(&self) -> Option<Vec<Step>> {
        if self.steps.is_empty()
            || self.steps.len() > MOST_TRIALS
            || self.spacing_ns < 100_000
            || self
                .dials
                .as_ref()
                .is_some_and(|d| d.len() != self.steps.len() || d.iter().any(|&x| x >= 6))
        {
            return None;
        }

        self.steps
            .iter()
            .map(|&code| Step::from_code(code))
            .collect()
    }

    pub fn tick(&self, k: usize) -> i64 {
        self.start_ns + self.spacing_ns * k as i64
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Record {
    pub k: u32,
    pub dial: u8,
    pub answer: Option<bool>,
    pub dial_ns: i64,
    pub commit_ns: i64,
    pub heard_ns: Option<i64>,
}

impl Record {
    pub fn row(&self) -> [i64; 6] {
        [
            i64::from(self.k),
            i64::from(self.dial),
            answer_code(self.answer),
            self.dial_ns,
            self.commit_ns,
            self.heard_ns.unwrap_or(-1),
        ]
    }

    pub fn from_row(row: [i64; 6]) -> Option<Self> {
        Some(Self {
            k: u32::try_from(row[0]).ok()?,
            dial: u8::try_from(row[1]).ok().filter(|&d| d < 6)?,
            answer: match row[2] {
                0 => Some(false),
                1 => Some(true),
                2 => None,
                _ => return None,
            },
            dial_ns: row[3],
            commit_ns: row[4],
            heard_ns: (row[5] >= 0).then_some(row[5]),
        })
    }
}

pub fn answer_code(answer: Option<bool>) -> i64 {
    match answer {
        Some(false) => 0,
        Some(true) => 1,
        None => 2,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Line {
    Clock { clock: Clock },
    Records { rows: Vec<[i64; 6]> },
    End,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_step_survives_its_code() {
        let steps = Card::all()
            .map(Step::Card)
            .chain((0..6).flat_map(|dial| [false, true].map(|black| Step::Target { dial, black })))
            .chain([Step::Listen]);

        for step in steps {
            assert_eq!(Step::from_code(step.code()), Some(step));
        }

        assert_eq!(Step::from_code(20), None);
    }

    #[test]
    fn targets_answer_on_their_axis_only() {
        let step = Step::Target {
            dial: 1,
            black: true,
        };

        assert_eq!(step.answer(1), Some(true));
        assert_eq!(step.answer(4), Some(false));
        assert_eq!(step.answer(0), None);
        assert_eq!(step.answer(2), None);
    }

    #[test]
    fn records_survive_their_rows() {
        let record = Record {
            k: 7,
            dial: 5,
            answer: None,
            dial_ns: 10,
            commit_ns: 12,
            heard_ns: Some(11),
        };

        assert_eq!(Record::from_row(record.row()), Some(record));
    }
}
