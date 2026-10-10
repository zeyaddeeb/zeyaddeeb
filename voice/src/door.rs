use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::anyhow;

type Opener<T> = Box<dyn Fn() -> anyhow::Result<T> + Send + Sync>;

pub struct Door<T> {
    opener: Arc<Opener<T>>,
    inside: Mutex<Option<Arc<T>>>,
    used: Mutex<Instant>,
    opening: tokio::sync::Mutex<()>,
}

impl<T: Send + Sync + 'static> Door<T> {
    pub fn new(opener: impl Fn() -> anyhow::Result<T> + Send + Sync + 'static) -> Self {
        Self {
            opener: Arc::new(Box::new(opener)),
            inside: Mutex::new(None),
            used: Mutex::new(Instant::now()),
            opening: tokio::sync::Mutex::new(()),
        }
    }

    pub async fn open(&self) -> anyhow::Result<Arc<T>> {
        let _opening = self.opening.lock().await;

        self.touch();

        if let Some(inside) = self.inside()? {
            return Ok(inside);
        }

        let opener = self.opener.clone();
        let opened = Arc::new(tokio::task::spawn_blocking(move || opener()).await??);

        *self
            .inside
            .lock()
            .map_err(|_| anyhow!("the door is stuck"))? = Some(opened.clone());

        Ok(opened)
    }

    pub fn touch(&self) {
        if let Ok(mut used) = self.used.lock() {
            *used = Instant::now();
        }
    }

    pub fn close_if_idle(&self, now: Instant, idle: Duration) -> bool {
        let quiet = self
            .used
            .lock()
            .is_ok_and(|used| now.saturating_duration_since(*used) >= idle);

        let Ok(mut inside) = self.inside.lock() else {
            return false;
        };

        let unshared = inside
            .as_ref()
            .is_some_and(|held| Arc::strong_count(held) == 1);

        if quiet && unshared {
            *inside = None;
        }

        quiet && unshared
    }

    fn inside(&self) -> anyhow::Result<Option<Arc<T>>> {
        Ok(self
            .inside
            .lock()
            .map_err(|_| anyhow!("the door is stuck"))?
            .clone())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    fn counted() -> (Arc<AtomicUsize>, Door<usize>) {
        let opened = Arc::new(AtomicUsize::new(0));
        let count = opened.clone();

        (
            opened,
            Door::new(move || Ok(count.fetch_add(1, Ordering::Relaxed) + 1)),
        )
    }

    const IDLE: Duration = Duration::from_secs(120);

    #[tokio::test]
    async fn opening_twice_loads_once() {
        let (opened, door) = counted();

        assert_eq!(*door.open().await.unwrap(), 1);
        assert_eq!(*door.open().await.unwrap(), 1);
        assert_eq!(opened.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn it_stays_open_while_recently_used() {
        let (_, door) = counted();

        door.open().await.unwrap();

        assert!(!door.close_if_idle(Instant::now(), IDLE));
    }

    #[tokio::test]
    async fn it_stays_open_while_someone_is_inside() {
        let (_, door) = counted();
        let visitor = door.open().await.unwrap();

        assert!(!door.close_if_idle(Instant::now() + IDLE, IDLE));

        drop(visitor);

        assert!(door.close_if_idle(Instant::now() + IDLE, IDLE));
    }

    #[tokio::test]
    async fn it_loads_again_after_closing() {
        let (opened, door) = counted();

        drop(door.open().await.unwrap());

        assert!(door.close_if_idle(Instant::now() + IDLE, IDLE));
        assert_eq!(*door.open().await.unwrap(), 2);
        assert_eq!(opened.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn a_failed_opening_is_reported_and_retried() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let count = attempts.clone();
        let door: Door<usize> = Door::new(move || match count.fetch_add(1, Ordering::Relaxed) {
            0 => Err(anyhow!("missing")),
            attempt => Ok(attempt),
        });

        assert!(door.open().await.is_err());
        assert_eq!(*door.open().await.unwrap(), 1);
    }

    #[test]
    fn a_closed_door_has_nothing_to_close() {
        let (_, door) = counted();

        assert!(!door.close_if_idle(Instant::now() + IDLE, IDLE));
    }
}
