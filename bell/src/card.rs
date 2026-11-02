use serde::{Deserialize, Serialize};

pub const DIALS: u8 = 6;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Card(u8);

impl Card {
    pub fn new(id: u8) -> Option<Self> {
        (id < 8).then_some(Self(id))
    }

    pub fn from_base(base: [bool; 3]) -> Self {
        Self(
            base.iter()
                .enumerate()
                .map(|(i, &b)| u8::from(b) << i)
                .sum(),
        )
    }

    pub fn id(self) -> u8 {
        self.0
    }

    pub fn all() -> impl Iterator<Item = Card> {
        (0..8).map(Card)
    }

    pub fn dot(self, dial: u8) -> bool {
        let dial = dial % DIALS;
        let black = (self.0 >> (dial % 3)) & 1 == 1;

        if dial < 3 {
            black
        } else {
            !black
        }
    }

    pub fn striped(self) -> bool {
        self.dot(0) != self.dot(1) && self.dot(1) != self.dot(2)
    }

    pub fn agreement(self, step: u8) -> f64 {
        let same = (0..DIALS)
            .filter(|&dial| self.dot(dial) == self.dot(dial + step))
            .count();

        same as f64 / f64::from(DIALS)
    }
}

pub fn base(dial: u8, black: bool) -> (usize, bool) {
    let dial = dial % DIALS;

    (usize::from(dial % 3), if dial < 3 { black } else { !black })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dots_ninety_degrees_apart_are_opposite() {
        for card in Card::all() {
            for dial in 0..DIALS {
                assert_ne!(card.dot(dial), card.dot(dial + 3));
            }
        }
    }

    #[test]
    fn half_cards_reach_two_thirds_and_stripes_reach_nothing() {
        let halves: Vec<_> = Card::all().filter(|c| !c.striped()).collect();
        let stripes: Vec<_> = Card::all().filter(|c| c.striped()).collect();

        assert_eq!(halves.len(), 6);
        assert_eq!(stripes.len(), 2);

        for card in halves {
            assert!((card.agreement(1) - 2.0 / 3.0).abs() < 1e-12);
            assert!((card.agreement(2) - 1.0 / 3.0).abs() < 1e-12);
        }

        for card in stripes {
            assert_eq!(card.agreement(1), 0.0);
            assert_eq!(card.agreement(2), 1.0);
        }
    }

    #[test]
    fn no_card_beats_two_thirds_at_thirty_degrees() {
        let best = Card::all().map(|c| c.agreement(1)).fold(0.0, f64::max);

        assert!((best - 2.0 / 3.0).abs() < 1e-12);
    }

    #[test]
    fn base_pins_round_trip() {
        for card in Card::all() {
            for dial in 0..DIALS {
                let (i, black) = base(dial, card.dot(dial));
                let mut dots = [card.dot(0), card.dot(1), card.dot(2)];

                dots[i] = black;
                assert_eq!(Card::from_base(dots), card);
            }
        }
    }
}
