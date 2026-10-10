use std::f64::consts::FRAC_PI_2;

use anyhow::Result;
use candle_core::{Device, Tensor};

use crate::net::mlp::SiluMlp;
use crate::signal::grid::linspace;

const TIME_SCALE: f32 = 1000.0;
const MAX_PERIOD: f64 = 10_000.0;
const NEGLIGIBLE_SWAY: f32 = 1e-8;

pub fn time_grid(steps: usize, sway: f32) -> Vec<f32> {
    let times = linspace(0.0, 1.0, steps + 1);
    if sway.abs() <= NEGLIGIBLE_SWAY {
        return times;
    }
    let quarter_turn = FRAC_PI_2 as f32;
    times
        .into_iter()
        .map(|time| time + sway * ((quarter_turn * time).cos() - 1.0 + time))
        .collect()
}

pub struct Clock {
    pub width: usize,
    pub mlp: SiluMlp,
}

impl Clock {
    pub fn embed(&self, time: f32) -> Result<Tensor> {
        let waves = waves(time, self.width);
        let waves = Tensor::from_vec(waves, (1, self.width), &Device::Cpu)?;
        self.mlp.forward(&waves)
    }
}

fn waves(time: f32, width: usize) -> Vec<f32> {
    let half = (width / 2).max(1);
    let decay = (-(MAX_PERIOD.ln() / (half - 1).max(1) as f64)) as f32;
    let phases: Vec<f32> = (0..half)
        .map(|index| (TIME_SCALE * time) * (index as f32 * decay).exp())
        .collect();
    let sines = phases.iter().map(|phase| phase.sin());
    let cosines = phases.iter().map(|phase| phase.cos());
    sines.chain(cosines).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_without_sway_is_uniform() {
        assert_eq!(time_grid(4, 0.0), [0.0, 0.25, 0.5, 0.75, 1.0]);
    }

    #[test]
    fn positive_sway_spends_the_first_step_on_most_of_the_path() {
        let grid = time_grid(2, 1.0);
        assert_eq!(grid.len(), 3);
        assert_eq!((grid[0], grid[2]), (0.0, 1.0));
        assert!((grid[1] - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-6);
    }

    #[test]
    fn negative_sway_moves_steps_toward_the_start() {
        let grid = time_grid(2, -1.0);
        assert!((grid[1] - (1.0 - std::f32::consts::FRAC_1_SQRT_2)).abs() < 1e-6);
    }

    #[test]
    fn time_zero_gives_zero_sines_and_unit_cosines() {
        let waves = waves(0.0, 8);
        assert_eq!(waves, [0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0]);
    }

    #[test]
    fn frequencies_decay_from_the_time_scale_to_a_ten_thousandth_of_it() {
        let waves = waves(0.001, 8);
        assert!((waves[0] - 1f32.sin()).abs() < 1e-6);
        assert!((waves[4] - 1f32.cos()).abs() < 1e-6);
        assert!((waves[3] - 1e-4).abs() < 1e-8);
    }
}
