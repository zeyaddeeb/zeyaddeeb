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

impl Default for OrbitCamera {
    fn default() -> Self {
        let focus = Vec3::new(0.0, 1.2, 0.0);
        let offset = Vec3::new(-3.0, 4.0, 8.0) - focus;
        Self {
            focus,
            radius: offset.length(),
            yaw: offset.z.atan2(offset.x),
            pitch: (offset.y / offset.length()).asin(),
        }
    }
}

impl OrbitCamera {
    fn transform(&self) -> Transform {
        let offset = Vec3::new(
            self.yaw.cos() * self.pitch.cos(),
            self.pitch.sin(),
            self.yaw.sin() * self.pitch.cos(),
        ) * self.radius;
        Transform::from_translation(self.focus + offset).looking_at(self.focus, Vec3::Y)
    }
}

pub fn spawn_camera(mut commands: Commands) {
    let orbit = OrbitCamera::default();
    commands.spawn((Camera3d::default(), orbit.transform(), orbit));
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

    *transform = orbit.transform();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_orbit_update_preserves_the_side_view() {
        let mut app = App::new();
        app.init_resource::<ButtonInput<MouseButton>>()
            .init_resource::<AccumulatedMouseMotion>()
            .init_resource::<AccumulatedMouseScroll>()
            .add_systems(Startup, spawn_camera)
            .add_systems(Update, orbit_camera);
        app.update();
        let mut query = app.world_mut().query::<(&Transform, &OrbitCamera)>();
        let (transform, orbit) = query.single(app.world()).unwrap();
        assert!(transform
            .translation
            .abs_diff_eq(Vec3::new(-3.0, 4.0, 8.0), 1e-5));
        let screen_right = transform.rotation * Vec3::X;
        assert!(
            screen_right.dot(Vec3::X) > 0.9,
            "hoop must appear to the right"
        );
        assert!(orbit.radius > 8.0);
    }
}
