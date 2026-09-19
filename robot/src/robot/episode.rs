use bevy::prelude::*;

use super::constants::*;
use super::resources::CurriculumStage;

const TORSO_FALL_Y: f32 = 1.0;
const TORSO_FALL_UP: f32 = 0.5;
const SETTLE_STEPS: usize = 5;
const BOUNDS_SIZE: f32 = 5.0;
pub const RIM_INNER_RADIUS: f32 = 0.20;
const GRAVITY: f32 = 9.81;

const MIN_HOLD_STEPS: usize = 40;

pub const RESET_COOLDOWN: usize = 2;
#[cfg(feature = "native")]
pub const STAGE_SUCCESS_STREAK: usize = 5;
#[cfg(feature = "native")]
pub const STAGE_MIN_EPISODES: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EpisodeEndReason {
    TorsoFell,
    TimedOut,
    OutOfBounds,
    BasketMade,
    ShotMissed,
}

fn is_out_of_bounds(pos: Vec3) -> bool {
    pos.x.abs() > BOUNDS_SIZE || pos.z.abs() > BOUNDS_SIZE
}

pub fn is_basket(previous: Vec3, current: Vec3) -> bool {
    if previous.y <= HOOP_POS.y || current.y > HOOP_POS.y {
        return false;
    }
    let t = (previous.y - HOOP_POS.y) / (previous.y - current.y);
    let crossing = previous.lerp(current, t) - HOOP_POS;
    crossing.x * crossing.x + crossing.z * crossing.z <= (RIM_INNER_RADIUS - BALL_RADIUS).powi(2)
}

impl EpisodeEndReason {
    pub fn check(
        ball_pos: Vec3,
        previous_ball_pos: Option<Vec3>,
        torso_pos: Vec3,
        torso_up: Vec3,
        ball_released: bool,
        step: usize,
        max_steps: usize,
    ) -> Option<Self> {
        let torso_fell =
            step > SETTLE_STEPS && (torso_pos.y < TORSO_FALL_Y || torso_up.y < TORSO_FALL_UP);

        if ball_released && previous_ball_pos.is_some_and(|p| is_basket(p, ball_pos)) {
            Some(Self::BasketMade)
        } else if ball_released
            && (ball_pos.y <= BALL_RADIUS + 0.03
                || is_out_of_bounds(ball_pos)
                || previous_ball_pos.is_some_and(|p| {
                    p.y >= HOOP_POS.y - BALL_RADIUS && ball_pos.y < HOOP_POS.y - BALL_RADIUS
                }))
        {
            Some(Self::ShotMissed)
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
        // Time is observed: the 300-step task is a finite-horizon MDP.
        true
    }

    #[cfg(feature = "native")]
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
            Self::ShotMissed => "shot_missed",
        }
    }
}

pub fn should_release(stage: CurriculumStage, step: usize, release_signal: f32) -> bool {
    stage == CurriculumStage::Shooting && step >= MIN_HOLD_STEPS && release_signal > 0.0
}

pub fn held_ball_position(hand_pos: Vec3) -> Vec3 {
    let lateral_offset = -SHOULDER_OFFSET_RIGHT.z;
    let vertical_offset = ((HAND_RADIUS + BALL_RADIUS).powi(2) - lateral_offset.powi(2)).sqrt();
    hand_pos + Vec3::new(0.0, vertical_offset, lateral_offset)
}

pub fn shot_miss_distance(ball_pos: Vec3, ball_vel: Vec3) -> f32 {
    let discriminant = ball_vel.y * ball_vel.y + 2.0 * GRAVITY * (ball_pos.y - HOOP_POS.y);
    if discriminant < 0.0 {
        return 4.0 + (-discriminant).sqrt() / GRAVITY;
    }
    let t = (ball_vel.y + discriminant.sqrt()) / GRAVITY;
    if t <= 0.0 {
        return 4.0 + ball_pos.distance(HOOP_POS);
    }
    let crossing = ball_pos + ball_vel * t - Vec3::Y * (0.5 * GRAVITY * t * t);
    Vec2::new(crossing.x - HOOP_POS.x, crossing.z - HOOP_POS.z).length()
}

#[cfg(feature = "native")]
pub fn next_stage(stage: CurriculumStage) -> Option<CurriculumStage> {
    match stage {
        CurriculumStage::Standing => Some(CurriculumStage::RaiseBall),
        CurriculumStage::RaiseBall => Some(CurriculumStage::Shooting),
        CurriculumStage::Shooting => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finite_horizon_and_failures_are_terminal() {
        assert!(EpisodeEndReason::TimedOut.is_terminal());
        for reason in [
            EpisodeEndReason::TorsoFell,
            EpisodeEndReason::OutOfBounds,
            EpisodeEndReason::BasketMade,
        ] {
            assert!(reason.is_terminal());
        }
    }

    #[test]
    fn basket_requires_downward_crossing_and_full_ball_clearance() {
        assert!(is_basket(HOOP_POS + Vec3::Y, HOOP_POS - Vec3::Y));
        assert!(!is_basket(HOOP_POS - Vec3::Y, HOOP_POS + Vec3::Y));
        assert!(!is_basket(
            HOOP_POS + Vec3::new(0.09, 1.0, 0.0),
            HOOP_POS + Vec3::new(0.09, -1.0, 0.0)
        ));
        assert!(!is_basket(HOOP_POS + Vec3::Y, HOOP_POS + Vec3::Y * 0.01));
        assert!(is_basket(
            HOOP_POS + Vec3::new(-1.0, 1.0, 0.0),
            HOOP_POS + Vec3::new(1.0, -1.0, 0.0)
        ));
        assert_eq!(
            EpisodeEndReason::check(Vec3::ZERO, None, Vec3::Y * 1.5, Vec3::Y, true, 50, 300),
            Some(EpisodeEndReason::ShotMissed)
        );
    }

    #[test]
    fn release_is_gated_by_curriculum_and_minimum_hold_time() {
        assert!(!should_release(CurriculumStage::Standing, 100, 1.0));
        assert!(!should_release(CurriculumStage::RaiseBall, 100, 1.0));
        assert!(!should_release(
            CurriculumStage::Shooting,
            MIN_HOLD_STEPS - 1,
            1.0
        ));
        assert!(!should_release(
            CurriculumStage::Shooting,
            MIN_HOLD_STEPS,
            -1.0
        ));
        assert!(should_release(
            CurriculumStage::Shooting,
            MIN_HOLD_STEPS,
            1.0
        ));
    }

    #[test]
    fn a_dropped_ball_can_fall_before_the_episode_ends() {
        assert_eq!(
            EpisodeEndReason::check(
                Vec3::new(0.5, 1.7, 0.0),
                Some(Vec3::new(0.5, 1.8, 0.0)),
                Vec3::Y * TORSO_Y,
                Vec3::Y,
                true,
                10,
                300,
            ),
            None
        );
        assert_eq!(
            EpisodeEndReason::check(
                Vec3::new(0.5, BALL_RADIUS, 0.0),
                Some(Vec3::new(0.5, 0.2, 0.0)),
                Vec3::Y * TORSO_Y,
                Vec3::Y,
                true,
                30,
                300,
            ),
            Some(EpisodeEndReason::ShotMissed)
        );
    }
}
