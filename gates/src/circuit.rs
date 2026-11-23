use crate::table::{mask, Table};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Op {
    And,
    AndNot,
    NotAnd,
    Xor,
    Or,
}

impl Op {
    pub const ALL: [Op; 5] = [Op::And, Op::AndNot, Op::NotAnd, Op::Xor, Op::Or];

    pub fn from_bits(on01: bool, on10: bool, on11: bool) -> Option<Op> {
        match (on01, on10, on11) {
            (false, false, true) => Some(Op::And),
            (false, true, false) => Some(Op::AndNot),
            (true, false, false) => Some(Op::NotAnd),
            (true, true, false) => Some(Op::Xor),
            (true, true, true) => Some(Op::Or),
            _ => None,
        }
    }

    pub fn apply(self, a: u64, b: u64) -> u64 {
        match self {
            Op::And => a & b,
            Op::AndNot => a & !b,
            Op::NotAnd => !a & b,
            Op::Xor => a ^ b,
            Op::Or => a | b,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gate {
    pub a: usize,
    pub b: usize,
    pub op: Op,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Output {
    Constant { value: bool },
    Node { node: usize, negated: bool },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Circuit {
    pub inputs: u8,
    pub gates: Vec<Gate>,
    pub output: Output,
}

impl Circuit {
    pub fn size(&self) -> usize {
        self.gates.len()
    }

    pub fn wires(&self) -> Vec<u64> {
        let inputs = self.inputs;
        let mut wires: Vec<u64> = (0..inputs).map(|i| Table::input(inputs, i).bits).collect();

        for gate in &self.gates {
            let value = gate.op.apply(wires[gate.a], wires[gate.b]) & mask(inputs);

            wires.push(value);
        }

        wires
    }

    pub fn evaluate(&self) -> Table {
        let bits = match self.output {
            Output::Constant { value } => {
                if value {
                    u64::MAX
                } else {
                    0
                }
            }
            Output::Node { node, negated } => {
                let wire = self.wires()[node];

                if negated {
                    !wire
                } else {
                    wire
                }
            }
        };

        Table::new(self.inputs, bits)
    }

    pub fn well_formed(&self) -> bool {
        let inputs = self.inputs as usize;

        self.gates
            .iter()
            .enumerate()
            .all(|(at, gate)| gate.a < gate.b && gate.b < inputs + at)
            && match self.output {
                Output::Constant { .. } => true,
                Output::Node { node, .. } => node < inputs + self.gates.len(),
            }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_adder_sums_three_bits() {
        let sum = Circuit {
            inputs: 3,
            gates: vec![
                Gate {
                    a: 0,
                    b: 1,
                    op: Op::Xor,
                },
                Gate {
                    a: 2,
                    b: 3,
                    op: Op::Xor,
                },
            ],
            output: Output::Node {
                node: 4,
                negated: false,
            },
        };

        assert!(sum.well_formed());
        assert_eq!(
            sum.evaluate(),
            Table::from_fn(3, |row| row.count_ones() % 2 == 1)
        );
    }

    #[test]
    fn every_op_is_normal() {
        for op in Op::ALL {
            assert_eq!(op.apply(0, 0), 0);
        }
    }
}
