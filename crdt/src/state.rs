use dashmap::DashMap;
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
}

impl AppState {
    pub fn new(db: Db) -> Self {
        AppState {
            db: Arc::new(db),
            rooms: Arc::new(DashMap::new()),
        }
    }

    pub fn room_for(&self, doc_id: &str) -> Room {
        self.rooms
            .entry(doc_id.to_owned())
            .or_insert_with(Room::new)
            .clone()
    }
}
