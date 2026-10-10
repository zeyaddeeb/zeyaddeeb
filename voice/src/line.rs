use serde::{Deserialize, Serialize};

use crate::{
    audio::rms,
    codec::{frames, Decoder, Encoder},
    rng::Rng,
};

const HISS_SMOOTHING: f32 = 0.55;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Line {
    Clear,
    Patchy,
    Storm,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wire {
    pub bits_per_second: i32,
    pub loss: f32,
    pub burst_frames: f32,
    pub noise_db: Option<f32>,
}

impl Line {
    pub fn wire(self) -> Option<Wire> {
        match self {
            Line::Clear => None,
            Line::Patchy => Some(Wire {
                bits_per_second: 12_000,
                loss: 0.2,
                burst_frames: 2.0,
                noise_db: None,
            }),
            Line::Storm => Some(Wire {
                bits_per_second: 12_000,
                loss: 0.2,
                burst_frames: 3.0,
                noise_db: Some(20.0),
            }),
        }
    }

    pub fn carry(self, samples: &[f32], seed: u64) -> anyhow::Result<Vec<f32>> {
        match self.wire() {
            Some(wire) => wire.carry(samples, seed),
            None => Ok(samples.to_vec()),
        }
    }
}

impl Wire {
    pub fn carry(&self, samples: &[f32], seed: u64) -> anyhow::Result<Vec<f32>> {
        let mut rng = Rng::new(seed);
        let noisy = self.hiss(samples, &mut rng);
        let mut encoder = Encoder::new(self.bits_per_second, self.loss)?;
        let mut dropout = Dropout::new(self.loss, self.burst_frames);
        let arrivals = frames(&noisy)
            .map(|frame| {
                let packet = encoder.encode(&frame)?;

                Ok((!dropout.next(&mut rng)).then_some(packet))
            })
            .collect::<anyhow::Result<Vec<_>>>()?;
        let mut heard = Decoder::new()?.receive(&arrivals)?;

        heard.truncate(samples.len());

        Ok(heard)
    }

    fn hiss(&self, samples: &[f32], rng: &mut Rng) -> Vec<f32> {
        let Some(noise_db) = self.noise_db else {
            return samples.to_vec();
        };

        let level = rms(samples) / 10f32.powf(noise_db / 20.0);
        let gain = level * (1.0 - HISS_SMOOTHING * HISS_SMOOTHING).sqrt();
        let mut held = 0.0;

        samples
            .iter()
            .map(|sample| {
                held = HISS_SMOOTHING * held + gain * rng.normal();

                (sample + held).clamp(-1.0, 1.0)
            })
            .collect()
    }
}

struct Dropout {
    enter: f32,
    leave: f32,
    dropping: bool,
}

impl Dropout {
    fn new(loss: f32, burst_frames: f32) -> Self {
        let leave = 1.0 / burst_frames.max(1.0);

        Self {
            enter: if loss < 1.0 {
                loss * leave / (1.0 - loss)
            } else {
                1.0
            },
            leave,
            dropping: false,
        }
    }

    fn next(&mut self, rng: &mut Rng) -> bool {
        let flip = if self.dropping {
            self.leave
        } else {
            self.enter
        };

        if rng.unit() < flip {
            self.dropping = !self.dropping;
        }

        self.dropping
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::RATE;

    fn speechlike() -> Vec<f32> {
        (0..2 * RATE as usize)
            .map(|n| {
                let t = n as f32 / RATE as f32;

                (std::f32::consts::TAU * 180.0 * t).sin() * 0.2 * (0.6 + 0.4 * (6.0 * t).sin())
            })
            .collect()
    }

    #[test]
    fn dropout_matches_its_loss_rate() {
        let mut rng = Rng::new(11);
        let mut dropout = Dropout::new(0.3, 3.0);
        let lost = (0..200_000).filter(|_| dropout.next(&mut rng)).count();

        assert!((lost as f32 / 200_000.0 - 0.3).abs() < 0.01);
    }

    #[test]
    fn dropout_comes_in_bursts() {
        let mut rng = Rng::new(5);
        let mut dropout = Dropout::new(0.3, 3.0);
        let run: Vec<bool> = (0..200_000).map(|_| dropout.next(&mut rng)).collect();
        let bursts = run.windows(2).filter(|pair| !pair[0] && pair[1]).count();
        let lost = run.iter().filter(|lost| **lost).count();

        assert!((lost as f32 / bursts as f32 - 3.0).abs() < 0.15);
    }

    #[test]
    fn a_clear_line_never_drops() {
        let mut rng = Rng::new(2);
        let mut dropout = Dropout::new(0.0, 1.0);

        assert!((0..10_000).all(|_| !dropout.next(&mut rng)));
    }

    #[test]
    fn the_same_seed_carries_the_same_audio() {
        let said = speechlike();

        assert_eq!(
            Line::Storm.carry(&said, 9).unwrap(),
            Line::Storm.carry(&said, 9).unwrap()
        );
        assert_ne!(
            Line::Storm.carry(&said, 9).unwrap(),
            Line::Storm.carry(&said, 10).unwrap()
        );
    }

    #[test]
    fn a_clear_line_changes_nothing() {
        let said = speechlike();

        assert_eq!(Line::Clear.carry(&said, 3).unwrap(), said);
    }

    #[test]
    fn what_arrives_is_as_long_as_what_was_said() {
        let said = speechlike();

        for line in [Line::Clear, Line::Patchy, Line::Storm] {
            assert_eq!(line.carry(&said, 1).unwrap().len(), said.len());
        }
    }

    #[test]
    fn hiss_sits_at_the_asked_level() {
        let said = speechlike();
        let wire = Line::Storm.wire().unwrap();
        let noisy = wire.hiss(&said, &mut Rng::new(4));
        let noise: Vec<f32> = noisy.iter().zip(&said).map(|(n, s)| n - s).collect();
        let measured = 20.0 * (rms(&said) / rms(&noise)).log10();

        assert!((measured - 20.0).abs() < 0.5, "measured {measured} dB");
    }
}
