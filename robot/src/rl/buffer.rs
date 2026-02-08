use rand::Rng;
use std::collections::VecDeque;

#[derive(Clone)]
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
        let mut rng = rand::rng();
        let batch: Vec<Transition> = (0..batch_size)
            .map(|_| {
                let i = rng.random_range(0..self.len());
                self.buffer[i].clone()
            })
            .collect();
        Some(batch)
    }
}
