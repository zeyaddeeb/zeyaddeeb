use avian3d::prelude::*;
use bevy::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{ErrorEvent, MessageEvent, WebSocket};

use super::components::*;
use super::constants::*;
use super::observation::get_observation;
use super::resources::{ActionMsg, ObservationMsg, SimulationState};
use super::state::{extract_robot_state, JointReadQuery};

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

pub fn ws_connection_system(mut bridge: ResMut<WsBridge>) {
    if !bridge.is_connected() && bridge.socket.is_none() {
        bridge.connect();
    }
}

pub fn wasm_simulation_loop(
    mut sim: ResMut<SimulationState>,
    bridge: Res<WsBridge>,
    joint_query: JointReadQuery,
    ball_query: Query<(&Transform, &LinearVelocity), With<Basketball>>,
) {
    if let Some(action_msg) = bridge.get_action() {
        sim.last_action = action_msg.action;
    }

    if let Some(robot_state) = extract_robot_state(&joint_query) {
        let (ball_pos, ball_vel) = if let Ok((ball_tf, ball_lin)) = ball_query.single() {
            (ball_tf.translation, ball_lin.0)
        } else {
            (Vec3::ZERO, Vec3::ZERO)
        };

        let joint_angles = robot_state.joint_angles();
        let joint_vels = robot_state.joint_velocities();
        let obs = get_observation(&joint_angles, &joint_vels, ball_pos, ball_vel);

        let obs_msg = ObservationMsg {
            obs,
            reward: 0.0,
            done: false,
            step: sim.step as u64,
            ball_released: sim.ball_released,
        };
        bridge.send_observation(&obs_msg);
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
