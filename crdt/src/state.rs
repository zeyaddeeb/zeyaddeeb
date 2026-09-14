use dashmap::DashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::db::Db;

const BROADCAST_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct Room {
    pub tx: broadcast::Sender<String>,
    pub peers: Arc<AtomicUsize>,
    next_peer: Arc<AtomicU32>,
}

impl Room {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Room {
            tx,
            peers: Arc::new(AtomicUsize::new(0)),
            next_peer: Arc::new(AtomicU32::new(1)),
        }
    }

    pub fn join(&self) -> (u32, usize) {
        let id = self.next_peer.fetch_add(1, Ordering::Relaxed);
        let count = self.peers.fetch_add(1, Ordering::Relaxed) + 1;
        (id, count)
    }

    pub fn leave(&self) -> usize {
        self.peers.fetch_sub(1, Ordering::Relaxed).saturating_sub(1)
    }

    pub fn peer_count(&self) -> usize {
        self.peers.load(Ordering::Relaxed)
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub rooms: Arc<DashMap<String, Room>>,
    next_seq: Arc<AtomicU64>,
    ops_seen: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        AppState {
            db: Arc::new(db),
            rooms: Arc::new(DashMap::new()),
            next_seq: Arc::new(AtomicU64::new(1)),
            ops_seen: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn next_op_seq(&self) -> u64 {
        self.ops_seen.fetch_add(1, Ordering::Relaxed);
        self.next_seq.fetch_add(1, Ordering::Relaxed)
    }

    pub fn ops_seen(&self) -> u64 {
        self.ops_seen.load(Ordering::Relaxed)
    }

    pub fn total_peers(&self) -> usize {
        self.rooms.iter().map(|r| r.peer_count()).sum()
    }

    pub fn room_for(&self, doc_id: &str) -> Room {
        self.rooms
            .entry(doc_id.to_owned())
            .or_insert_with(Room::new)
            .clone()
    }
}
