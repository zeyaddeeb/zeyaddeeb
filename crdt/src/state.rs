use dashmap::DashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, Mutex, Semaphore};

use crate::db::Db;

const BROADCAST_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct Room {
    pub tx: broadcast::Sender<String>,
    pub peers: Arc<AtomicUsize>,
    next_peer: Arc<AtomicU32>,
    pub history: Arc<Mutex<usize>>,
    idle: Arc<std::sync::Mutex<Instant>>,
}

impl Room {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Room {
            tx,
            peers: Arc::new(AtomicUsize::new(0)),
            next_peer: Arc::new(AtomicU32::new(1)),
            history: Arc::new(Mutex::new(0)),
            idle: Arc::new(std::sync::Mutex::new(Instant::now())),
        }
    }

    pub fn join(&self) -> (u32, usize) {
        let id = self.next_peer.fetch_add(1, Ordering::Relaxed);
        let count = self.peers.fetch_add(1, Ordering::Relaxed) + 1;
        (id, count)
    }

    pub fn leave(&self) -> usize {
        *self.idle.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
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
    admission: Arc<Mutex<()>>,
    pub connections: Arc<Semaphore>,
    ops_seen: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        AppState {
            db: Arc::new(db),
            rooms: Arc::new(DashMap::new()),
            next_seq: Arc::new(AtomicU64::new(1)),
            admission: Arc::new(Mutex::new(())),
            connections: Arc::new(Semaphore::new(128)),
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

    pub async fn join_room(&self, doc_id: &str) -> Option<(Room, u32, usize)> {
        let _admission = self.admission.lock().await;
        if !self.rooms.contains_key(doc_id) && self.rooms.len() >= 32 {
            return None;
        }
        let room = self
            .rooms
            .entry(doc_id.to_owned())
            .or_insert_with(Room::new)
            .clone();
        if room.peer_count() >= 16 {
            return None;
        }
        let (peer, peers) = room.join();
        Some((room, peer, peers))
    }

    pub async fn sweep(&self) {
        let _admission = self.admission.lock().await;
        let expired: Vec<String> = self
            .rooms
            .iter()
            .filter(|room| {
                room.peer_count() == 0
                    && room
                        .idle
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .elapsed()
                        > Duration::from_secs(600)
            })
            .map(|room| room.key().clone())
            .collect();
        for id in expired {
            if crate::db::delete_ops(&self.db, &id).await.is_ok() {
                self.rooms.remove(&id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn admission_caps_and_expiration_reclaim_rooms() {
        let state = AppState::new(crate::db::connect().await.unwrap());
        let (room, _, _) = state.join_room("first").await.unwrap();
        for _ in 1..16 {
            assert!(state.join_room("first").await.is_some());
        }
        assert!(state.join_room("first").await.is_none());
        for i in 1..32 {
            assert!(state.join_room(&format!("room-{i}")).await.is_some());
        }
        assert!(state.join_room("overflow").await.is_none());
        for _ in 0..16 {
            room.leave();
        }
        *room.idle.lock().unwrap() = Instant::now() - Duration::from_secs(601);
        state.sweep().await;
        assert!(!state.rooms.contains_key("first"));
        assert!(state.join_room("replacement").await.is_some());
    }
}
