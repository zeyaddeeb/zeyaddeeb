use avian3d::prelude::*;
use bevy::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{ErrorEvent, MessageEvent, WebSocket};

use super::components::*;
use super::constants::*;
use super::observation::{compute_reward_components, get_observation};
use super::resources::CurriculumStage;
use super::resources::{ActionMsg, ObservationMsg, SimulationState, TrainStatsMsg};
use super::state::{extract_robot_state, JointReadQuery};
use super::torque::{apply_torques, ComputedTorques, TorqueWriteQuery};
use crate::rl::{ACT_DIM, EPISODE_STEPS};

const TORSO_FALL_Y: f32 = 0.40;
const SETTLE_STEPS: usize = 60;
const BOUNDS_SIZE: f32 = 5.0;

#[derive(Debug, Clone, Copy)]
enum EpisodeEndReason {
    BallSettled,
    BallFell,
    TorsoFell,
    TimedOut,
    OutOfBounds,
    BasketMade,
}

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

fn update_training_stats(stats: &super::resources::TrainStatsMsg) {
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

fn is_out_of_bounds(pos: Vec3) -> bool {
    pos.x.abs() > BOUNDS_SIZE || pos.z.abs() > BOUNDS_SIZE
}

impl EpisodeEndReason {
    fn check(
        ball_pos: Vec3,
        ball_vel: Vec3,
        torso_pos: Vec3,
        ball_released: bool,
        basket_made: bool,
        step: usize,
        max_steps: usize,
    ) -> Option<Self> {
        let ball_settled = ball_released && ball_vel.length() < 0.05 && step > 60;
        let ball_fell = ball_pos.y < -0.5;
        let torso_fell = step > SETTLE_STEPS && torso_pos.y < TORSO_FALL_Y;
        let timed_out = step >= max_steps;
        let out_of_bounds = is_out_of_bounds(torso_pos) || is_out_of_bounds(ball_pos);

        if basket_made {
            Some(Self::BasketMade)
        } else if out_of_bounds {
            Some(Self::OutOfBounds)
        } else if torso_fell {
            Some(Self::TorsoFell)
        } else if ball_fell {
            Some(Self::BallFell)
        } else if ball_settled {
            Some(Self::BallSettled)
        } else if timed_out {
            Some(Self::TimedOut)
        } else {
            None
        }
    }

    fn as_str(&self) -> &'static str {
        match self {
            Self::BallSettled => "ball_settled",
            Self::BallFell => "ball_fell",
            Self::TorsoFell => "torso_fell",
            Self::TimedOut => "timed_out",
            Self::OutOfBounds => "out_of_bounds",
            Self::BasketMade => "basket_made",
        }
    }
}

pub fn wasm_training_loop(
    mut sim: ResMut<SimulationState>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery)>,
    ball_query: Query<(&Transform, &LinearVelocity), With<Basketball>>,
    bridge: Option<Res<WsBridge>>,
) {
    if sim.cooldown > 0 {
        sim.cooldown -= 1;
        return;
    }

    let state = {
        let q = queries.p0();
        extract_robot_state(&q)
    };

    let Some(state) = state else { return };

    let Ok((ball_tf, ball_vel)) = ball_query.single() else {
        return;
    };

    let ball_pos = ball_tf.translation;
    let ball_v = Vec3::new(ball_vel.x, ball_vel.y, ball_vel.z);

    let obs = get_observation(
        &state.joint_angles(),
        &state.joint_velocities(),
        ball_pos,
        ball_v,
    );

    let dist_to_hoop = (ball_pos - HOOP_POS).length();
    let basket_made = dist_to_hoop < 0.3;

    let end_reason = EpisodeEndReason::check(
        ball_pos,
        ball_v,
        state.torso_pos,
        sim.ball_released,
        basket_made,
        sim.step,
        EPISODE_STEPS,
    );

    if let (Some(_prev_obs), Some(_prev_action)) = (sim.prev_obs.clone(), sim.prev_action.clone()) {
        let (comps, _stage_success) = compute_reward_components(
            ball_pos,
            ball_v,
            sim.ball_released,
            false,
            state.torso_pos,
            state.torso_up,
            state.left_foot_pos,
            state.right_foot_pos,
            sim.curriculum_stage,
        );

        let reward = comps.stand + comps.throw;
        sim.episode_reward += reward;

        if let Some(bridge) = bridge.as_ref() {
            if bridge.is_connected() {
                bridge.send_observation(&ObservationMsg {
                    obs: obs.clone(),
                    reward,
                    done: end_reason.is_some(),
                    step: sim.step as u64,
                    ball_released: sim.ball_released,
                });
            }
        }
    }

    let mut action = if let Some(bridge) = bridge.as_ref() {
        if bridge.is_connected() {
            if let Some(action_msg) = bridge.get_action() {
                if let Some(stats) = action_msg.stats {
                    update_training_stats(&stats);
                    sim.server_stats = Some(stats);
                }
                action_msg.action
            } else {
                (0..ACT_DIM)
                    .map(|_| rand::random::<f32>() * 2.0 - 1.0)
                    .collect()
            }
        } else {
            (0..ACT_DIM)
                .map(|_| rand::random::<f32>() * 2.0 - 1.0)
                .collect()
        }
    } else {
        (0..ACT_DIM)
            .map(|_| rand::random::<f32>() * 2.0 - 1.0)
            .collect()
    };

    if action.len() < ACT_DIM {
        action.resize(ACT_DIM, 0.0);
    }
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

    let release_signal = action.get(13).copied().unwrap_or(0.0);
    if !sim.ball_released && release_signal > 0.0 {
        sim.ball_released = true;
    }

    sim.prev_obs = Some(obs);
    sim.prev_action = Some(action);
    sim.prev_torso_pos = Some(state.torso_pos);
    sim.prev_left_foot_pos = Some(state.left_foot_pos);
    sim.prev_right_foot_pos = Some(state.right_foot_pos);
    sim.step += 1;

    if let Some(reason) = end_reason {
        if !sim.episode_reward_ema_initialized {
            sim.episode_reward_ema = sim.episode_reward;
            sim.episode_reward_ema_initialized = true;
        } else {
            sim.episode_reward_ema = 0.95 * sim.episode_reward_ema + 0.05 * sim.episode_reward;
        }

        let is_best = sim.episode_reward > sim.best_episode_reward;
        if is_best {
            sim.best_episode_reward = sim.episode_reward;
        }

        if basket_made {
            sim.baskets_made += 1;
        }

        let (_final_comps, stage_success) = compute_reward_components(
            ball_pos,
            ball_v,
            sim.ball_released,
            true,
            state.torso_pos,
            state.torso_up,
            state.left_foot_pos,
            state.right_foot_pos,
            sim.curriculum_stage,
        );

        if stage_success {
            sim.stage_success_streak += 1;
        } else {
            sim.stage_success_streak = 0;
        }

        sim.stage_episodes += 1;
        let success_threshold = 5;
        let min_episodes_per_stage = 100;

        if sim.stage_episodes >= min_episodes_per_stage
            && sim.stage_success_streak >= success_threshold
        {
            let next_stage = match sim.curriculum_stage {
                CurriculumStage::Standing => {
                    web_sys::console::log_1(
                        &format!(
                            "Advancing to ApproachBall after {} episodes with {} successes!",
                            sim.stage_episodes, sim.stage_success_streak
                        )
                        .into(),
                    );
                    Some(CurriculumStage::ApproachBall)
                }
                CurriculumStage::ApproachBall => {
                    web_sys::console::log_1(
                        &format!(
                            "Advancing to Shooting after {} episodes with {} successes!",
                            sim.stage_episodes, sim.stage_success_streak
                        )
                        .into(),
                    );
                    Some(CurriculumStage::Shooting)
                }
                CurriculumStage::Shooting => None,
            };

            if let Some(stage) = next_stage {
                sim.curriculum_stage = stage;
                sim.stage_episodes = 0;
                sim.stage_success_streak = 0;
            }
        }

        web_sys::console::log_1(
            &format!(
                "Episode {} ended: {} | Reward: {:.2} | EMA: {:.2} | Baskets: {}/{} ({:.1}%)",
                sim.episode,
                reason.as_str(),
                sim.episode_reward,
                sim.episode_reward_ema,
                sim.baskets_made,
                sim.episode + 1,
                (sim.baskets_made as f32 / (sim.episode + 1) as f32) * 100.0
            )
            .into(),
        );

        sim.needs_reset = true;
        sim.cooldown = 30;
        sim.episode += 1;
        sim.step = 0;
        sim.episode_reward = 0.0;
        sim.ball_released = false;
        sim.prev_obs = None;
        sim.prev_action = None;
    }
}
