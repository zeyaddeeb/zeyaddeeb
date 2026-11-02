use crate::card::Card;
use rand::{Rng, RngExt};
use serde::{Deserialize, Serialize};

pub const MOST: i8 = 9;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Deck(pub [i8; 8]);

impl Deck {
    pub fn valid(&self) -> bool {
        self.0.iter().all(|c| (-MOST..=MOST).contains(c)) && self.total() > 0
    }

    pub fn total(&self) -> i32 {
        self.0.iter().map(|&c| i32::from(c)).sum()
    }

    pub fn mass(&self) -> i32 {
        self.0.iter().map(|&c| i32::from(c).abs()).sum()
    }

    pub fn draw(&self, rng: &mut impl Rng) -> (Card, i8) {
        let mut at = rng.random_range(0..self.mass());

        for (id, &count) in self.0.iter().enumerate() {
            let weight = i32::from(count).abs();

            if at < weight {
                return (
                    Card::new(id as u8).unwrap_or(Card::from_base([false; 3])),
                    count.signum(),
                );
            }

            at -= weight;
        }

        (Card::from_base([false; 3]), 1)
    }

    pub fn agreement(&self, step: u8) -> f64 {
        let total = f64::from(self.total());

        Card::all()
            .map(|card| f64::from(self.0[usize::from(card.id())]) * card.agreement(step))
            .sum::<f64>()
            / total
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nature;

    fn nature_deck() -> Deck {
        let mut counts = [0i8; 8];

        for card in Card::all() {
            counts[usize::from(card.id())] = if card.striped() { -1 } else { 3 };
        }

        Deck(counts)
    }

    #[test]
    fn minus_one_eighth_reproduces_nature_at_every_angle() {
        let deck = nature_deck();

        assert!(deck.valid());
        assert_eq!(deck.total(), 16);

        for step in 0..6 {
            assert!((deck.agreement(step) - nature::agree(step)).abs() < 1e-12);
        }
    }

    #[test]
    fn rejects_empty_and_negative_totals() {
        assert!(!Deck([0; 8]).valid());
        assert!(!Deck([-1, 0, 0, 0, 0, 0, 0, 0]).valid());
        assert!(!Deck([10, 0, 0, 0, 0, 0, 0, 0]).valid());
    }

    #[test]
    fn draws_follow_the_counts_and_carry_their_sign() {
        let deck = nature_deck();
        let mut rng = rand::rng();
        let mut negative = 0;
        let n = 40_000;

        for _ in 0..n {
            let (card, sign) = deck.draw(&mut rng);

            assert_eq!(sign < 0, card.striped());
            negative += i32::from(sign < 0);
        }

        let share = f64::from(negative) / f64::from(n);

        assert!((share - 2.0 / 20.0).abs() < 0.01, "{share}");
    }
}
