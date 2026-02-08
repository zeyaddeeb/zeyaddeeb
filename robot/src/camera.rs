use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    prelude::*,
};
use std::f32::consts::PI;

#[derive(Component)]
pub struct OrbitCamera {
    pub focus: Vec3,
    pub radius: f32,
    pub yaw: f32,
    pub pitch: f32,
}

pub fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(-3.0, 4.0, 8.0).looking_at(Vec3::new(0.0, 1.2, 0.0), Vec3::Y),
        OrbitCamera {
            focus: Vec3::new(0.0, 1.2, 0.0),
            radius: 8.0,
            yaw: -0.35,
            pitch: 0.25,
        },
    ));
}

pub fn orbit_camera(
    mut query: Query<(&mut Transform, &mut OrbitCamera)>,
    mouse_button: Res<ButtonInput<MouseButton>>,
    mouse_motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    let Ok((mut transform, mut orbit)) = query.single_mut() else {
        return;
    };

    if mouse_button.pressed(MouseButton::Left) {
        orbit.yaw -= mouse_motion.delta.x * 0.005;
        orbit.pitch -= mouse_motion.delta.y * 0.005;
        orbit.pitch = orbit.pitch.clamp(-PI / 3.0, PI / 3.0);
    }

    orbit.radius -= scroll.delta.y * 0.5;
    orbit.radius = orbit.radius.clamp(2.0, 25.0);

    let x = orbit.focus.x + orbit.radius * orbit.yaw.cos() * orbit.pitch.cos();
    let y = orbit.focus.y + orbit.radius * orbit.pitch.sin();
    let z = orbit.focus.z + orbit.radius * orbit.yaw.sin() * orbit.pitch.cos();
    transform.translation = Vec3::new(x, y, z);
    transform.look_at(orbit.focus, Vec3::Y);
}
