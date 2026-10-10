use opus::{Application, Bitrate, Channels, Signal};

use crate::audio::RATE;

pub const FRAME: usize = RATE as usize / 50;
pub const FRAME_MS: u64 = 20;

const LARGEST_PACKET: usize = 1_275;
const LONGEST_PACKET: usize = RATE as usize * 120 / 1000;

pub struct Encoder(opus::Encoder);

impl Encoder {
    pub fn new(bits_per_second: i32, expected_loss: f32) -> anyhow::Result<Self> {
        let mut encoder = opus::Encoder::new(RATE, Channels::Mono, Application::Voip)?;

        encoder.set_bitrate(Bitrate::Bits(bits_per_second))?;
        encoder.set_signal(Signal::Voice)?;
        encoder.set_inband_fec(expected_loss > 0.0)?;
        encoder.set_packet_loss_perc((expected_loss * 100.0).round() as i32)?;

        Ok(Self(encoder))
    }

    pub fn encode(&mut self, frame: &[f32; FRAME]) -> anyhow::Result<Vec<u8>> {
        Ok(self.0.encode_vec_float(frame, LARGEST_PACKET)?)
    }
}

pub struct Decoder {
    opus: opus::Decoder,
    scratch: Box<[f32; LONGEST_PACKET]>,
}

impl Decoder {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            opus: opus::Decoder::new(RATE, Channels::Mono)?,
            scratch: Box::new([0.0; LONGEST_PACKET]),
        })
    }

    pub fn decode(&mut self, packet: &[u8], heard: &mut Vec<f32>) -> anyhow::Result<()> {
        let decoded = self
            .opus
            .decode_float(packet, self.scratch.as_mut_slice(), false)?;

        heard.extend_from_slice(&self.scratch[..decoded]);

        Ok(())
    }

    pub fn recover(&mut self, following: &[u8], heard: &mut Vec<f32>) -> anyhow::Result<()> {
        let decoded = self
            .opus
            .decode_float(following, &mut self.scratch[..FRAME], true)?;

        heard.extend_from_slice(&self.scratch[..decoded]);

        Ok(())
    }

    pub fn conceal(&mut self, heard: &mut Vec<f32>) -> anyhow::Result<()> {
        let decoded = self
            .opus
            .decode_float(&[], &mut self.scratch[..FRAME], false)?;

        heard.extend_from_slice(&self.scratch[..decoded]);

        Ok(())
    }

    pub fn receive(&mut self, arrivals: &[Option<Vec<u8>>]) -> anyhow::Result<Vec<f32>> {
        let mut heard = Vec::with_capacity(arrivals.len() * FRAME);

        for (index, arrival) in arrivals.iter().enumerate() {
            match (arrival, arrivals.get(index + 1)) {
                (Some(packet), _) => self.decode(packet, &mut heard)?,
                (None, Some(Some(following))) => self.recover(following, &mut heard)?,
                (None, _) => self.conceal(&mut heard)?,
            }
        }

        Ok(heard)
    }
}

pub fn frames(samples: &[f32]) -> impl Iterator<Item = [f32; FRAME]> + '_ {
    samples.chunks(FRAME).map(|chunk| {
        let mut frame = [0.0; FRAME];

        frame[..chunk.len()].copy_from_slice(chunk);

        frame
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::rms;

    fn vowel() -> Vec<f32> {
        (0..2 * RATE as usize)
            .map(|n| {
                let t = n as f32 / RATE as f32;
                let pitch = 120.0 + 25.0 * (3.0 * t).sin();
                let swell = 0.55 + 0.45 * (5.0 * t).sin();

                (1..=12)
                    .map(|k| (std::f32::consts::TAU * pitch * k as f32 * t).sin() / k as f32)
                    .sum::<f32>()
                    * 0.12
                    * swell
            })
            .collect()
    }

    fn packets(bits_per_second: i32, expected_loss: f32) -> Vec<Vec<u8>> {
        let mut encoder = Encoder::new(bits_per_second, expected_loss).unwrap();

        frames(&vowel())
            .map(|frame| encoder.encode(&frame).unwrap())
            .collect()
    }

    fn with_every_fifth_lost(packets: &[Vec<u8>]) -> Vec<Option<Vec<u8>>> {
        packets
            .iter()
            .enumerate()
            .map(|(index, packet)| (index % 5 != 4).then(|| packet.clone()))
            .collect()
    }

    fn damage(heard: &[f32], intact: &[f32]) -> f32 {
        let difference: Vec<f32> = heard.iter().zip(intact).map(|(h, i)| h - i).collect();

        rms(&difference)
    }

    #[test]
    fn speech_survives_the_codec() {
        let sent: Vec<_> = packets(24_000, 0.0).into_iter().map(Some).collect();
        let heard = Decoder::new().unwrap().receive(&sent).unwrap();

        assert_eq!(heard.len(), vowel().len());
        assert!((rms(&heard) / rms(&vowel()) - 1.0).abs() < 0.15);
    }

    #[test]
    fn every_arrival_yields_one_frame() {
        let arrivals = with_every_fifth_lost(&packets(6_000, 0.0));
        let heard = Decoder::new().unwrap().receive(&arrivals).unwrap();

        assert_eq!(heard.len(), arrivals.len() * FRAME);
    }

    #[test]
    fn redundancy_repairs_a_single_loss_better_than_guessing() {
        let protected = packets(24_000, 0.2);
        let intact: Vec<_> = protected.iter().cloned().map(Some).collect();
        let lossy = with_every_fifth_lost(&protected);
        let reference = Decoder::new().unwrap().receive(&intact).unwrap();
        let repaired = Decoder::new().unwrap().receive(&lossy).unwrap();
        let guessed = {
            let mut decoder = Decoder::new().unwrap();
            let mut heard = Vec::new();

            for arrival in &lossy {
                match arrival {
                    Some(packet) => decoder.decode(packet, &mut heard).unwrap(),
                    None => decoder.conceal(&mut heard).unwrap(),
                }
            }

            heard
        };

        assert!(damage(&repaired, &reference) < 0.8 * damage(&guessed, &reference));
    }

    #[test]
    fn a_short_tail_is_padded_to_a_frame() {
        assert_eq!(frames(&vec![0.1; FRAME + 7]).count(), 2);
    }
}
