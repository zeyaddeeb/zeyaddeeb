use crate::{
    method::Method,
    synth::{exact_with, Budget, Exact},
    table::{permutations, Table},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Mutex,
    },
};

pub const KNUTH_FOUR: [u64; 8] = [10, 60, 456, 2474, 10624, 24184, 25008, 2720];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Class {
    pub representative: Table,
    pub members: u64,
}

pub fn classes(inputs: u8) -> Vec<Class> {
    assert!(
        inputs <= 4,
        "the census enumerates every function, so at most four inputs"
    );

    let orders = permutations(inputs);
    let count = 1u64 << (1u32 << inputs);
    let mut seen = vec![false; count as usize];
    let mut found = Vec::new();

    for bits in 0..count {
        if seen[bits as usize] {
            continue;
        }

        let table = Table::new(inputs, bits);
        let mut orbit = BTreeSet::new();

        for order in &orders {
            for flips in 0..1u32 << inputs {
                for negate in [false, true] {
                    orbit.insert(table.transform(order, flips, negate).bits);
                }
            }
        }

        for &member in &orbit {
            seen[member as usize] = true;
        }

        found.push(Class {
            representative: Table::new(inputs, *orbit.iter().next().unwrap_or(&bits)),
            members: orbit.len() as u64,
        });
    }

    found
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Census {
    pub inputs: u8,
    pub classes: usize,
    pub functions: u64,
    pub by_size: Vec<u64>,
    pub unresolved: usize,
    pub lemmas: u64,
    pub millis: u64,
    pub hardest: Vec<Exact>,
    #[serde(default)]
    pub sizes: Vec<(Table, usize)>,
}

pub fn census(inputs: u8, budget: &Budget, workers: usize) -> anyhow::Result<Census> {
    census_by(inputs, budget, workers, &Method::default())
}

pub fn census_by(
    inputs: u8,
    budget: &Budget,
    workers: usize,
    method: &Method,
) -> anyhow::Result<Census> {
    let began = std::time::Instant::now();
    let all = classes(inputs);
    let next = AtomicUsize::new(0);
    let failed = AtomicBool::new(false);
    let results: Mutex<Vec<(Class, Exact)>> = Mutex::new(Vec::with_capacity(all.len()));
    let failure: Mutex<Option<anyhow::Error>> = Mutex::new(None);
    let ceiling = 1usize << inputs;

    std::thread::scope(|scope| {
        for _ in 0..workers.max(1) {
            scope.spawn(|| loop {
                if failed.load(Ordering::Relaxed) || budget.cancel.load(Ordering::Relaxed) {
                    break;
                }

                let at = next.fetch_add(1, Ordering::Relaxed);

                let Some(class) = all.get(at) else {
                    break;
                };

                match exact_with(class.representative, budget, ceiling, &[], method) {
                    Ok(found) => results
                        .lock()
                        .expect("census lock")
                        .push((class.clone(), found)),
                    Err(error) => {
                        failure.lock().expect("census lock").get_or_insert(error);
                        failed.store(true, Ordering::Relaxed);
                        break;
                    }
                }
            });
        }
    });

    if let Some(error) = failure.into_inner().expect("census lock") {
        return Err(error);
    }

    let results = results.into_inner().expect("census lock");
    let mut by_size = vec![0u64; ceiling + 1];
    let mut unresolved = 0;
    let mut lemmas = 0;
    let mut largest = 0;

    for (class, found) in &results {
        lemmas += found
            .attempts
            .iter()
            .filter_map(|attempt| match &attempt.outcome {
                crate::synth::Outcome::Impossible { proof } => Some(proof.lemmas),
                _ => None,
            })
            .sum::<u64>();

        match found.size {
            Some(size) => {
                by_size[size] += class.members;
                largest = largest.max(size);
            }
            None => unresolved += 1,
        }
    }

    by_size.truncate(largest + 1);

    let sizes = results
        .iter()
        .filter_map(|(class, found)| found.size.map(|size| (class.representative, size)))
        .collect();

    let hardest = results
        .iter()
        .filter(|(_, found)| found.size == Some(largest))
        .map(|(_, found)| found.clone())
        .collect();

    Ok(Census {
        inputs,
        classes: results.len(),
        functions: results.iter().map(|(class, _)| class.members).sum(),
        by_size,
        unresolved,
        lemmas,
        millis: began.elapsed().as_millis() as u64,
        hardest,
        sizes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classes_partition_every_function() {
        for (inputs, expected) in [(2u8, 4usize), (3, 14), (4, 222)] {
            let found = classes(inputs);

            assert_eq!(found.len(), expected, "{inputs} inputs");
            assert_eq!(
                found.iter().map(|class| class.members).sum::<u64>(),
                1u64 << (1u32 << inputs)
            );
        }
    }

    #[test]
    fn knuths_table_counts_every_four_input_function() {
        assert_eq!(KNUTH_FOUR.iter().sum::<u64>(), 65536);
    }

    #[test]
    fn a_census_error_does_not_cancel_the_parent_budget() {
        let budget = Budget::new(
            std::time::Duration::from_secs(30),
            std::env::temp_dir().join(format!("gates-census-err-{}", std::process::id())),
        );
        let mut bad = Method::default();

        bad.options.insert("nonexistent_option".into(), 0);

        let err = census_by(2, &budget, 2, &bad);

        assert!(err.is_err());
        assert!(!budget.cancel.load(Ordering::Relaxed));
    }
}
