use avian3d::prelude::*;
use bevy::prelude::*;
use std::f32::consts::PI;

use super::components::*;

#[derive(Debug, Clone, Copy, Default)]
pub struct JointState {
    pub angle: f32,
    pub velocity: f32,
}

impl JointState {
    fn relative(parent: (Quat, Vec3), child: (Quat, Vec3), reference: f32) -> Self {
        let angle = (parent.0.inverse() * child.0).to_euler(EulerRot::ZYX).0 + reference;
        let velocity = (child.1 - parent.1).dot(parent.0 * Vec3::Z);
        Self::new(angle, velocity)
    }

    pub fn new(angle: f32, velocity: f32) -> Self {
        Self {
            angle: (angle + PI).rem_euclid(2.0 * PI) - PI,
            velocity,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RobotState {
    pub torso_pos: Vec3,
    pub torso_up: Vec3,
    pub torso_ang_vel: Vec3,
    pub torso_lin_vel: Vec3,
    pub hand_pos: Vec3,
    pub hand_vel: Vec3,
    pub torso: JointState,

    pub shoulder: JointState,
    pub elbow: JointState,
    pub wrist: JointState,

    pub left_shoulder: JointState,
    pub left_elbow: JointState,
    pub left_wrist: JointState,

    pub left_hip: JointState,
    pub left_knee: JointState,
    pub left_ankle: JointState,

    pub right_hip: JointState,
    pub right_knee: JointState,
    pub right_ankle: JointState,

    pub left_foot_pos: Vec3,
    pub right_foot_pos: Vec3,
}

impl RobotState {
    pub fn joint_angles(&self) -> Vec<f32> {
        vec![
            self.shoulder.angle,
            self.elbow.angle,
            self.wrist.angle,
            self.left_shoulder.angle,
            self.left_elbow.angle,
            self.left_wrist.angle,
            self.torso.angle,
            self.left_hip.angle,
            self.left_knee.angle,
            self.left_ankle.angle,
            self.right_hip.angle,
            self.right_knee.angle,
            self.right_ankle.angle,
        ]
    }

    pub fn joint_velocities(&self) -> Vec<f32> {
        vec![
            self.shoulder.velocity,
            self.elbow.velocity,
            self.wrist.velocity,
            self.left_shoulder.velocity,
            self.left_elbow.velocity,
            self.left_wrist.velocity,
            self.torso.velocity,
            self.left_hip.velocity,
            self.left_knee.velocity,
            self.left_ankle.velocity,
            self.right_hip.velocity,
            self.right_knee.velocity,
            self.right_ankle.velocity,
        ]
    }
}

pub type JointReadQuery<'w, 's> = Query<
    'w,
    's,
    (
        (&'static Position, &'static Rotation),
        (&'static AngularVelocity, &'static LinearVelocity),
        Option<&'static RobotTorso>,
        Option<&'static RobotUpperArm>,
        Option<&'static RobotForearm>,
        Option<&'static RobotHand>,
        Option<&'static RobotLeftUpperArm>,
        Option<&'static RobotLeftForearm>,
        Option<&'static RobotLeftHand>,
        Option<&'static RobotLeftThigh>,
        Option<&'static RobotLeftShin>,
        Option<&'static RobotLeftFoot>,
        Option<&'static RobotRightThigh>,
        Option<&'static RobotRightShin>,
        Option<&'static RobotRightFoot>,
    ),
    Or<(
        With<RobotTorso>,
        With<RobotUpperArm>,
        With<RobotForearm>,
        With<RobotHand>,
        With<RobotLeftUpperArm>,
        With<RobotLeftForearm>,
        With<RobotLeftHand>,
        With<RobotLeftThigh>,
        With<RobotLeftShin>,
        With<RobotLeftFoot>,
        With<RobotRightThigh>,
        With<RobotRightShin>,
        With<RobotRightFoot>,
    )>,
>;

pub type BallQuery<'w, 's> = Query<
    'w,
    's,
    (
        &'static mut Position,
        &'static mut LinearVelocity,
        &'static mut AngularVelocity,
    ),
    With<Basketball>,
>;

pub fn extract_robot_state(query: &JointReadQuery) -> Option<RobotState> {
    let mut state = RobotState::default();
    let mut torso_raw = None;
    let mut upper_raw = None;
    let mut forearm_raw = None;
    let mut hand_raw = None;
    let mut left_upper_raw = None;
    let mut left_forearm_raw = None;
    let mut left_hand_raw = None;
    let mut left_thigh_raw = None;
    let mut left_shin_raw = None;
    let mut left_foot_raw = None;
    let mut right_thigh_raw = None;
    let mut right_shin_raw = None;
    let mut right_foot_raw = None;

    for (
        (position, rotation),
        (ang_vel, lin_vel),
        torso,
        upper,
        forearm,
        hand,
        left_upper,
        left_forearm,
        left_hand,
        left_thigh,
        left_shin,
        left_foot,
        right_thigh,
        right_shin,
        right_foot,
    ) in query.iter()
    {
        if *position == Position::PLACEHOLDER || *rotation == Rotation::PLACEHOLDER {
            return None;
        }
        let angle = rotation.0;
        let vel = ang_vel.0;
        let ang3 = Vec3::new(ang_vel.x, ang_vel.y, ang_vel.z);
        let up_vec = rotation.0 * Vec3::Y;

        if torso.is_some() {
            torso_raw = Some((angle, vel));
            state.torso_pos = position.0;
            state.torso_up = up_vec;
            state.torso_ang_vel = ang3;
            state.torso_lin_vel = lin_vel.0;
        } else if upper.is_some() {
            upper_raw = Some((angle, vel));
        } else if forearm.is_some() {
            forearm_raw = Some((angle, vel));
        } else if hand.is_some() {
            hand_raw = Some((angle, vel));
            state.hand_pos = position.0;
            state.hand_vel = lin_vel.0;
        } else if left_upper.is_some() {
            left_upper_raw = Some((angle, vel));
        } else if left_forearm.is_some() {
            left_forearm_raw = Some((angle, vel));
        } else if left_hand.is_some() {
            left_hand_raw = Some((angle, vel));
        } else if left_thigh.is_some() {
            left_thigh_raw = Some((angle, vel));
        } else if left_shin.is_some() {
            left_shin_raw = Some((angle, vel));
        } else if left_foot.is_some() {
            left_foot_raw = Some((angle, vel));
            state.left_foot_pos = position.0;
        } else if right_thigh.is_some() {
            right_thigh_raw = Some((angle, vel));
        } else if right_shin.is_some() {
            right_shin_raw = Some((angle, vel));
        } else if right_foot.is_some() {
            right_foot_raw = Some((angle, vel));
            state.right_foot_pos = position.0;
        }
    }

    let torso = torso_raw?;
    state.torso = JointState::new(torso.0.to_euler(EulerRot::ZYX).0, torso.1.z);
    state.shoulder = JointState::relative(torso, upper_raw?, PI / 2.0);
    state.elbow = JointState::relative(upper_raw?, forearm_raw?, 0.0);
    state.wrist = JointState::relative(forearm_raw?, hand_raw?, 0.0);
    state.left_shoulder = JointState::relative(torso, left_upper_raw?, PI / 2.0);
    state.left_elbow = JointState::relative(left_upper_raw?, left_forearm_raw?, 0.0);
    state.left_wrist = JointState::relative(left_forearm_raw?, left_hand_raw?, 0.0);
    state.left_hip = JointState::relative(torso, left_thigh_raw?, 0.0);
    state.left_knee = JointState::relative(left_thigh_raw?, left_shin_raw?, 0.0);
    state.left_ankle = JointState::relative(left_shin_raw?, left_foot_raw?, 0.0);
    state.right_hip = JointState::relative(torso, right_thigh_raw?, 0.0);
    state.right_knee = JointState::relative(right_thigh_raw?, right_shin_raw?, 0.0);
    state.right_ankle = JointState::relative(right_shin_raw?, right_foot_raw?, 0.0);

    Some(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::ecs::system::SystemState;
    #[test]
    fn joint_rates_follow_the_rotated_hinge_axis() {
        let rotation = Quat::from_rotation_x(PI / 2.0);
        let parent = (rotation, Vec3::X * 3.0);
        let child = (rotation, Vec3::X * 3.0 + rotation * Vec3::Z * 2.0);
        let state = JointState::relative(parent, child, 0.0);
        assert!(state.angle.abs() < 1e-5);
        assert!((state.velocity - 2.0).abs() < 1e-5);
    }

    #[test]
    fn rates_are_relative_and_angles_wrap_across_pi() {
        let mut world = World::new();
        macro_rules! body {
            ($tag:expr, $angle:expr, $rate:expr) => {
                world.spawn((
                    $tag,
                    Position(Vec3::ZERO),
                    Rotation(Quat::from_rotation_z($angle)),
                    AngularVelocity(Vec3::Z * $rate),
                    LinearVelocity::ZERO,
                ));
            };
        }
        body!(RobotTorso, 3.13, 2.0);
        body!(RobotUpperArm, -3.13, 3.0);
        body!(RobotForearm, -3.12, 3.0);
        body!(RobotHand, -3.12, 4.0);
        body!(RobotLeftUpperArm, -3.13, 5.0);
        body!(RobotLeftForearm, -3.12, 5.0);
        body!(RobotLeftHand, -3.12, 6.0);
        body!(RobotLeftThigh, 3.13, 2.0);
        body!(RobotLeftShin, 3.13, 2.0);
        body!(RobotLeftFoot, 3.13, 2.0);
        body!(RobotRightThigh, 3.13, 2.0);
        body!(RobotRightShin, 3.13, 2.0);
        body!(RobotRightFoot, 3.13, 2.0);
        let mut system = SystemState::<JointReadQuery>::new(&mut world);
        let state = extract_robot_state(&system.get(&world).unwrap()).unwrap();
        assert!((state.shoulder.angle - (PI / 2.0 + 2.0 * PI - 6.26)).abs() < 1e-5);
        assert_eq!(state.shoulder.velocity, 1.0);
        assert_eq!(state.elbow.velocity, 0.0);
        assert_eq!(state.wrist.velocity, 1.0);
        assert_eq!(state.left_shoulder.velocity, 3.0);
        assert_eq!(state.left_elbow.velocity, 0.0);
        assert_eq!(state.left_wrist.velocity, 1.0);
        assert_eq!(state.left_knee.velocity, 0.0);
        assert_eq!(state.right_ankle.velocity, 0.0);
    }
}
