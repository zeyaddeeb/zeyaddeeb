use rand::Rng;

pub struct OuNoise {
    mu: f64,
    theta: f64,
    sigma: f64,
    state: Vec<f64>,
}

impl OuNoise {
    pub fn new(size: usize) -> Self {
        Self {
            mu: 0.0,
            theta: 0.15,
            sigma: 0.08,
            state: vec![0.0; size],
        }
    }

    pub fn sample(&mut self) -> Vec<f32> {
        let mut rng = rand::rng();
        for s in &mut self.state {
            let dx = self.theta * (self.mu - *s) + self.sigma * rng.random_range(-1.0f64..1.0f64);
            *s += dx;
        }
        self.state.iter().map(|&v| v as f32).collect()
    }
}
