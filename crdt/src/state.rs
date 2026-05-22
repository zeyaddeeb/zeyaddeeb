use dashmap::DashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::db::Db;

const BROADCAST_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct Room {
    pub tx: broadcast::Sender<String>,
}

impl Room {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Room { tx }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub rooms: Arc<DashMap<String, Room>>,
    next_seq: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        AppState {
            db: Arc::new(db),
            rooms: Arc::new(DashMap::new()),
            next_seq: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn next_op_seq(&self) -> u64 {
        self.next_seq.fetch_add(1, Ordering::Relaxed)
    }

    pub fn room_for(&self, doc_id: &str) -> Room {
        self.rooms
            .entry(doc_id.to_owned())
            .or_insert_with(Room::new)
            .clone()
    }
}
