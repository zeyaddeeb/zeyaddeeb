use crate::curriculum::Rng;
use serde::Serialize;

pub const CUPS: usize = 5;
pub const PAIRS: [(usize, usize); 10] = [
    (0, 1),
    (0, 2),
    (0, 3),
    (0, 4),
    (1, 2),
    (1, 3),
    (1, 4),
    (2, 3),
    (2, 4),
    (3, 4),
];
pub const VOCAB: usize = CUPS + PAIRS.len();
pub const MOST: usize = 60;
pub const IGNORE: u32 = u32::MAX;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Blurts,
    Notes,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Blurts => "blurts",
            Kind::Notes => "notes",
        }
    }

    pub fn length(self, swaps: usize) -> usize {
        match self {
            Kind::Blurts => 1 + swaps,
            Kind::Notes => 1 + 2 * swaps,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Shuffle {
    pub start: usize,
    pub swaps: Vec<usize>,
}

pub fn seeded(seed: u64) -> Rng {
    Rng::new(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ 0xd1b5_4a32_d192_ed03)
}

pub fn cup(c: usize) -> u32 {
    c as u32
}

pub fn swap(pair: usize) -> u32 {
    (CUPS + pair) as u32
}

pub fn pair_of(a: usize, b: usize) -> Option<usize> {
    let key = (a.min(b), a.max(b));

    PAIRS.iter().position(|&p| p == key)
}

pub fn after(ball: usize, pair: usize) -> usize {
    let (a, b) = PAIRS[pair];

    if ball == a {
        b
    } else if ball == b {
        a
    } else {
        ball
    }
}

impl Shuffle {
    pub fn random(rng: &mut Rng, swaps: usize) -> Self {
        let lean = 0.2 + 0.7 * rng.uniform();
        let start = rng.below(CUPS);
        let mut ball = start;
        let mut out = Vec::with_capacity(swaps);

        for _ in 0..swaps {
            let pair = if rng.uniform() < lean {
                let other = (ball + 1 + rng.below(CUPS - 1)) % CUPS;

                pair_of(ball, other).unwrap()
            } else {
                rng.below(PAIRS.len())
            };

            ball = after(ball, pair);
            out.push(pair);
        }

        Self { start, swaps: out }
    }

    pub fn uniform(rng: &mut Rng, swaps: usize) -> Self {
        Self {
            start: rng.below(CUPS),
            swaps: (0..swaps).map(|_| rng.below(PAIRS.len())).collect(),
        }
    }

    pub fn trail(&self) -> Vec<usize> {
        let mut ball = self.start;

        self.swaps
            .iter()
            .map(|&pair| {
                ball = after(ball, pair);
                ball
            })
            .collect()
    }

    pub fn encode(&self, kind: Kind) -> (Vec<u32>, Vec<u32>) {
        let trail = self.trail();
        let mut input = vec![cup(self.start)];
        let mut target = vec![cup(self.start)];

        for (&pair, &ball) in self.swaps.iter().zip(&trail) {
            input.push(swap(pair));
            target.push(cup(ball));

            if kind == Kind::Notes {
                input.push(cup(ball));
                target.push(IGNORE);
            }
        }

        (input, target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_pair_of_cups_has_one_swap() {
        for a in 0..CUPS {
            for b in 0..CUPS {
                assert_eq!(pair_of(a, b).is_some(), a != b);
            }
        }
    }

    #[test]
    fn notes_interleave_the_trail_after_each_swap() {
        let shuffle = Shuffle {
            start: 2,
            swaps: vec![pair_of(2, 4).unwrap(), pair_of(0, 1).unwrap()],
        };
        let (input, target) = shuffle.encode(Kind::Notes);

        assert_eq!(shuffle.trail(), vec![4, 4]);
        assert_eq!(input, vec![2, swap(8), 4, swap(0), 4]);
        assert_eq!(target, vec![2, 4, IGNORE, 4, IGNORE]);
        assert_eq!(input.len(), Kind::Notes.length(2));
    }

    #[test]
    fn nearby_seeds_start_in_different_places() {
        let starts: std::collections::HashSet<usize> = (1..=16)
            .map(|seed| Shuffle::uniform(&mut seeded(seed), 6).start)
            .collect();

        assert!(starts.len() >= 4);
    }

    #[test]
    fn blurts_see_only_the_swaps() {
        let mut rng = Rng::new(7);
        let shuffle = Shuffle::random(&mut rng, MOST);
        let (input, target) = shuffle.encode(Kind::Blurts);

        assert_eq!(input.len(), Kind::Blurts.length(MOST));
        assert!(input[1..].iter().all(|&t| t as usize >= CUPS));
        assert_eq!(target[MOST] as usize, *shuffle.trail().last().unwrap());
    }
}
