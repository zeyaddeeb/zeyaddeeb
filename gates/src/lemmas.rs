use crate::table::Table;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Census,
    Study,
    Auxiliary,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bound {
    pub lower: usize,
    pub exact: bool,
    pub source: Source,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Lemmas {
    known: BTreeMap<String, Bound>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Restriction {
    pub input: usize,
    pub value: bool,
    pub table: Table,
    pub lower: usize,
    pub exact: bool,
}

pub fn key(table: Table) -> String {
    table.essential().npn().to_string()
}

impl Lemmas {
    pub fn len(&self) -> usize {
        self.known.len()
    }

    pub fn is_empty(&self) -> bool {
        self.known.is_empty()
    }

    pub fn learn(&mut self, table: Table, lower: usize, exact: bool, source: Source) {
        let entry = self.known.entry(key(table)).or_insert(Bound {
            lower,
            exact,
            source,
        });

        if exact && !entry.exact {
            *entry = Bound {
                lower,
                exact,
                source,
            };
        } else if !entry.exact && lower > entry.lower {
            entry.lower = lower;
            entry.source = source;
        }
    }

    pub fn bound(&self, table: Table) -> Option<Bound> {
        if table.free().is_some() {
            return Some(Bound {
                lower: 0,
                exact: true,
                source: Source::Census,
            });
        }

        self.known.get(&key(table)).copied()
    }

    pub fn restrictions(&self, table: Table) -> Vec<Restriction> {
        (0..table.inputs)
            .filter(|&input| table.depends_on(input))
            .flat_map(|input| {
                [false, true].map(|value| {
                    let restricted = table.restrict(input, value);
                    let bound = self.bound(restricted);

                    Restriction {
                        input: input as usize,
                        value,
                        table: restricted,
                        lower: bound.map_or(0, |b| b.lower),
                        exact: bound.is_some_and(|b| b.exact),
                    }
                })
            })
            .collect()
    }

    pub fn restricted(&self, table: Table) -> Vec<usize> {
        let mut best = vec![0; table.inputs as usize];

        for restriction in self.restrictions(table) {
            best[restriction.input] = best[restriction.input].max(restriction.lower);
        }

        best
    }

    pub fn restricted_pairs(&self, table: Table) -> Vec<(usize, usize, usize)> {
        if table.inputs < 2 {
            return Vec::new();
        }

        let mut best = Vec::new();

        for i in 0..table.inputs {
            for j in i + 1..table.inputs {
                let mut lower = 0;

                for vi in [false, true] {
                    for vj in [false, true] {
                        let restricted = table.restrict(j, vj).restrict(i, vi);
                        let bound = self.bound(restricted).map_or(0, |b| b.lower);

                        lower = lower.max(bound);
                    }
                }

                if lower > 0 {
                    best.push((i as usize, j as usize, lower));
                }
            }
        }

        best
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bound_is_shared_across_relabelings() {
        let mut lemmas = Lemmas::default();
        let majority = Table::from_fn(3, |row| row.count_ones() >= 2);

        lemmas.learn(majority, 4, true, Source::Census);

        let flipped = majority.transform(&[2, 0, 1], 0b101, true);

        assert_eq!(lemmas.bound(flipped).map(|b| b.lower), Some(4));
    }

    #[test]
    fn exact_values_are_not_lowered_and_bounds_only_rise() {
        let mut lemmas = Lemmas::default();
        let parity = Table::from_fn(4, |row| row.count_ones() % 2 == 1);

        lemmas.learn(parity, 2, false, Source::Study);
        lemmas.learn(parity, 1, false, Source::Study);

        assert_eq!(lemmas.bound(parity).unwrap().lower, 2);

        lemmas.learn(parity, 3, true, Source::Study);
        lemmas.learn(parity, 1, false, Source::Study);

        assert_eq!(
            lemmas.bound(parity).unwrap(),
            Bound {
                lower: 3,
                exact: true,
                source: Source::Study
            }
        );
    }

    #[test]
    fn restrictions_take_the_stronger_side() {
        let mut lemmas = Lemmas::default();
        let mod3 = Table::from_fn(4, |row| row.count_ones() % 3 == 0);

        lemmas.learn(mod3.restrict(0, false), 3, true, Source::Census);
        lemmas.learn(mod3.restrict(0, true), 4, true, Source::Census);

        assert_eq!(lemmas.restricted(mod3), vec![4, 4, 4, 4]);
    }

    #[test]
    fn dummy_inputs_hit_smaller_cached_bounds() {
        let mut lemmas = Lemmas::default();
        let product6 = Table::from_fn(6, |row| ((row & 7) * (row >> 3)) >> 2 & 1 == 1);
        let reduced = product6.restrict(0, false);

        lemmas.learn(reduced.essential(), 3, true, Source::Census);

        assert_eq!(lemmas.bound(reduced).map(|b| b.lower), Some(3));
        assert!(lemmas.bound(reduced).unwrap().exact);
    }

    #[test]
    fn pair_restrictions_read_two_variable_bounds() {
        let mut lemmas = Lemmas::default();
        let mod3_4 = Table::from_fn(4, |row| row.count_ones() % 3 == 0);
        let mod3_6 = Table::from_fn(6, |row| row.count_ones() % 3 == 0);

        lemmas.learn(mod3_4, 7, true, Source::Census);

        let pairs = lemmas.restricted_pairs(mod3_6);

        assert_eq!(pairs.len(), 15);
        assert!(pairs.iter().all(|&(_, _, lower)| lower == 7));
    }
}
