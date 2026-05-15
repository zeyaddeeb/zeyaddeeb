use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;

#[derive(Clone, Serialize, Deserialize)]
pub struct Transition {
    pub state: Vec<f32>,
    pub action: Vec<f32>,
    pub reward: f32,
    pub next_state: Vec<f32>,
    pub done: bool,
}

pub struct ReplayBuffer {
    buffer: VecDeque<Transition>,
    capacity: usize,
}

impl ReplayBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, t: Transition) {
        if self.buffer.len() == self.capacity {
            self.buffer.pop_front();
        }
        self.buffer.push_back(t);
    }

    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn sample_batch(&self, batch_size: usize) -> Option<Vec<Transition>> {
        if self.len() < batch_size {
            return None;
        }
        let batch: Vec<Transition> = (0..batch_size)
            .map(|_| {
                let i = rand::random_range(0..self.len());
                self.buffer[i].clone()
            })
            .collect();
        Some(batch)
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> std::io::Result<()> {
        let file = File::create(path)?;
        let mut writer = BufWriter::new(file);
        let data: Vec<&Transition> = self.buffer.iter().collect();
        rmp_serde::encode::write(&mut writer, &data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }

    pub fn load<P: AsRef<Path>>(&mut self, path: P) -> std::io::Result<()> {
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let data: Vec<Transition> = rmp_serde::decode::from_read(&mut reader)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        self.buffer.clear();
        for t in data {
            self.push(t);
        }
        Ok(())
    }
}
