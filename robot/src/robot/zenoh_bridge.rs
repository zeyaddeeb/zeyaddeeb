use bevy::prelude::*;
use std::sync::{mpsc, Mutex};
use std::thread;
use zenoh::{key_expr::keyexpr, Config, Wait};

use super::resources::{ActionMsg, ObservationMsg, ZenohBridge};
use crate::rl::ACT_DIM;

const OBS_KEY: &str = "robot/obs";
const ACT_KEY: &str = "robot/action";

pub fn start_zenoh(mut commands: Commands) {
    let (obs_tx, obs_rx) = mpsc::channel::<ObservationMsg>();
    let (action_tx, action_rx) = mpsc::channel::<ActionMsg>();

    thread::spawn(move || {
        zenoh::init_log_from_env_or("error");
        let config = Config::default();
        let session = zenoh::open(config).wait().expect("zenoh open");

        let publisher = session
            .declare_publisher(keyexpr::new(OBS_KEY).expect("obs key"))
            .wait()
            .expect("obs publisher");

        session
            .declare_subscriber(keyexpr::new(ACT_KEY).expect("action key"))
            .callback(move |sample| {
                let payload = sample.payload().to_bytes();
                if let Ok(msg) = serde_json::from_slice::<ActionMsg>(payload.as_ref()) {
                    let _ = action_tx.send(msg);
                }
            })
            .background()
            .wait()
            .expect("action subscriber");

        for msg in obs_rx.iter() {
            if let Ok(payload) = serde_json::to_vec(&msg) {
                let _ = publisher.put(payload).wait();
            }
        }
    });

    commands.insert_resource(ZenohBridge {
        obs_tx,
        action_rx: Mutex::new(action_rx),
        last_action: vec![0.0_f32; ACT_DIM],
        last_action_at: 0.0,
    });
}
