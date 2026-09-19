use avian3d::prelude::*;
use bevy::prelude::*;

use super::components::*;
use super::constants::*;
use super::episode::held_ball_position;
use super::resources::BallGrip;

#[derive(Debug, Clone, Copy)]
pub struct BodyPartPose {
    pub position: Vec3,
    pub rotation: Quat,
}

impl BodyPartPose {
    pub fn new(position: Vec3, rotation: Quat) -> Self {
        Self { position, rotation }
    }

    pub fn transform(&self) -> Transform {
        Transform::from_translation(self.position).with_rotation(self.rotation)
    }
}

pub fn get_randomized_initial_poses() -> RobotPoses {
    let poses = get_initial_poses();

    #[cfg(not(target_arch = "wasm32"))]
    {
        let mut poses = poses;
        poses.translate(Vec3::new(
            rand::random_range(-0.05..0.05),
            0.0,
            rand::random_range(-0.05..0.05),
        ));
        poses
    }

    #[cfg(target_arch = "wasm32")]
    poses
}

pub fn get_initial_poses() -> RobotPoses {
    let torso_pos = Vec3::new(0.0, TORSO_Y, 0.0);
    let torso_rot = Quat::IDENTITY;

    let (upper_arm, forearm, hand) = initial_arm_poses(torso_pos + SHOULDER_OFFSET_RIGHT);
    let (left_upper_arm, left_forearm, left_hand) =
        initial_arm_poses(torso_pos + SHOULDER_OFFSET_LEFT);

    let right_hip_world = torso_pos + HIP_OFFSET_RIGHT;
    let right_thigh_center = right_hip_world + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0);

    let right_knee_world = right_hip_world + Vec3::new(0.0, -THIGH_LENGTH, 0.0);
    let right_shin_center = right_knee_world + Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0);

    let right_foot_world =
        right_knee_world + Vec3::new(FOOT_FORWARD_OFFSET, -SHIN_LENGTH - FOOT_SIZE_Y / 2.0, 0.0);

    let left_hip_world = torso_pos + HIP_OFFSET_LEFT;
    let left_thigh_center = left_hip_world + Vec3::new(0.0, -THIGH_LENGTH / 2.0, 0.0);

    let left_knee_world = left_hip_world + Vec3::new(0.0, -THIGH_LENGTH, 0.0);
    let left_shin_center = left_knee_world + Vec3::new(0.0, -SHIN_LENGTH / 2.0, 0.0);

    let left_foot_world =
        left_knee_world + Vec3::new(FOOT_FORWARD_OFFSET, -SHIN_LENGTH - FOOT_SIZE_Y / 2.0, 0.0);

    RobotPoses {
        torso: BodyPartPose::new(torso_pos, torso_rot),
        upper_arm,
        forearm,
        hand,
        left_upper_arm,
        left_forearm,
        left_hand,
        left_thigh: BodyPartPose::new(left_thigh_center, Quat::IDENTITY),
        left_shin: BodyPartPose::new(left_shin_center, Quat::IDENTITY),
        left_foot: BodyPartPose::new(left_foot_world, Quat::IDENTITY),
        right_thigh: BodyPartPose::new(right_thigh_center, Quat::IDENTITY),
        right_shin: BodyPartPose::new(right_shin_center, Quat::IDENTITY),
        right_foot: BodyPartPose::new(right_foot_world, Quat::IDENTITY),
    }
}

fn initial_arm_poses(shoulder: Vec3) -> (BodyPartPose, BodyPartPose, BodyPartPose) {
    let upper_rotation = Quat::from_rotation_z(-160.0_f32.to_radians());
    let forearm_rotation = Quat::from_rotation_z(-50.0_f32.to_radians());
    let upper_direction = upper_rotation * Vec3::Y;
    let forearm_direction = forearm_rotation * Vec3::Y;
    let elbow = shoulder + upper_direction * UPPER_ARM_LENGTH;
    (
        BodyPartPose::new(
            shoulder + upper_direction * UPPER_ARM_LENGTH / 2.0,
            upper_rotation,
        ),
        BodyPartPose::new(
            elbow + forearm_direction * FOREARM_LENGTH / 2.0,
            forearm_rotation,
        ),
        BodyPartPose::new(
            elbow + forearm_direction * (FOREARM_LENGTH + HAND_RADIUS),
            forearm_rotation,
        ),
    )
}

pub struct RobotPoses {
    pub torso: BodyPartPose,
    pub upper_arm: BodyPartPose,
    pub forearm: BodyPartPose,
    pub hand: BodyPartPose,
    pub left_upper_arm: BodyPartPose,
    pub left_forearm: BodyPartPose,
    pub left_hand: BodyPartPose,
    pub left_thigh: BodyPartPose,
    pub left_shin: BodyPartPose,
    pub left_foot: BodyPartPose,
    pub right_thigh: BodyPartPose,
    pub right_shin: BodyPartPose,
    pub right_foot: BodyPartPose,
}

impl RobotPoses {
    pub fn ball_position(&self) -> Vec3 {
        held_ball_position(self.hand.position)
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn translate(&mut self, offset: Vec3) {
        for pose in [
            &mut self.torso,
            &mut self.upper_arm,
            &mut self.forearm,
            &mut self.hand,
            &mut self.left_upper_arm,
            &mut self.left_forearm,
            &mut self.left_hand,
            &mut self.left_thigh,
            &mut self.left_shin,
            &mut self.left_foot,
            &mut self.right_thigh,
            &mut self.right_shin,
            &mut self.right_foot,
        ] {
            pose.position += offset;
        }
    }
}

fn reset_entity(
    lv: &mut LinearVelocity,
    av: &mut AngularVelocity,
    pos: &mut Position,
    rot: &mut Rotation,
    pose: &BodyPartPose,
) {
    pos.0 = pose.position;
    rot.0 = pose.rotation;
    **lv = Vec3::ZERO;
    **av = Vec3::ZERO;
}

type UpperBodyQuery = Query<
    'static,
    'static,
    (
        &'static mut LinearVelocity,
        &'static mut AngularVelocity,
        &'static mut Position,
        &'static mut Rotation,
        Has<RobotTorso>,
        Has<RobotUpperArm>,
        Has<RobotForearm>,
        Has<RobotHand>,
        Has<RobotLeftUpperArm>,
        Has<RobotLeftForearm>,
        Has<RobotLeftHand>,
    ),
    Or<(
        With<RobotTorso>,
        With<RobotUpperArm>,
        With<RobotForearm>,
        With<RobotHand>,
        With<RobotLeftUpperArm>,
        With<RobotLeftForearm>,
        With<RobotLeftHand>,
    )>,
>;

type LowerBodyQuery = Query<
    'static,
    'static,
    (
        &'static mut LinearVelocity,
        &'static mut AngularVelocity,
        &'static mut Position,
        &'static mut Rotation,
        Has<RobotLeftThigh>,
        Has<RobotLeftShin>,
        Has<RobotLeftFoot>,
        Has<RobotRightThigh>,
        Has<RobotRightShin>,
        Has<RobotRightFoot>,
        Has<Basketball>,
    ),
    Or<(
        With<RobotLeftThigh>,
        With<RobotLeftShin>,
        With<RobotLeftFoot>,
        With<RobotRightThigh>,
        With<RobotRightShin>,
        With<RobotRightFoot>,
        With<Basketball>,
    )>,
>;

pub fn release_ball(commands: &mut Commands, grip: &mut BallGrip) {
    grip.released = true;
    for joint in grip.joints {
        commands.entity(joint).insert(JointDisabled);
    }
}

pub fn reset_robot_positions(
    mut commands: Commands,
    grip: Option<ResMut<BallGrip>>,
    mut queries: ParamSet<(UpperBodyQuery, LowerBodyQuery)>,
    #[cfg(feature = "native")] mut training: Option<ResMut<super::resources::TrainingState>>,
    #[cfg(feature = "wasm")] mut simulation: Option<ResMut<super::resources::SimulationState>>,
) {
    let poses = get_randomized_initial_poses();

    if let Some(mut grip) = grip {
        grip.released = false;
        grip.dropped = false;
        for joint in grip.joints {
            commands
                .entity(joint)
                .remove::<JointDisabled>()
                .insert(JointForces::new());
        }
    }

    #[cfg(feature = "native")]
    if let Some(ref mut t) = training {
        t.needs_reset = false;
    }

    #[cfg(feature = "wasm")]
    if let Some(ref mut s) = simulation {
        s.needs_reset = false;
    }

    for (
        mut lv,
        mut av,
        mut pos,
        mut rot,
        is_torso,
        is_upper_arm,
        is_forearm,
        is_hand,
        is_left_upper_arm,
        is_left_forearm,
        is_left_hand,
    ) in queries.p0().iter_mut()
    {
        if is_torso {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.torso);
        } else if is_upper_arm {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.upper_arm);
        } else if is_forearm {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.forearm);
        } else if is_hand {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.hand);
        } else if is_left_upper_arm {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.left_upper_arm);
        } else if is_left_forearm {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.left_forearm);
        } else if is_left_hand {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.left_hand);
        }
    }

    for (
        mut lv,
        mut av,
        mut pos,
        mut rot,
        is_left_thigh,
        is_left_shin,
        is_left_foot,
        is_right_thigh,
        is_right_shin,
        is_right_foot,
        is_basketball,
    ) in queries.p1().iter_mut()
    {
        if is_basketball {
            pos.0 = poses.ball_position();
            rot.0 = Quat::IDENTITY;
            *lv = LinearVelocity::ZERO;
            *av = AngularVelocity::ZERO;
        } else if is_left_thigh {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.left_thigh);
        } else if is_left_shin {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.left_shin);
        } else if is_left_foot {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.left_foot);
        } else if is_right_thigh {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.right_thigh);
        } else if is_right_shin {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.right_shin);
        } else if is_right_foot {
            reset_entity(&mut lv, &mut av, &mut pos, &mut rot, &poses.right_foot);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_pose_cradles_ball_clear_of_the_torso() {
        let poses = get_initial_poses();
        let ball = poses.ball_position();
        for hand in [poses.hand, poses.left_hand] {
            assert!((ball.distance(hand.position) - HAND_RADIUS - BALL_RADIUS).abs() < 1e-5);
        }
        assert!(ball.x - BALL_RADIUS > TORSO_SIZE_X / 2.0);
        assert!(ball.y > TORSO_Y && ball.y < TORSO_Y + TORSO_HEIGHT / 2.0);
        assert!(ball.z.abs() < 1e-5);
        assert!(
            poses.hand.position.x < 0.6,
            "hands should be close to the chest"
        );
    }

    #[test]
    fn random_reset_translates_the_whole_pose_together() {
        let initial = get_initial_poses();
        let reset = get_randomized_initial_poses();
        let offset = reset.torso.position - initial.torso.position;
        for (before, after) in [
            (initial.upper_arm, reset.upper_arm),
            (initial.forearm, reset.forearm),
            (initial.hand, reset.hand),
            (initial.left_upper_arm, reset.left_upper_arm),
            (initial.left_forearm, reset.left_forearm),
            (initial.left_hand, reset.left_hand),
            (initial.left_thigh, reset.left_thigh),
            (initial.left_shin, reset.left_shin),
            (initial.left_foot, reset.left_foot),
            (initial.right_thigh, reset.right_thigh),
            (initial.right_shin, reset.right_shin),
            (initial.right_foot, reset.right_foot),
        ] {
            assert!((after.position - before.position).abs_diff_eq(offset, 1e-5));
            assert!(after.rotation.abs_diff_eq(before.rotation, 1e-5));
        }
        assert!((reset.ball_position() - initial.ball_position()).abs_diff_eq(offset, 1e-5));
    }
}
