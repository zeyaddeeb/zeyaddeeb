use avian3d::prelude::*;
use bevy::prelude::*;
use rand::Rng;

use super::components::*;
use super::constants::*;

#[derive(Debug, Clone, Copy)]
pub struct BodyPartPose {
    pub position: Vec3,
    pub rotation: Quat,
}

impl BodyPartPose {
    pub fn new(position: Vec3, rotation: Quat) -> Self {
        Self { position, rotation }
    }
}

pub fn get_randomized_initial_poses() -> RobotPoses {
    let mut poses = get_initial_poses();

    #[cfg(not(target_arch = "wasm32"))]
    {
        let mut rng = rand::rng();
        poses.torso.position.x += rng.random_range(-0.05..0.05);
        poses.torso.position.z += rng.random_range(-0.05..0.05);
    }

    poses
}

pub fn get_initial_poses() -> RobotPoses {
    use std::f32::consts::PI;

    let torso_pos = Vec3::new(0.0, TORSO_Y, 0.0);
    let torso_rot = Quat::IDENTITY;

    let right_shoulder_world = torso_pos + SHOULDER_OFFSET_RIGHT;
    let right_upper_arm_center = right_shoulder_world + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let elbow_world = right_shoulder_world + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let forearm_center = elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let hand_world = elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

    let shoulder_rot = Quat::from_rotation_z(-PI / 2.0);

    let left_shoulder_world = torso_pos + SHOULDER_OFFSET_LEFT;
    let left_upper_arm_center = left_shoulder_world + Vec3::new(UPPER_ARM_LENGTH / 2.0, 0.0, 0.0);

    let left_elbow_world = left_shoulder_world + Vec3::new(UPPER_ARM_LENGTH, 0.0, 0.0);
    let left_forearm_center = left_elbow_world + Vec3::new(FOREARM_LENGTH / 2.0, 0.0, 0.0);

    let left_hand_world = left_elbow_world + Vec3::new(FOREARM_LENGTH + HAND_RADIUS, 0.0, 0.0);

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
        upper_arm: BodyPartPose::new(right_upper_arm_center, shoulder_rot),
        forearm: BodyPartPose::new(forearm_center, shoulder_rot),
        hand: BodyPartPose::new(hand_world, shoulder_rot),
        left_upper_arm: BodyPartPose::new(left_upper_arm_center, shoulder_rot),
        left_forearm: BodyPartPose::new(left_forearm_center, shoulder_rot),
        left_hand: BodyPartPose::new(left_hand_world, shoulder_rot),
        left_thigh: BodyPartPose::new(left_thigh_center, Quat::IDENTITY),
        left_shin: BodyPartPose::new(left_shin_center, Quat::IDENTITY),
        left_foot: BodyPartPose::new(left_foot_world, Quat::IDENTITY),
        right_thigh: BodyPartPose::new(right_thigh_center, Quat::IDENTITY),
        right_shin: BodyPartPose::new(right_shin_center, Quat::IDENTITY),
        right_foot: BodyPartPose::new(right_foot_world, Quat::IDENTITY),
    }
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

pub fn reset_robot_positions(
    mut queries: ParamSet<(UpperBodyQuery, LowerBodyQuery)>,
    #[cfg(feature = "native")] mut training: Option<ResMut<super::resources::TrainingState>>,
    #[cfg(feature = "wasm")] mut simulation: Option<ResMut<super::resources::SimulationState>>,
) {
    let poses = get_randomized_initial_poses();

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
            let spawn_pos = Vec3::new(0.5, 1.5, 0.0);
            pos.0 = spawn_pos;
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
