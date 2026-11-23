use serde::{Deserialize, Serialize};
use std::fmt;

pub const MAX_INPUTS: u8 = 6;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Table {
    pub inputs: u8,
    pub bits: u64,
}

impl Table {
    pub fn new(inputs: u8, bits: u64) -> Self {
        assert!(inputs <= MAX_INPUTS, "at most {MAX_INPUTS} inputs");

        Table {
            inputs,
            bits: bits & mask(inputs),
        }
    }

    pub fn from_fn(inputs: u8, f: impl Fn(u32) -> bool) -> Self {
        let bits = (0..1u32 << inputs)
            .filter(|&row| f(row))
            .fold(0u64, |bits, row| bits | 1 << row);

        Table::new(inputs, bits)
    }

    pub fn input(inputs: u8, index: u8) -> Self {
        Table::from_fn(inputs, |row| row >> index & 1 == 1)
    }

    pub fn rows(&self) -> u32 {
        1 << self.inputs
    }

    pub fn get(&self, row: u32) -> bool {
        self.bits >> row & 1 == 1
    }

    pub fn not(&self) -> Self {
        Table::new(self.inputs, !self.bits)
    }

    pub fn ones(&self) -> u32 {
        self.bits.count_ones()
    }

    pub fn free(&self) -> Option<Free> {
        if self.bits == 0 {
            return Some(Free::Constant(false));
        }

        if self.bits == mask(self.inputs) {
            return Some(Free::Constant(true));
        }

        (0..self.inputs).find_map(|index| {
            let input = Table::input(self.inputs, index);

            if *self == input {
                Some(Free::Input {
                    index,
                    negated: false,
                })
            } else if *self == input.not() {
                Some(Free::Input {
                    index,
                    negated: true,
                })
            } else {
                None
            }
        })
    }

    pub fn depends_on(&self, index: u8) -> bool {
        (0..self.rows())
            .filter(|row| row >> index & 1 == 0)
            .any(|row| self.get(row) != self.get(row | 1 << index))
    }

    pub fn support(&self) -> u8 {
        (0..self.inputs).filter(|&i| self.depends_on(i)).count() as u8
    }

    pub fn essential(&self) -> Self {
        let deps: Vec<u8> = (0..self.inputs)
            .filter(|&index| self.depends_on(index))
            .collect();

        if deps.len() == self.inputs as usize {
            return *self;
        }

        Table::from_fn(deps.len() as u8, |row| {
            let full = deps.iter().enumerate().fold(0u32, |full, (to, &from)| {
                full | ((row >> to & 1) << from)
            });

            self.get(full)
        })
    }

    pub fn swap(&self, i: u8, j: u8) -> Self {
        assert!(i < self.inputs && j < self.inputs, "input out of range");

        if i == j {
            return *self;
        }

        Table::from_fn(self.inputs, |row| {
            let bi = row >> i & 1;
            let bj = row >> j & 1;
            let swapped = if bi == bj {
                row
            } else {
                row ^ (1 << i) ^ (1 << j)
            };

            self.get(swapped)
        })
    }

    pub fn symmetric_pairs(&self) -> Vec<(usize, usize)> {
        let mut pairs = Vec::new();

        for i in 0..self.inputs {
            if !self.depends_on(i) {
                continue;
            }

            for j in i + 1..self.inputs {
                if self.depends_on(j) && self.swap(i, j) == *self {
                    pairs.push((i as usize, j as usize));
                }
            }
        }

        pairs
    }

    pub fn transform(&self, order: &[u8], flips: u32, negate: bool) -> Self {
        Table::from_fn(self.inputs, |row| {
            let source = order.iter().enumerate().fold(0u32, |source, (to, &from)| {
                source | ((row >> to & 1) ^ (flips >> to & 1)) << from
            });

            self.get(source) ^ negate
        })
    }

    pub fn npn(&self) -> Self {
        let orders = permutations(self.inputs);
        let mut best = *self;

        for order in &orders {
            for flips in 0..1u32 << self.inputs {
                for negate in [false, true] {
                    let candidate = self.transform(order, flips, negate);

                    if candidate.bits < best.bits {
                        best = candidate;
                    }
                }
            }
        }

        best
    }

    pub fn restrict(&self, index: u8, value: bool) -> Self {
        assert!(index < self.inputs, "input {index} out of range");

        let low = (1u32 << index) - 1;

        Table::from_fn(self.inputs - 1, |row| {
            let full = (row & low) | (u32::from(value) << index) | ((row & !low) << 1);

            self.get(full)
        })
    }

    pub fn hex(&self) -> String {
        let width = (self.rows() as usize).div_ceil(4);

        format!("{:0width$x}", self.bits, width = width)
    }
}

impl fmt::Display for Table {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.inputs, self.hex())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Free {
    Constant(bool),
    Input { index: u8, negated: bool },
}

pub fn mask(inputs: u8) -> u64 {
    if inputs >= 6 {
        u64::MAX
    } else {
        (1u64 << (1u32 << inputs)) - 1
    }
}

pub fn permutations(n: u8) -> Vec<Vec<u8>> {
    let mut all = vec![Vec::new()];

    for next in 0..n {
        all = all
            .into_iter()
            .flat_map(|order: Vec<u8>| {
                (0..=order.len()).map(move |at| {
                    let mut grown = order.clone();

                    grown.insert(at, next);
                    grown
                })
            })
            .collect();
    }

    all
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inputs_read_their_own_bit() {
        let x1 = Table::input(3, 1);

        assert_eq!(x1.bits, 0b1100_1100);
        assert_eq!(
            x1.free(),
            Some(Free::Input {
                index: 1,
                negated: false
            })
        );
        assert_eq!(
            x1.not().free(),
            Some(Free::Input {
                index: 1,
                negated: true
            })
        );
    }

    #[test]
    fn constants_and_masks() {
        assert_eq!(Table::new(2, u64::MAX).bits, 0xf);
        assert_eq!(Table::new(2, 0xf).free(), Some(Free::Constant(true)));
        assert_eq!(Table::new(6, u64::MAX).ones(), 64);
    }

    #[test]
    fn permutations_count_factorials() {
        assert_eq!(permutations(4).len(), 24);
        assert_eq!(permutations(5).len(), 120);
    }

    #[test]
    fn npn_merges_and_with_its_relatives() {
        let and = Table::from_fn(2, |row| row == 3);
        let nor = Table::from_fn(2, |row| row == 0);
        let or = Table::from_fn(2, |row| row != 0);
        let xor = Table::from_fn(2, |row| row == 1 || row == 2);

        assert_eq!(and.npn(), nor.npn());
        assert_eq!(and.npn(), or.npn());
        assert_ne!(and.npn(), xor.npn());
    }

    #[test]
    fn restriction_fixes_one_input() {
        let majority = Table::from_fn(3, |row| row.count_ones() >= 2);

        assert_eq!(
            majority.restrict(1, false),
            Table::from_fn(2, |row| row == 3)
        );
        assert_eq!(
            majority.restrict(1, true),
            Table::from_fn(2, |row| row != 0)
        );

        let mod3 = Table::from_fn(5, |row| row.count_ones() % 3 == 0);

        for index in 0..5 {
            assert_eq!(
                mod3.restrict(index, true),
                Table::from_fn(4, |row| (row.count_ones() + 1) % 3 == 0)
            );
        }
    }

    #[test]
    fn support_ignores_dummy_inputs() {
        let x0_and_x2 = Table::from_fn(3, |row| row & 0b101 == 0b101);

        assert_eq!(x0_and_x2.support(), 2);
        assert!(!x0_and_x2.depends_on(1));
        assert_eq!(x0_and_x2.essential(), Table::from_fn(2, |row| row == 3));

        let product6 = Table::from_fn(6, |row| ((row & 7) * (row >> 3)) >> 2 & 1 == 1);
        assert_eq!(product6.restrict(0, false).essential().inputs, 4);
        assert_eq!(product6.restrict(3, false).essential().inputs, 4);
    }

    #[test]
    fn symmetric_pairs_finds_transpositions() {
        let mod3 = Table::from_fn(4, |row| row.count_ones() % 3 == 0);
        assert_eq!(mod3.symmetric_pairs().len(), 6);

        let x0_and_x1 = Table::from_fn(3, |row| row & 0b011 == 0b011);
        assert_eq!(x0_and_x1.symmetric_pairs(), vec![(0, 1)]);
    }
}
