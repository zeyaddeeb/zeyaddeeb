use crate::{
    card::{base, Card},
    deck::Deck,
    nature,
    plan::Step,
};
use rand::{Rng, RngExt};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Deal {
    Deck,
    Talk,
    Dark,
    Fixed,
}

pub struct Hands {
    pub west: Vec<Step>,
    pub east: Vec<Step>,
    pub dials: Option<[Vec<u8>; 2]>,
    pub signs: Vec<i8>,
}

pub fn deal(rng: &mut impl Rng, deal: Deal, deck: &Deck, n: usize) -> Hands {
    let mut hands = Hands {
        west: Vec::with_capacity(n),
        east: Vec::with_capacity(n),
        dials: (deal == Deal::Fixed).then(|| [Vec::with_capacity(n), Vec::with_capacity(n)]),
        signs: Vec::with_capacity(n),
    };

    for _ in 0..n {
        let (west, east, sign) = match deal {
            Deal::Deck => {
                let (card, sign) = deck.draw(rng);

                (Step::Card(card), Step::Card(card), sign)
            }
            Deal::Talk => (Step::Listen, Step::Card(any_card(rng)), 1),
            Deal::Dark => dark(rng),
            Deal::Fixed => {
                let (west, east, card) = fixed(rng);

                if let Some([w, e]) = hands.dials.as_mut() {
                    w.push(west);
                    e.push(east);
                }

                (Step::Card(card), Step::Card(card), 1)
            }
        };

        hands.west.push(west);
        hands.east.push(east);
        hands.signs.push(sign);
    }

    hands
}

fn any_card(rng: &mut impl Rng) -> Card {
    Card::from_base([
        rng.random_bool(0.5),
        rng.random_bool(0.5),
        rng.random_bool(0.5),
    ])
}

fn dark(rng: &mut impl Rng) -> (Step, Step, i8) {
    let target = rng.random_range(0..6u8);
    let black = rng.random_bool(0.5);
    let dots = [0u8, 1, 2].map(|dial| nature::follow(rng, nature::step(target, dial), black));

    (
        Step::Target {
            dial: target,
            black,
        },
        Step::Card(Card::from_base(dots)),
        1,
    )
}

fn fixed(rng: &mut impl Rng) -> (u8, u8, Card) {
    let west = rng.random_range(0..6u8);
    let east = rng.random_range(0..6u8);
    let (a, b) = nature::pair(rng, west, east);
    let mut dots = [
        rng.random_bool(0.5),
        rng.random_bool(0.5),
        rng.random_bool(0.5),
    ];

    for (dial, black) in [(west, a), (east, b)] {
        let (i, value) = base(dial, black);

        dots[i] = value;
    }

    (west, east, Card::from_base(dots))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tally(pairs: impl Iterator<Item = (u8, u8, Option<bool>, Option<bool>)>) -> [f64; 4] {
        let mut same = [0f64; 4];
        let mut seen = [0f64; 4];

        for (w, e, a, b) in pairs {
            let (Some(a), Some(b)) = (a, b) else { continue };
            let bucket = [0, 1, 2, 3, 2, 1][usize::from(nature::step(w, e))];

            seen[bucket] += 1.0;
            same[bucket] += f64::from(u8::from(a == b));
        }

        [0, 1, 2, 3].map(|i| same[i] / seen[i])
    }

    fn dial(rng: &mut impl Rng) -> u8 {
        rng.random_range(0..6)
    }

    fn close(measured: [f64; 4], tolerance: f64) {
        for (got, want) in measured.iter().zip([1.0, 0.75, 0.25, 0.0]) {
            assert!((got - want).abs() < tolerance, "{measured:?}");
        }
    }

    #[test]
    fn fixed_dials_fake_nature_with_ordinary_cards() {
        let mut rng = rand::rng();
        let hands = deal(&mut rng, Deal::Fixed, &Deck([1; 8]), 60_000);
        let [west, east] = hands.dials.expect("fixed deals carry dials");

        let pairs = (0..west.len()).map(|k| {
            (
                west[k],
                east[k],
                hands.west[k].answer(west[k]),
                hands.east[k].answer(east[k]),
            )
        });

        close(tally(pairs), 0.015);
    }

    #[test]
    fn dark_targets_fake_nature_when_silence_is_dropped() {
        let mut rng = rand::rng();
        let hands = deal(&mut rng, Deal::Dark, &Deck([1; 8]), 120_000);
        let dials: Vec<_> = (0..hands.west.len())
            .map(|_| (dial(&mut rng), dial(&mut rng)))
            .collect();
        let pairs = dials
            .iter()
            .enumerate()
            .map(|(k, &(w, e))| (w, e, hands.west[k].answer(w), hands.east[k].answer(e)));

        close(tally(pairs), 0.02);

        let answered = dials
            .iter()
            .enumerate()
            .filter(|(k, (w, _))| hands.west[*k].answer(*w).is_some())
            .count();

        assert!((answered as f64 / dials.len() as f64 - 1.0 / 3.0).abs() < 0.01);
    }

    #[test]
    fn deck_deals_the_same_card_to_both_sides() {
        let mut rng = rand::rng();
        let hands = deal(&mut rng, Deal::Deck, &Deck([3, 0, 0, 0, 0, 0, 0, 0]), 100);

        assert_eq!(hands.west, hands.east);
        assert!(hands.signs.iter().all(|&s| s == 1));
        assert!(hands.dials.is_none());
    }
}
