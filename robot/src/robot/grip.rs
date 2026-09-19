use avian3d::prelude::*;
use bevy::prelude::*;

use super::constants::{BALL_RADIUS, HAND_RADIUS};
use super::reset::release_ball;
use super::resources::BallGrip;

pub(super) const GRIP_COMPLIANCE: f32 = 0.0005;
const MAX_GRIP_FORCE: f32 = 8.0;
const MAX_GRIP_STRETCH: f32 = 0.04;
const MIN_SUPPORT_DOT: f32 = 0.2;

pub struct BallGripPlugin;

impl Plugin for BallGripPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            PhysicsSchedule,
            check_ball_grip
                .after(PhysicsStepSystems::First)
                .before(PhysicsStepSystems::BroadPhase),
        )
        .add_systems(
            PhysicsSchedule,
            check_ball_grip.after(PhysicsStepSystems::Last),
        );
    }
}

fn check_ball_grip(
    mut commands: Commands,
    grip: Option<ResMut<BallGrip>>,
    joints: Query<(&SphericalJoint, &JointForces)>,
    bodies: Query<(&Position, &Rotation, &LinearVelocity, &AngularVelocity)>,
    gravity: Res<Gravity>,
    time: Res<Time>,
) {
    let Some(mut grip) = grip else { return };
    if grip.released {
        return;
    }
    let up = (-gravity.0).normalize_or_zero();
    for entity in grip.joints {
        let Ok((joint, forces)) = joints.get(entity) else {
            continue;
        };
        let Ok((hand, rotation, hand_velocity, hand_spin)) = bodies.get(joint.body1) else {
            continue;
        };
        let Ok((ball, _, ball_velocity, _)) = bodies.get(joint.body2) else {
            continue;
        };
        let Some(anchor) = joint.local_anchor1() else {
            continue;
        };
        let palm_to_ball = rotation.0 * anchor;
        let offset = ball.0 - hand.0;
        let relative_velocity = ball_velocity.0 - hand_velocity.0 - hand_spin.0.cross(palm_to_ball);
        let unsupported = up != Vec3::ZERO
            && (palm_to_ball.normalize_or_zero().dot(up) < MIN_SUPPORT_DOT
                || offset.normalize_or_zero().dot(up) < MIN_SUPPORT_DOT);
        let slipped = (offset - palm_to_ball).length() > MAX_GRIP_STRETCH
            || offset.length() > HAND_RADIUS + BALL_RADIUS + MAX_GRIP_STRETCH;
        // Release before a sudden impulse is absorbed by the constraints.
        let would_slip = (offset - palm_to_ball + relative_velocity * time.delta_secs()).length()
            > MAX_GRIP_STRETCH;
        let overloaded = forces.force().length() > MAX_GRIP_FORCE;
        if unsupported || slipped || would_slip || overloaded {
            grip.dropped = true;
            release_ball(&mut commands, &mut grip);
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::robot::{
        builder::spawn_robot, components::Basketball, reset::reset_robot_positions,
        resources::RobotEntities, setup::spawn_ball,
    };
    use bevy::{ecs::system::RunSystemOnce, time::TimeUpdateStrategy};

    fn app(substeps: u32) -> App {
        let mut app = App::new();
        app.add_plugins((
            MinimalPlugins,
            TransformPlugin,
            AssetPlugin::default(),
            PhysicsPlugins::default(),
            BallGripPlugin,
        ))
        .init_asset::<Mesh>()
        .init_asset::<StandardMaterial>()
        .insert_resource(TimeUpdateStrategy::FixedTimesteps(1))
        .insert_resource(SubstepCount(substeps))
        .add_systems(
            Startup,
            (
                |mut commands: Commands,
                 mut meshes: ResMut<Assets<Mesh>>,
                 mut materials: ResMut<Assets<StandardMaterial>>| {
                    let robot = spawn_robot(&mut commands, &mut meshes, &mut materials);
                    spawn_ball(&mut commands, &mut meshes, &mut materials, &robot);
                    commands.insert_resource(robot);
                },
                // Isolate the grip from balance: hold the actual robot's pose
                // still, with its production colliders and ball constraints.
                |mut commands: Commands,
                 bodies: Query<Entity, (With<RigidBody>, Without<Basketball>)>| {
                    for body in &bodies {
                        commands.entity(body).insert(RigidBody::Static);
                    }
                },
            )
                .chain(),
        );
        app.finish();
        app.cleanup();
        app.update();
        app.update();
        app
    }

    fn ball(app: &mut App) -> Entity {
        app.world_mut()
            .query_filtered::<Entity, With<Basketball>>()
            .single(app.world())
            .unwrap()
    }

    fn assert_released(app: &App, dropped: bool) {
        let grip = app.world().resource::<BallGrip>();
        assert!(grip.released);
        assert_eq!(grip.dropped, dropped);
        for joint in grip.joints {
            assert!(app.world().get::<JointDisabled>(joint).is_some());
        }
    }

    #[test]
    fn supported_ball_stays_in_the_cradle_at_both_substep_counts() {
        for substeps in [12, 24] {
            let mut app = app(substeps);
            let ball = ball(&mut app);
            let start = app.world().get::<Position>(ball).unwrap().0;
            for _ in 0..120 {
                app.update();
                assert!(!app.world().resource::<BallGrip>().released);
            }
            assert!(app.world().get::<Position>(ball).unwrap().0.distance(start) < 0.01);
        }
    }

    #[test]
    fn tipped_hands_drop_the_ball_without_a_release_action() {
        for substeps in [12, 24] {
            let mut app = app(substeps);
            let ball = ball(&mut app);
            let start = app.world().get::<Position>(ball).unwrap().0;
            let robot = app.world().resource::<RobotEntities>();
            let hands = [robot.right_hand, robot.left_hand];
            for hand in hands {
                let tilt = Quat::from_rotation_x(std::f32::consts::PI);
                let mut position = app.world_mut().get_mut::<Position>(hand).unwrap();
                position.0 = start + tilt * (position.0 - start);
                let mut rotation = app.world_mut().get_mut::<Rotation>(hand).unwrap();
                rotation.0 = tilt * rotation.0;
            }
            app.update();
            assert_released(&app, true);
            for _ in 0..25 {
                app.update();
            }
            assert!(app.world().get::<Position>(ball).unwrap().y < start.y - 0.1);
        }
    }

    #[test]
    fn separating_either_hand_breaks_both_grips_until_reset() {
        for left in [false, true] {
            let mut app = app(12);
            let robot = app.world().resource::<RobotEntities>();
            let hand = if left {
                robot.left_hand
            } else {
                robot.right_hand
            };
            app.world_mut().get_mut::<Position>(hand).unwrap().x += 0.15;
            app.update();
            assert_released(&app, true);
            for _ in 0..3 {
                app.update();
                assert_released(&app, true);
            }
            app.world_mut()
                .run_system_once(reset_robot_positions)
                .unwrap();
            for _ in 0..10 {
                app.update();
                let grip = app.world().resource::<BallGrip>();
                assert!(!grip.released && !grip.dropped);
                for joint in grip.joints {
                    assert!(app.world().get::<JointDisabled>(joint).is_none());
                }
            }
        }
    }

    #[test]
    fn an_impulse_can_overload_the_grip() {
        for substeps in [12, 24] {
            let mut app = app(substeps);
            let ball = ball(&mut app);
            app.world_mut().get_mut::<LinearVelocity>(ball).unwrap().0 = Vec3::X * 8.0;
            app.update();
            assert_released(&app, true);
            assert!(app.world().get::<LinearVelocity>(ball).unwrap().x > 0.0);
        }
    }

    #[test]
    fn excessive_constraint_force_breaks_the_grip() {
        for substeps in [12, 24] {
            let mut app = app(substeps);
            let ball = ball(&mut app);
            // Still within the slip tolerance, but the stretched cradle must
            // exert more than its finite holding force to recover the ball.
            app.world_mut().get_mut::<Position>(ball).unwrap().x += 0.02;
            app.update();
            assert_released(&app, true);
        }
    }

    #[test]
    fn uncontrolled_arm_motion_can_drop_the_ball() {
        use crate::robot::torque::{apply_torques, ComputedTorques, TorqueWriteQuery};
        let mut app = app(12);
        app.world_mut()
            .run_system_once(
                |mut commands: Commands, bodies: Query<Entity, With<RigidBody>>| {
                    for body in &bodies {
                        commands.entity(body).insert(RigidBody::Dynamic);
                    }
                },
            )
            .unwrap();
        app.add_systems(
            FixedUpdate,
            |mut torques: TorqueWriteQuery, mut step: Local<usize>| {
                *step += 1;
                let mut action = [0.0; crate::rl::ACT_DIM];
                for (joint, value) in action.iter_mut().take(6).enumerate() {
                    *value = ((*step / 20 + joint) % 3) as f32 - 1.0;
                }
                action[13] = -1.0;
                apply_torques(&mut torques, &ComputedTorques::from_action(&action));
            },
        );
        let ball = ball(&mut app);
        for _ in 0..100 {
            app.update();
            assert!(app.world().get::<Position>(ball).unwrap().0.is_finite());
        }
        assert_released(&app, true);
    }

    #[test]
    fn released_ball_collides_with_a_leg_and_preserves_its_velocity() {
        for substeps in [12, 24] {
            let mut app = app(substeps);
            let ball = ball(&mut app);
            app.world_mut().resource_mut::<Gravity>().0 = Vec3::ZERO;
            let velocity = Vec3::new(2.0, 3.0, -1.0);
            app.world_mut().get_mut::<LinearVelocity>(ball).unwrap().0 = velocity;
            app.world_mut()
                .run_system_once(|mut commands: Commands, mut grip: ResMut<BallGrip>| {
                    release_ball(&mut commands, &mut grip);
                })
                .unwrap();
            assert_released(&app, false);
            assert_eq!(app.world().get::<LinearVelocity>(ball).unwrap().0, velocity);
            let thigh = app.world().resource::<RobotEntities>().right_thigh;
            let center = app.world().get::<Position>(thigh).unwrap().0;
            app.world_mut().get_mut::<Position>(ball).unwrap().0 = center + Vec3::X * 0.6;
            app.world_mut().get_mut::<LinearVelocity>(ball).unwrap().0 = -Vec3::X * 5.0;
            let mut closest = f32::INFINITY;
            for _ in 0..25 {
                app.update();
                let x = app.world().get::<Position>(ball).unwrap().x - center.x;
                closest = closest.min(x);
                assert!(x > BALL_RADIUS + crate::robot::constants::THIGH_RADIUS - 0.015);
            }
            assert!(closest < 0.2, "ball must actually reach the leg");
        }
    }
}
