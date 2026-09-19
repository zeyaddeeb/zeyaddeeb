use super::action_mailbox::ActionMailbox;
use avian3d::prelude::{Physics, PhysicsTime};
use bevy::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{MessageEvent, WebSocket};

use super::episode::*;
use super::observation::{
    compute_reward_components, get_observation, release_reward, BASKET_REWARD,
};
use super::reset::release_ball;
use super::resources::CurriculumStage;
use super::resources::{ActionMsg, BallGrip, ObservationMsg, SimulationState, TrainStatsMsg};
use super::state::{extract_robot_state, BallQuery, JointReadQuery};
use super::torque::{apply_torques, ComputedTorques, TorqueWriteQuery};
use crate::rl::EPISODE_STEPS;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum WsState {
    Connecting,
    Connected,
    Disconnected,
}

const RETRY_MIN_SECS: f32 = 2.0;
const RETRY_MAX_SECS: f32 = 60.0;
const RETRY_RESET_SECS: f32 = 10.0;

type WsCallbacks = (
    Closure<dyn FnMut()>,
    Closure<dyn FnMut()>,
    Closure<dyn FnMut()>,
    Closure<dyn FnMut(MessageEvent)>,
);

#[derive(Resource)]
pub struct WsBridge {
    socket: Option<WebSocket>,
    state: Rc<RefCell<WsState>>,
    mailbox: Rc<RefCell<ActionMailbox>>,
    pending: Option<ObservationMsg>,
    pending_seconds: f32,
    callbacks: Option<WsCallbacks>,
    url: String,
    retry_in: f32,
    retry_delay: f32,
    alive: f32,
}

unsafe impl Send for WsBridge {}
unsafe impl Sync for WsBridge {}

impl WsBridge {
    pub fn new(url: &str) -> Self {
        Self {
            socket: None,
            state: Rc::new(RefCell::new(WsState::Disconnected)),
            mailbox: Rc::new(RefCell::new(ActionMailbox::default())),
            pending: None,
            pending_seconds: 0.0,
            callbacks: None,
            url: url.to_string(),
            retry_in: 0.0,
            retry_delay: RETRY_MIN_SECS,
            alive: 0.0,
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
        let mailbox = Rc::clone(&self.mailbox);

        let state_open = Rc::clone(&state);
        let onopen_callback = Closure::<dyn FnMut()>::new(move || {
            *state_open.borrow_mut() = WsState::Connected;
            update_ws_status("Connected", "connected");
        });
        ws.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));

        let onerror_callback = Closure::<dyn FnMut()>::new(move || {
            web_sys::console::error_1(&"WebSocket error".into());
            update_ws_status("Disconnected", "disconnected");
        });
        ws.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));

        let state_close = Rc::clone(&state);
        let onclose_callback = Closure::<dyn FnMut()>::new(move || {
            *state_close.borrow_mut() = WsState::Disconnected;
            update_ws_status("Disconnected", "disconnected");
        });
        ws.set_onclose(Some(onclose_callback.as_ref().unchecked_ref()));

        let onmessage_callback = Closure::<dyn FnMut(_)>::new(move |e: MessageEvent| {
            if let Ok(txt) = e.data().dyn_into::<js_sys::JsString>() {
                let s: String = txt.into();
                if let Ok(action) = serde_json::from_str::<ActionMsg>(&s) {
                    mailbox.borrow_mut().receive(action);
                }
            }
        });
        ws.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
        self.callbacks = Some((
            onopen_callback,
            onerror_callback,
            onclose_callback,
            onmessage_callback,
        ));

        self.alive = 0.0;
        *self.state.borrow_mut() = WsState::Connecting;
        self.socket = Some(ws);
    }

    fn disconnect(&mut self) {
        if let Some(socket) = self.socket.take() {
            socket.set_onopen(None);
            socket.set_onclose(None);
            socket.set_onerror(None);
            socket.set_onmessage(None);
            let _ = socket.close();
        }
        self.callbacks = None;
        self.mailbox.borrow_mut().cancel();
        self.pending = None;
        self.pending_seconds = 0.0;
        *self.state.borrow_mut() = WsState::Disconnected;
    }

    pub fn send_observation(&mut self, mut obs: ObservationMsg) {
        let Some(id) = self.mailbox.borrow_mut().begin(obs.episode) else {
            return;
        };
        obs.request_id = id;
        if let Some(ws) = &self.socket {
            if let Ok(json) = serde_json::to_string(&obs) {
                if ws.send_with_str(&json).is_ok() {
                    self.pending = Some(obs);
                    self.pending_seconds = 0.0;
                    return;
                }
            }
        }
        self.disconnect();
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

    if let Some(el) = document.get_element_by_id("stat-buffer") {
        el.set_text_content(Some(&stats.buffer_size.to_string()));
    }
    if let Some(el) = document.get_element_by_id("stat-steps") {
        el.set_text_content(Some(&stats.train_steps.to_string()));
    }
    if let Some(el) = document.get_element_by_id("stat-episodes") {
        el.set_text_content(Some(&stats.episodes.to_string()));
    }
    if let Some(el) = document.get_element_by_id("stat-avg-reward") {
        el.set_text_content(Some(&format!("{:.2}", stats.avg_reward)));
    }
    if let Some(el) = document.get_element_by_id("stat-recent-reward") {
        el.set_text_content(Some(&format!("{:.2}", stats.recent_reward)));
    }
}

pub fn ws_connection_system(mut bridge: ResMut<WsBridge>, time: Res<Time<Real>>) {
    let state = *bridge.state.borrow();
    match state {
        WsState::Connecting => {
            bridge.alive += time.delta_secs();
            if bridge.alive > 15.0 {
                bridge.disconnect();
            }
        }
        WsState::Connected => {
            if bridge.pending.is_some() {
                bridge.pending_seconds += time.delta_secs();
                if bridge.pending_seconds > 10.0 {
                    bridge.disconnect();
                    return;
                }
            }
            bridge.alive += time.delta_secs();
            if bridge.alive > RETRY_RESET_SECS {
                bridge.retry_delay = RETRY_MIN_SECS;
            }
        }
        WsState::Disconnected => {
            if bridge.socket.is_some() {
                bridge.disconnect();
                bridge.alive = 0.0;
                bridge.retry_in = bridge.retry_delay;
                bridge.retry_delay = (bridge.retry_delay * 2.0).min(RETRY_MAX_SECS);
            }
            bridge.retry_in -= time.delta_secs();
            if bridge.retry_in <= 0.0 {
                bridge.connect();
                if bridge.socket.is_none() {
                    bridge.retry_in = bridge.retry_delay;
                }
            }
        }
    }
}

pub fn wasm_training_loop(
    mut sim: ResMut<SimulationState>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery, BallQuery)>,
    mut bridge: ResMut<WsBridge>,
    mut physics_time: ResMut<Time<Physics>>,
    mut commands: Commands,
    mut grip: Option<ResMut<BallGrip>>,
) {
    // Avian retains its previous delta on pause; zero it to avoid an extra step.
    physics_time.pause();
    physics_time.advance_by(std::time::Duration::ZERO);
    if sim.needs_reset {
        return;
    }
    if sim.cooldown > 0 {
        sim.cooldown -= 1;
        physics_time.unpause();
        return;
    }
    if !bridge.is_connected() {
        return;
    }
    sim.ball_released |= grip.as_deref().is_some_and(|grip| grip.released);
    if bridge.pending.is_some() {
        let response = bridge.mailbox.borrow_mut().take();
        if let Some(response) = response {
            let request = bridge.pending.take().unwrap();
            if request.episode != sim.episode as u64 {
                return;
            }
            if let Some(stats) = response.stats {
                let stage = stats.curriculum_stage.map(CurriculumStage::from_index);
                update_training_stats(&stats);
                sim.server_stats = Some(stats);
                if sim.step == 0 && stage.is_some_and(|stage| stage != sim.curriculum_stage) {
                    sim.curriculum_stage = stage.unwrap();
                    // Request an action for the corrected context before the first physics step.
                    return;
                }
            }
            let action = response.action;
            apply_torques(&mut queries.p1(), &ComputedTorques::from_action(&action));
            if sim.ball_released {
                sim.steps_since_release += 1;
            } else if should_release(sim.curriculum_stage, sim.step, action[13]) {
                sim.ball_released = true;
                if let Some(grip) = grip.as_deref_mut() {
                    release_ball(&mut commands, grip);
                }
            }
            sim.prev_obs = Some(request.obs);
            sim.prev_action = Some(action);
            sim.step += 1;
            physics_time.unpause();
        }
        return;
    }

    let state = {
        let q = queries.p0();
        extract_robot_state(&q)
    };

    let Some(state) = state else { return };

    let (ball_pos, ball_v) = {
        let q = queries.p2();
        let Ok((pos, lin_vel, _)) = q.single() else {
            return;
        };
        (pos.0, lin_vel.0)
    };

    let obs = get_observation(
        &state,
        ball_pos,
        ball_v,
        sim.ball_released,
        sim.curriculum_stage,
        sim.step,
    );

    let end_reason = EpisodeEndReason::check(
        ball_pos,
        sim.prev_ball_pos,
        state.torso_pos,
        state.torso_up,
        sim.ball_released,
        sim.step,
        EPISODE_STEPS,
    );
    let terminal = end_reason.is_some_and(|r| r.is_terminal());

    let mut reward = 0.0;
    if let Some(prev_action) = sim.prev_action.take() {
        let comps = compute_reward_components(
            &state,
            &prev_action,
            ball_pos,
            ball_v,
            sim.ball_released,
            sim.curriculum_stage,
        );

        reward = comps.stand + comps.throw;
        if sim.ball_released
            && sim.steps_since_release == 0
            && grip.as_deref().is_none_or(|grip| !grip.dropped)
        {
            reward += release_reward(ball_pos, ball_v);
        }
        if end_reason == Some(EpisodeEndReason::BasketMade) {
            reward += BASKET_REWARD;
        } else if end_reason.is_some() && sim.curriculum_stage == CurriculumStage::Shooting {
            reward -= 5.0;
        }
        sim.episode_reward += reward;
    }

    sim.prev_ball_pos = Some(ball_pos);
    bridge.send_observation(ObservationMsg {
        protocol_version: crate::rl::ENVIRONMENT_VERSION,
        episode: sim.episode as u64,
        request_id: 0, // Assigned by the mailbox, monotonically across resets/reconnects.
        obs,
        reward,
        done: end_reason.is_some(),
        truncated: end_reason.is_some() && !terminal,
        step: sim.step as u64,
        ball_released: sim.ball_released,
    });
    if let Some(reason) = end_reason {
        finish_episode(&mut sim, reason, ball_pos);
        bridge.mailbox.borrow_mut().cancel();
        bridge.pending = None;
        apply_torques(&mut queries.p1(), &ComputedTorques::default());
    }
}

fn finish_episode(sim: &mut SimulationState, reason: EpisodeEndReason, _ball_pos: Vec3) {
    if !sim.episode_reward_ema_initialized {
        sim.episode_reward_ema = sim.episode_reward;
        sim.episode_reward_ema_initialized = true;
    } else {
        sim.episode_reward_ema = 0.95 * sim.episode_reward_ema + 0.05 * sim.episode_reward;
    }

    if sim.episode_reward > sim.best_episode_reward {
        sim.best_episode_reward = sim.episode_reward;
    }

    if reason == EpisodeEndReason::BasketMade {
        sim.baskets_made += 1;
    }

    if let Some(stage) = sim.server_stats.as_ref().and_then(|s| s.curriculum_stage) {
        sim.curriculum_stage = CurriculumStage::from_index(stage);
    }

    sim.needs_reset = true;
    sim.cooldown = RESET_COOLDOWN;
    sim.episode += 1;
    sim.step = 0;
    sim.episode_reward = 0.0;
    sim.ball_released = false;
    sim.steps_since_release = 0;
    sim.prev_ball_pos = None;
    sim.prev_obs = None;
    sim.prev_action = None;
    sim.last_action = None;
}
