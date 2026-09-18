use bevy::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{ErrorEvent, MessageEvent, WebSocket};

use super::episode::*;
use super::observation::{
    compute_reward_components, get_observation, release_reward, BASKET_REWARD,
};
use super::resources::CurriculumStage;
use super::resources::{ActionMsg, ObservationMsg, SimulationState, TrainStatsMsg};
use super::state::{extract_robot_state, BallQuery, JointReadQuery};
use super::torque::{apply_torques, ComputedTorques, TorqueWriteQuery};
use crate::rl::{ACT_DIM, EPISODE_STEPS};

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
        self.action_queue.borrow_mut().drain(..).last()
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

pub fn ws_connection_system(mut bridge: ResMut<WsBridge>) {
    if !bridge.is_connected() && bridge.socket.is_none() {
        bridge.connect();
    }
}

pub fn wasm_training_loop(
    mut sim: ResMut<SimulationState>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery, BallQuery)>,
    bridge: Option<Res<WsBridge>>,
) {
    if sim.needs_reset {
        return;
    }

    if sim.cooldown > 0 {
        sim.cooldown -= 1;
        return;
    }

    let state = {
        let q = queries.p0();
        extract_robot_state(&q)
    };

    let Some(state) = state else { return };

    let (ball_pos, ball_v) = {
        let mut q = queries.p2();
        let Ok((mut pos, mut lin_vel, mut ang_vel)) = q.single_mut() else {
            return;
        };
        if !sim.ball_released {
            pos.0 = held_ball_position(state.hand_pos);
            lin_vel.0 = state.hand_vel;
            ang_vel.0 = Vec3::ZERO;
        }
        (pos.0, lin_vel.0)
    };

    let obs = get_observation(&state, ball_pos, ball_v, sim.ball_released);

    let end_reason = EpisodeEndReason::check(
        ball_pos,
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
        if sim.ball_released && sim.steps_since_release == 0 {
            reward += release_reward(ball_pos, ball_v);
        }
        if end_reason == Some(EpisodeEndReason::BasketMade) {
            reward += BASKET_REWARD;
        }
        sim.episode_reward += reward;
    }

    let connected = bridge.as_ref().is_some_and(|b| b.is_connected());
    if let Some(bridge) = bridge.as_ref().filter(|_| connected) {
        bridge.send_observation(&ObservationMsg {
            obs: obs.clone(),
            reward,
            done: end_reason.is_some(),
            truncated: end_reason.is_some() && !terminal,
            step: sim.step as u64,
            ball_released: sim.ball_released,
        });
    }

    if let Some(reason) = end_reason {
        finish_episode(&mut sim, reason, ball_pos);
        let mut q = queries.p1();
        apply_torques(&mut q, &ComputedTorques::default());
        return;
    }

    let fresh = bridge
        .as_ref()
        .filter(|_| connected)
        .and_then(|b| b.get_action());
    let mut action = match fresh {
        Some(action_msg) => {
            if let Some(stats) = action_msg.stats {
                if let Some(stage) = stats.curriculum_stage {
                    sim.curriculum_stage = CurriculumStage::from_index(stage);
                }
                update_training_stats(&stats);
                sim.server_stats = Some(stats);
            }
            action_msg.action
        }
        None => sim
            .last_action
            .clone()
            .unwrap_or_else(|| vec![0.0; ACT_DIM]),
    };

    action.resize(ACT_DIM, 0.0);
    for a in action.iter_mut() {
        if !a.is_finite() {
            *a = 0.0;
        }
        *a = a.clamp(-1.0, 1.0);
    }

    let torques = ComputedTorques::from_action(&action);
    {
        let mut q = queries.p1();
        apply_torques(&mut q, &torques);
    }

    if sim.ball_released {
        sim.steps_since_release += 1;
    } else if should_release(sim.curriculum_stage, sim.step, action[13]) {
        sim.ball_released = true;
    }

    sim.prev_obs = Some(obs);
    sim.last_action = Some(action.clone());
    sim.prev_action = Some(action);
    sim.prev_torso_pos = Some(state.torso_pos);
    sim.prev_left_foot_pos = Some(state.left_foot_pos);
    sim.prev_right_foot_pos = Some(state.right_foot_pos);
    sim.step += 1;
}

fn finish_episode(sim: &mut SimulationState, reason: EpisodeEndReason, ball_pos: Vec3) {
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

    if reason.is_stage_success(sim.curriculum_stage, ball_pos) {
        sim.stage_success_streak += 1;
    } else {
        sim.stage_success_streak = 0;
    }
    sim.stage_episodes += 1;

    if sim.stage_episodes >= STAGE_MIN_EPISODES && sim.stage_success_streak >= STAGE_SUCCESS_STREAK
    {
        if let Some(stage) = next_stage(sim.curriculum_stage) {
            web_sys::console::log_1(
                &format!(
                    "Advancing to {} after {} episodes",
                    stage.as_str(),
                    sim.stage_episodes
                )
                .into(),
            );
            sim.curriculum_stage = stage;
            sim.stage_episodes = 0;
            sim.stage_success_streak = 0;
        }
    }

    web_sys::console::log_1(
        &format!(
            "Episode {} ended: {} after {} steps | Reward: {:.2} | EMA: {:.2} | Baskets: {}/{}",
            sim.episode,
            reason.as_str(),
            sim.step,
            sim.episode_reward,
            sim.episode_reward_ema,
            sim.baskets_made,
            sim.episode + 1
        )
        .into(),
    );

    sim.needs_reset = true;
    sim.cooldown = RESET_COOLDOWN;
    sim.episode += 1;
    sim.step = 0;
    sim.episode_reward = 0.0;
    sim.ball_released = false;
    sim.steps_since_release = 0;
    sim.prev_obs = None;
    sim.prev_action = None;
    sim.last_action = None;
}
