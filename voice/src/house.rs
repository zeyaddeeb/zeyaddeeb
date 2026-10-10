use std::{path::Path, sync::Arc};

use anyhow::{anyhow, bail, Context};

use crate::{
    audio::{self, RATE},
    line::Line,
    protocol::Generation,
    room::{Room, Turn},
    run::tape,
    state::Packets,
};

const MAGIC: &[u8; 4] = b"TAPE";
const SEED: u64 = 1;

#[derive(Default)]
pub struct House {
    pub generations: Vec<Generation>,
    pub tape: Vec<Packets>,
}

impl House {
    pub fn record(room: &Room, recording: &Path, generations: usize) -> anyhow::Result<Self> {
        let (samples, rate) = audio::read_wav(recording)?;
        let take = audio::resample(&samples, rate, RATE);
        let (first, mut progress) = room.begin(audio::trim(&take, RATE), Line::Clear, SEED)?;
        let mut house = Self::default();

        house.keep(first)?;

        while progress.index() < generations {
            let Some(turn) = room.advance(&mut progress)? else {
                break;
            };

            house.keep(turn)?;
        }

        Ok(house)
    }

    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let bytes =
            std::fs::read(path).with_context(|| format!("cannot read {}", path.display()))?;

        Self::decode(&bytes).with_context(|| format!("{} is not a tape", path.display()))
    }

    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        std::fs::write(path, self.encode()?)
            .with_context(|| format!("cannot write {}", path.display()))
    }

    fn keep(&mut self, turn: Turn) -> anyhow::Result<()> {
        self.tape.push(tape(&turn.recording.samples)?);
        self.generations.push(turn.generation);

        Ok(())
    }

    fn encode(&self) -> anyhow::Result<Vec<u8>> {
        let mut bytes = MAGIC.to_vec();

        bytes.extend((self.generations.len() as u32).to_le_bytes());

        for (generation, packets) in self.generations.iter().zip(&self.tape) {
            let described = serde_json::to_vec(generation)?;

            bytes.extend((described.len() as u32).to_le_bytes());
            bytes.extend(described);
            bytes.extend((packets.len() as u32).to_le_bytes());

            for packet in packets.iter() {
                bytes.extend(u16::try_from(packet.len())?.to_le_bytes());
                bytes.extend(packet);
            }
        }

        Ok(bytes)
    }

    fn decode(bytes: &[u8]) -> anyhow::Result<Self> {
        let mut reader = Reader(bytes);

        if reader.take(MAGIC.len())? != MAGIC {
            bail!("the file does not start like a tape");
        }

        let mut house = Self::default();

        for _ in 0..reader.count()? {
            let described = reader.count()?;

            house
                .generations
                .push(serde_json::from_slice(reader.take(described)?)?);

            let packets = (0..reader.count()?)
                .map(|_| {
                    let length = reader.short()?;

                    Ok(reader.take(length)?.to_vec())
                })
                .collect::<anyhow::Result<Vec<_>>>()?;

            house.tape.push(Arc::new(packets));
        }

        Ok(house)
    }
}

struct Reader<'a>(&'a [u8]);

impl<'a> Reader<'a> {
    fn take(&mut self, length: usize) -> anyhow::Result<&'a [u8]> {
        if self.0.len() < length {
            return Err(anyhow!("the tape ends early"));
        }

        let (taken, rest) = self.0.split_at(length);

        self.0 = rest;

        Ok(taken)
    }

    fn count(&mut self) -> anyhow::Result<usize> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into()?) as usize)
    }

    fn short(&mut self) -> anyhow::Result<usize> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into()?) as usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> House {
        House {
            generations: vec![
                Generation {
                    index: 0,
                    text: String::new(),
                    likeness: 1.0,
                    seconds: 1.5,
                    spectrum: vec![0, 128, 255],
                },
                Generation {
                    index: 1,
                    text: "I wonder what it is.".into(),
                    likeness: 0.25,
                    seconds: 0.9,
                    spectrum: vec![7; 3],
                },
            ],
            tape: vec![
                Arc::new(vec![vec![1, 2, 3], vec![], vec![9; 300]]),
                Arc::new(vec![vec![4]]),
            ],
        }
    }

    #[test]
    fn a_tape_reads_back_as_it_was_written() {
        let house = sample();
        let read = House::decode(&house.encode().unwrap()).unwrap();

        assert_eq!(read.tape, house.tape);
        assert_eq!(read.generations.len(), 2);
        assert_eq!(read.generations[1].text, "I wonder what it is.");
        assert_eq!(read.generations[0].spectrum, vec![0, 128, 255]);
        assert_eq!(read.generations[1].likeness, 0.25);
    }

    #[test]
    fn a_cut_tape_is_refused() {
        let bytes = sample().encode().unwrap();

        assert!(House::decode(&bytes[..bytes.len() - 5]).is_err());
        assert!(House::decode(&bytes[..3]).is_err());
    }

    #[test]
    fn other_files_are_refused() {
        assert!(House::decode(b"RIFF\x02\x00\x00\x00").is_err());
    }
}
