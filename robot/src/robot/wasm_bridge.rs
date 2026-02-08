use avian3d::prelude::*;
use bevy::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{ErrorEvent, MessageEvent, WebSocket};

use super::components::*;
use super::constants::*;
use super::observation::{compute_reward, get_observation};
use super::reset::get_initial_poses;
use super::resources::{ActionMsg, ObservationMsg, SimulationState, TrainStatsMsg};
use super::state::{extract_robot_state, JointReadQuery, RobotState};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum WsState {
    Connecting,
    Connected,
    Disconnected,
}

#[derive(Resource)]
pub struct WsBridge {
    socket: Option<WebSocket>,
    state: Rc<RefCell<WsState>>,
    action_queue: Rc<RefCell<Vec<ActionMsg>>>,
    url: String,
}

unsafe impl Send for WsBridge {}
unsafe impl Sync for WsBridge {}

impl WsBridge {
    pub fn new(url: &str) -> Self {
        Self {
            socket: None,
            state: Rc::new(RefCell::new(WsState::Disconnected)),
            action_queue: Rc::new(RefCell::new(Vec::new())),
            url: url.to_string(),
        }
    }

    pub fn connect(&mut self) {
        let ws = match WebSocket::new(&self.url) {
            Ok(ws) => ws,
            Err(e) => {
                web_sys::console::error_1(&format!("WebSocket creation failed: {:?}", e).into());
                return;
            }
        };

        update_ws_status("Connecting", "disconnected");

        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

        let state = Rc::clone(&self.state);
        let action_queue = Rc::clone(&self.action_queue);

        let state_open = Rc::clone(&state);
        let onopen_callback = Closure::<dyn FnMut()>::new(move || {
            web_sys::console::log_1(&"WebSocket connected".into());
            *state_open.borrow_mut() = WsState::Connected;
            update_ws_status("Connected", "connected");
        });
        ws.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
        onopen_callback.forget();

        let onerror_callback = Closure::<dyn FnMut(_)>::new(move |e: ErrorEvent| {
            web_sys::console::error_1(&format!("WebSocket error: {:?}", e.message()).into());
            update_ws_status("Disconnected", "disconnected");
        });
        ws.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
        onerror_callback.forget();

        let state_close = Rc::clone(&state);
        let onclose_callback = Closure::<dyn FnMut()>::new(move || {
            web_sys::console::log_1(&"WebSocket disconnected".into());
            *state_close.borrow_mut() = WsState::Disconnected;
            update_ws_status("Disconnected", "disconnected");
        });
        ws.set_onclose(Some(onclose_callback.as_ref().unchecked_ref()));
        onclose_callback.forget();

        let action_queue_msg = Rc::clone(&action_queue);
        let onmessage_callback = Closure::<dyn FnMut(_)>::new(move |e: MessageEvent| {
            if let Ok(txt) = e.data().dyn_into::<js_sys::JsString>() {
                let s: String = txt.into();
                if let Ok(action) = serde_json::from_str::<ActionMsg>(&s) {
                    action_queue_msg.borrow_mut().push(action);
                }
            }
        });
        ws.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
        onmessage_callback.forget();

        *self.state.borrow_mut() = WsState::Connecting;
        self.socket = Some(ws);
    }

    pub fn send_observation(&self, obs: &ObservationMsg) {
        if let Some(ws) = &self.socket {
            if let Ok(json) = serde_json::to_string(obs) {
                let _ = ws.send_with_str(&json);
            }
        }
    }

    pub fn get_action(&self) -> Option<ActionMsg> {
        self.action_queue.borrow_mut().pop()
    }

    pub fn is_connected(&self) -> bool {
        *self.state.borrow() == WsState::Connected
    }
}

fn update_ws_status(text: &str, class_name: &str) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Some(document) = window.document() else {
        return;
    };
    let Ok(Some(status)) = document.query_selector("#status span") else {
        return;
    };
    status.set_text_content(Some(text));
    status.set_attribute("class", class_name).ok();
}

fn update_training_stats(stats: &TrainStatsMsg) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Some(document) = window.document() else {
        return;
    };

    if let Ok(Some(el)) = document.query_selector("#stat-buffer") {
        el.set_text_content(Some(&format!("{}", stats.buffer_size)));
    }
    if let Ok(Some(el)) = document.query_selector("#stat-steps") {
        el.set_text_content(Some(&format!("{}", stats.train_steps)));
    }
    if let Ok(Some(el)) = document.query_selector("#stat-episodes") {
        el.set_text_content(Some(&format!("{}", stats.episodes)));
    }
    if let Ok(Some(el)) = document.query_selector("#stat-avg-reward") {
        el.set_text_content(Some(&format!("{:.2}", stats.avg_reward)));
    }
    if let Ok(Some(el)) = document.query_selector("#stat-recent-reward") {
        el.set_text_content(Some(&format!("{:.2}", stats.recent_reward)));
    }
}

pub fn ws_connection_system(mut bridge: ResMut<WsBridge>) {
    if !bridge.is_connected() && bridge.socket.is_none() {
        bridge.connect();
    }
}

const MAX_JOINT_TORQUE: f32 = 10.0;
const STAB_BLEND: f32 = 0.8;
const TORSO_UP_KP: f32 = 5.0;
const TORSO_UP_KD: f32 = 2.0;
const TORSO_TILT_KP: f32 = 8.0;
const TORSO_TILT_KD: f32 = 3.0;
const LEG_KP: f32 = 5.0;
const LEG_KD: f32 = 2.0;
const HIP_REST: f32 = 0.0;
const KNEE_REST: f32 = 0.05;
const ANKLE_REST: f32 = 0.0;
const RELEASE_THRESHOLD: f32 = 0.2;

fn clamp_torque(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(-MAX_JOINT_TORQUE, MAX_JOINT_TORQUE)
    } else {
        0.0
    }
}

fn is_out_of_bounds(pos: Vec3) -> bool {
    pos.x < BOUNDS_X_MIN
        || pos.x > BOUNDS_X_MAX
        || pos.z < BOUNDS_Z_MIN
        || pos.z > BOUNDS_Z_MAX
        || pos.y < BOUNDS_Y_MIN
}

#[derive(Debug, Clone, Default)]
struct ComputedTorques {
    torso: Vec3,
    shoulder: f32,
    elbow: f32,
    wrist: f32,
    left_shoulder: f32,
    left_elbow: f32,
    left_wrist: f32,
    left_hip: f32,
    left_knee: f32,
    left_ankle: f32,
    right_hip: f32,
    right_knee: f32,
    right_ankle: f32,
}

impl ComputedTorques {
    fn from_action_with_stabilization(action: &[f32], state: &RobotState) -> Self {
        let shoulder = clamp_torque(action.get(0).copied().unwrap_or(0.0) * SHOULDER_TORQUE_SCALE);
        let elbow = clamp_torque(action.get(1).copied().unwrap_or(0.0) * ELBOW_TORQUE_SCALE);
        let wrist = clamp_torque(action.get(2).copied().unwrap_or(0.0) * WRIST_TORQUE_SCALE);
        let left_shoulder =
            clamp_torque(action.get(3).copied().unwrap_or(0.0) * SHOULDER_TORQUE_SCALE);
        let left_elbow = clamp_torque(action.get(4).copied().unwrap_or(0.0) * ELBOW_TORQUE_SCALE);
        let left_wrist = clamp_torque(action.get(5).copied().unwrap_or(0.0) * WRIST_TORQUE_SCALE);

        let torso_stab = (-TORSO_UP_KP * state.torso.angle) + (-TORSO_UP_KD * state.torso.velocity);

        let up = state.torso_up.normalize_or_zero();
        let tilt_axis = up.cross(Vec3::Y);
        let tilt_mag = tilt_axis.length();
        let tilt_dir = if tilt_mag > 1e-4 {
            tilt_axis / tilt_mag
        } else {
            Vec3::ZERO
        };
        let tilt_torque = tilt_dir * (TORSO_TILT_KP * tilt_mag);
        let damp_xy = Vec3::new(state.torso_ang_vel.x, state.torso_ang_vel.y, 0.0) * TORSO_TILT_KD;
        let torso_xy_torque = tilt_torque - damp_xy;

        let torso = Vec3::new(
            clamp_torque(torso_xy_torque.x),
            clamp_torque(torso_xy_torque.y),
            clamp_torque(
                action.get(6).copied().unwrap_or(0.0) * TORSO_TORQUE_SCALE
                    + STAB_BLEND * torso_stab,
            ),
        );

        let forward_lean = state.torso_up.x.clamp(-0.5, 0.5);
        let hip_compensation = -forward_lean * 1.2;

        let left_hip_stab = (HIP_REST + hip_compensation - state.left_hip.angle) * LEG_KP
            + (-state.left_hip.velocity * LEG_KD);
        let left_knee_stab =
            (KNEE_REST - state.left_knee.angle) * LEG_KP + (-state.left_knee.velocity * LEG_KD);
        let left_ankle_stab =
            (ANKLE_REST - state.left_ankle.angle) * LEG_KP + (-state.left_ankle.velocity * LEG_KD);
        let right_hip_stab = (HIP_REST + hip_compensation - state.right_hip.angle) * LEG_KP
            + (-state.right_hip.velocity * LEG_KD);
        let right_knee_stab =
            (KNEE_REST - state.right_knee.angle) * LEG_KP + (-state.right_knee.velocity * LEG_KD);
        let right_ankle_stab = (ANKLE_REST - state.right_ankle.angle) * LEG_KP
            + (-state.right_ankle.velocity * LEG_KD);

        Self {
            torso,
            shoulder,
            elbow,
            wrist,
            left_shoulder,
            left_elbow,
            left_wrist,
            left_hip: clamp_torque(
                action.get(7).copied().unwrap_or(0.0) * HIP_TORQUE_SCALE
                    + STAB_BLEND * left_hip_stab,
            ),
            left_knee: clamp_torque(
                action.get(8).copied().unwrap_or(0.0) * KNEE_TORQUE_SCALE
                    + STAB_BLEND * left_knee_stab,
            ),
            left_ankle: clamp_torque(
                action.get(9).copied().unwrap_or(0.0) * ANKLE_TORQUE_SCALE
                    + STAB_BLEND * left_ankle_stab,
            ),
            right_hip: clamp_torque(
                action.get(10).copied().unwrap_or(0.0) * HIP_TORQUE_SCALE
                    + STAB_BLEND * right_hip_stab,
            ),
            right_knee: clamp_torque(
                action.get(11).copied().unwrap_or(0.0) * KNEE_TORQUE_SCALE
                    + STAB_BLEND * right_knee_stab,
            ),
            right_ankle: clamp_torque(
                action.get(12).copied().unwrap_or(0.0) * ANKLE_TORQUE_SCALE
                    + STAB_BLEND * right_ankle_stab,
            ),
        }
    }
}

type TorqueWriteQuery<'w, 's> = Query<
    'w,
    's,
    (
        &'static mut ConstantTorque,
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

fn apply_torques(query: &mut TorqueWriteQuery, torques: &ComputedTorques) {
    for (
        mut torque,
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
    ) in query.iter_mut()
    {
        if torso.is_some() {
            *torque = ConstantTorque::new(torques.torso.x, torques.torso.y, torques.torso.z);
        } else if upper.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.shoulder);
        } else if forearm.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.elbow);
        } else if hand.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.wrist);
        } else if left_upper.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_shoulder);
        } else if left_forearm.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_elbow);
        } else if left_hand.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_wrist);
        } else if left_thigh.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_hip);
        } else if left_shin.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_knee);
        } else if left_foot.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.left_ankle);
        } else if right_thigh.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.right_hip);
        } else if right_shin.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.right_knee);
        } else if right_foot.is_some() {
            *torque = ConstantTorque::new(0.0, 0.0, torques.right_ankle);
        }
    }
}

pub fn wasm_simulation_loop(
    mut commands: Commands,
    mut sim: ResMut<SimulationState>,
    bridge: Res<WsBridge>,
    joint_query: JointReadQuery,
    mut joint_write_q: TorqueWriteQuery,
    ball_query: Query<(&Transform, &LinearVelocity), With<Basketball>>,
    torso_query: Query<(&Transform, &AngularVelocity), With<RobotTorso>>,
) {
    const MAX_EPISODE_STEPS: usize = 300;
    const TORSO_FALL_Y: f32 = 0.40;
    const SETTLE_STEPS: usize = 60;

    if let Some(action_msg) = bridge.get_action() {
        sim.last_action = action_msg.action;

        if let Some(ref stats) = action_msg.stats {
            update_training_stats(stats);
        }
    }

    if let Some(robot_state) = extract_robot_state(&joint_query) {
        let (ball_pos, ball_vel) = if let Ok((ball_tf, ball_lin)) = ball_query.single() {
            (ball_tf.translation, ball_lin.0)
        } else {
            (Vec3::ZERO, Vec3::ZERO)
        };

        let (torso_pos, torso_angle, torso_ang_vel) =
            if let Ok((torso_tf, torso_av)) = torso_query.single() {
                let (_, pitch, _) = torso_tf.rotation.to_euler(EulerRot::XYZ);
                (torso_tf.translation, pitch, torso_av.z)
            } else {
                (Vec3::new(0.0, 1.0, 0.0), 0.0, 0.0)
            };

        let torques = if sim.step < SETTLE_STEPS {
            ComputedTorques::default()
        } else {
            ComputedTorques::from_action_with_stabilization(&sim.last_action, &robot_state)
        };
        apply_torques(&mut joint_write_q, &torques);

        let release_signal = sim.last_action.get(13).copied().unwrap_or(0.0);
        if !sim.ball_released && release_signal > RELEASE_THRESHOLD && sim.step > 10 {
            for grip_entity in sim.grip_joints.drain(..) {
                commands.entity(grip_entity).despawn();
            }
            sim.ball_released = true;
        }

        let fallen = torso_pos.y < TORSO_FALL_Y && sim.step > SETTLE_STEPS;
        let timeout = sim.step >= MAX_EPISODE_STEPS;
        let out_of_bounds = is_out_of_bounds(torso_pos) || is_out_of_bounds(ball_pos);
        let done = fallen || timeout || out_of_bounds;

        if out_of_bounds {
            web_sys::console::log_1(
                &format!(
                    "[WASM] Out of bounds - torso: {:?}, ball: {:?}",
                    torso_pos, ball_pos
                )
                .into(),
            );
        }

        let reward = compute_reward(
            ball_pos,
            ball_vel,
            sim.ball_released,
            done,
            torso_pos,
            torso_angle,
            torso_ang_vel,
        );

        let joint_angles = robot_state.joint_angles();
        let joint_vels = robot_state.joint_velocities();
        let obs = get_observation(&joint_angles, &joint_vels, ball_pos, ball_vel);

        let obs_msg = ObservationMsg {
            obs,
            reward,
            done,
            step: sim.step as u64,
            ball_released: sim.ball_released,
        };
        bridge.send_observation(&obs_msg);

        if done {
            sim.needs_reset = true;
        }
    }

    sim.step += 1;
}

pub fn draw_gizmos_wasm(mut gizmos: Gizmos, ball_q: Query<&Transform, With<Basketball>>) {
    let hoop_center = Vec3::new(HOOP_X, HOOP_Y, 0.0);
    gizmos.circle(hoop_center, HOOP_RADIUS, Color::srgb(1.0, 0.5, 0.0));

    if let Ok(ball_tf) = ball_q.single() {
        gizmos.line(ball_tf.translation, hoop_center, Color::srgb(0.5, 0.5, 1.0));
    }
}

fn reset_body(
    transform: &mut Transform,
    lin_vel: &mut LinearVelocity,
    ang_vel: &mut AngularVelocity,
    position: Vec3,
    rotation: Quat,
) {
    transform.translation = position;
    transform.rotation = rotation;
    *lin_vel = LinearVelocity(Vec3::ZERO);
    *ang_vel = AngularVelocity(Vec3::ZERO);
}

pub fn wasm_reset_system(
    mut commands: Commands,
    mut sim: ResMut<SimulationState>,
    mut torso_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotTorso>,
    >,
    mut ball_q: Query<
        (
            Entity,
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
        ),
        (With<Basketball>, Without<RobotTorso>),
    >,
    mut upper_arm_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotUpperArm>,
    >,
    mut forearm_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotForearm>,
    >,
    mut hand_q: Query<
        (
            Entity,
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
        ),
        With<RobotHand>,
    >,
    mut left_upper_arm_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotLeftUpperArm>,
    >,
    mut left_forearm_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotLeftForearm>,
    >,
    mut left_hand_q: Query<
        (
            Entity,
            &mut Transform,
            &mut LinearVelocity,
            &mut AngularVelocity,
        ),
        With<RobotLeftHand>,
    >,
    mut left_thigh_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotLeftThigh>,
    >,
    mut left_shin_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotLeftShin>,
    >,
    mut left_foot_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotLeftFoot>,
    >,
    mut right_thigh_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotRightThigh>,
    >,
    mut right_shin_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotRightShin>,
    >,
    mut right_foot_q: Query<
        (&mut Transform, &mut LinearVelocity, &mut AngularVelocity),
        With<RobotRightFoot>,
    >,
) {
    if !sim.needs_reset {
        return;
    }

    let poses = get_initial_poses();

    if let Ok((mut tf, mut lv, mut av)) = torso_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.torso.position,
            poses.torso.rotation,
        );
    }

    if let Ok((mut tf, mut lv, mut av)) = upper_arm_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.upper_arm.position,
            poses.upper_arm.rotation,
        );
    }
    if let Ok((mut tf, mut lv, mut av)) = forearm_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.forearm.position,
            poses.forearm.rotation,
        );
    }
    let hand_entity = if let Ok((entity, mut tf, mut lv, mut av)) = hand_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.hand.position,
            poses.hand.rotation,
        );
        Some(entity)
    } else {
        None
    };

    if let Ok((mut tf, mut lv, mut av)) = left_upper_arm_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.left_upper_arm.position,
            poses.left_upper_arm.rotation,
        );
    }
    if let Ok((mut tf, mut lv, mut av)) = left_forearm_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.left_forearm.position,
            poses.left_forearm.rotation,
        );
    }
    let left_hand_entity = if let Ok((entity, mut tf, mut lv, mut av)) = left_hand_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.left_hand.position,
            poses.left_hand.rotation,
        );
        Some(entity)
    } else {
        None
    };

    if let Ok((mut tf, mut lv, mut av)) = left_thigh_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.left_thigh.position,
            poses.left_thigh.rotation,
        );
    }
    if let Ok((mut tf, mut lv, mut av)) = left_shin_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.left_shin.position,
            poses.left_shin.rotation,
        );
    }
    if let Ok((mut tf, mut lv, mut av)) = left_foot_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.left_foot.position,
            poses.left_foot.rotation,
        );
    }

    if let Ok((mut tf, mut lv, mut av)) = right_thigh_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.right_thigh.position,
            poses.right_thigh.rotation,
        );
    }
    if let Ok((mut tf, mut lv, mut av)) = right_shin_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.right_shin.position,
            poses.right_shin.rotation,
        );
    }
    if let Ok((mut tf, mut lv, mut av)) = right_foot_q.single_mut() {
        reset_body(
            &mut tf,
            &mut lv,
            &mut av,
            poses.right_foot.position,
            poses.right_foot.rotation,
        );
    }

    let ball_entity = if let Ok((entity, mut tf, mut lv, mut av)) = ball_q.single_mut() {
        let hands_mid = (poses.hand.position + poses.left_hand.position) / 2.0;
        let ball_pos = hands_mid + Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0);
        reset_body(&mut tf, &mut lv, &mut av, ball_pos, Quat::IDENTITY);
        Some(entity)
    } else {
        None
    };

    if sim.ball_released {
        if let (Some(ball), Some(hand), Some(left_hand)) =
            (ball_entity, hand_entity, left_hand_entity)
        {
            let right_grip = commands
                .spawn((
                    BallGrip,
                    FixedJoint::new(hand, ball)
                        .with_local_anchor1(Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0))
                        .with_local_anchor2(Vec3::ZERO),
                ))
                .id();

            let left_grip = commands
                .spawn((
                    BallGrip,
                    FixedJoint::new(left_hand, ball)
                        .with_local_anchor1(Vec3::new(BALL_RADIUS + HAND_RADIUS + 0.02, 0.0, 0.0))
                        .with_local_anchor2(Vec3::ZERO),
                ))
                .id();

            sim.grip_joints = vec![right_grip, left_grip];
        }
    }

    sim.step = 0;
    sim.ball_released = false;
    sim.last_action = vec![0.0; 14];
    sim.needs_reset = false;
    sim.episode_count += 1;

    web_sys::console::log_1(&format!("[WASM] Episode {} reset complete", sim.episode_count).into());
}
