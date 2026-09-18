use bevy::prelude::*;

use super::constants::*;
use super::resources::CurriculumStage;

const TORSO_FALL_Y: f32 = 1.0;
const TORSO_FALL_UP: f32 = 0.5;
const SETTLE_STEPS: usize = 5;
const BOUNDS_SIZE: f32 = 5.0;
const BASKET_RADIUS: f32 = 0.3;
const GRAVITY: f32 = 9.81;

const MIN_HOLD_STEPS: usize = 40;

pub const RESET_COOLDOWN: usize = 2;
pub const STAGE_SUCCESS_STREAK: usize = 5;
pub const STAGE_MIN_EPISODES: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EpisodeEndReason {
    TorsoFell,
    TimedOut,
    OutOfBounds,
    BasketMade,
}

fn is_out_of_bounds(pos: Vec3) -> bool {
    pos.x.abs() > BOUNDS_SIZE || pos.z.abs() > BOUNDS_SIZE
}

pub fn is_basket(ball_pos: Vec3) -> bool {
    (ball_pos - HOOP_POS).length() < BASKET_RADIUS
}

impl EpisodeEndReason {
    pub fn check(
        ball_pos: Vec3,
        torso_pos: Vec3,
        torso_up: Vec3,
        ball_released: bool,
        step: usize,
        max_steps: usize,
    ) -> Option<Self> {
        let torso_fell =
            step > SETTLE_STEPS && (torso_pos.y < TORSO_FALL_Y || torso_up.y < TORSO_FALL_UP);

        if ball_released && is_basket(ball_pos) {
            Some(Self::BasketMade)
        } else if is_out_of_bounds(torso_pos) {
            Some(Self::OutOfBounds)
        } else if torso_fell {
            Some(Self::TorsoFell)
        } else if step >= max_steps {
            Some(Self::TimedOut)
        } else {
            None
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::TorsoFell | Self::OutOfBounds | Self::BasketMade)
    }

    pub fn is_stage_success(&self, stage: CurriculumStage, ball_pos: Vec3) -> bool {
        match stage {
            CurriculumStage::Standing => *self == Self::TimedOut,
            CurriculumStage::RaiseBall => *self == Self::TimedOut && ball_pos.y > RAISE_BALL_Y,
            CurriculumStage::Shooting => *self == Self::BasketMade,
        }
    }

    #[cfg(feature = "native")]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TorsoFell => "torso_fell",
            Self::TimedOut => "timed_out",
            Self::OutOfBounds => "out_of_bounds",
            Self::BasketMade => "basket_made",
        }
    }
}

pub fn should_release(stage: CurriculumStage, step: usize, release_signal: f32) -> bool {
    stage == CurriculumStage::Shooting && step >= MIN_HOLD_STEPS && release_signal > 0.0
}

pub fn held_ball_position(hand_pos: Vec3) -> Vec3 {
    hand_pos + Vec3::Y * (HAND_RADIUS + BALL_RADIUS)
}

pub fn shot_miss_distance(ball_pos: Vec3, ball_vel: Vec3) -> f32 {
    let mut best = f32::MAX;
    for i in 0..150 {
        let t = i as f32 * 0.02;
        let p = ball_pos + ball_vel * t - Vec3::Y * (0.5 * GRAVITY * t * t);
        if p.y < 0.0 {
            break;
        }
        best = best.min((p - HOOP_POS).length());
    }
    best
}

pub fn next_stage(stage: CurriculumStage) -> Option<CurriculumStage> {
    match stage {
        CurriculumStage::Standing => Some(CurriculumStage::RaiseBall),
        CurriculumStage::RaiseBall => Some(CurriculumStage::Shooting),
        CurriculumStage::Shooting => None,
    }
}
