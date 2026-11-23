use gates::{
    census::{census, census_by, KNUTH_FOUR},
    method::{Breaks, Method},
    synth::Budget,
};
use std::time::Duration;

fn budget() -> Budget {
    Budget::new(
        Duration::from_secs(600),
        std::env::temp_dir().join(format!("gates-breaks-{}", std::process::id())),
    )
}

fn with(breaks: Breaks) -> Method {
    Method {
        breaks,
        ..Method::default()
    }
}

#[test]
fn every_combination_of_breaks_keeps_the_three_input_census() {
    let budget = budget();
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get());
    let plain = census(3, &budget, workers).unwrap();

    for bits in 1..64u8 {
        let method = with(Breaks {
            distinct: bits & 1 != 0,
            colex: bits & 2 != 0,
            reapply: bits & 4 != 0,
            amo: bits & 8 != 0,
            op_order: bits & 16 != 0,
            symmetry: bits & 32 != 0,
            pair_cuts: false,
        });
        let found = census_by(3, &budget, workers, &method).unwrap();

        assert_eq!(found.by_size, plain.by_size, "{:?}", method.breaks);
    }
}

#[test]
fn all_breaks_together_reproduce_knuths_table() {
    let budget = budget();
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get());
    let found = census_by(
        4,
        &budget,
        workers,
        &with(Breaks {
            distinct: true,
            colex: true,
            reapply: true,
            amo: true,
            op_order: true,
            symmetry: true,
            pair_cuts: true,
        }),
    )
    .unwrap();

    assert_eq!(found.unresolved, 0);
    assert_eq!(found.by_size, KNUTH_FOUR);
}
