use super::{
    bandit,
    config::Mode,
    episode,
    fronts::{self, FRONTS},
    live::{Event, Phase},
    sleep, Agent, Stop, LEASE_SECONDS,
};
use std::time::Duration;

const SLICE: Duration = Duration::from_secs(5);
const DISPLACED: Duration = Duration::from_secs(60);

impl Agent {
    pub async fn run(mut self) {
        tracing::info!(episodes = self.state.episodes, "the night shift begins");
        while !self.stopping() {
            if let Err(stop) = self.shift().await {
                let pause = match stop {
                    Stop::Shutdown => break,
                    Stop::Displaced => DISPLACED,
                    Stop::GaveUp => self.config.limits.backoff_max,
                    Stop::Failed(error) => {
                        tracing::error!(%error, "episode failed");
                        self.emit(Event::Trouble {
                            message: "The shift stumbled; resting before the next episode.".into(),
                        });
                        self.config.limits.backoff_base
                    }
                };
                self.bench.release();
                self.rest(pause).await;
            }
        }
        self.bench.release();
        if let Err(error) = self.save().await {
            tracing::error!(%error, "could not save before stopping");
        }
        tracing::info!("the night shift is parked");
    }

    async fn recover(&mut self) -> anyhow::Result<()> {
        if self.state.open_front.is_empty() {
            return Ok(());
        }
        let number = self.state.episodes + 1;
        let front = std::mem::take(&mut self.state.open_front);
        let closed = match self.store.episode(number).await? {
            Some(_) => true,
            None => {
                let turns = self.store.turns(number).await?;
                if !turns.is_empty() {
                    let record =
                        episode::interrupted(number, &front, self.state.open_since, &turns);
                    self.store.put_episode(&record).await?;
                    self.emit(Event::Concluded { episode: record });
                }
                !turns.is_empty()
            }
        };
        if closed {
            tracing::info!(number, "closed an episode a restart cut off");
            self.state.episodes = number;
            self.state.last_front = front;
        }
        self.save().await
    }

    pub async fn shift(&mut self) -> Result<(), Stop> {
        if self.config.mode == Mode::Watched && self.hub.watchers() == 0 {
            self.rest(Duration::ZERO).await;
        }
        if self.stopping() {
            return Err(Stop::Shutdown);
        }
        if !self.store.claim(&self.config.holder, LEASE_SECONDS).await? {
            return Err(Stop::Displaced);
        }
        self.recover().await?;
        self.bench.rest_if_idle();
        let ids: Vec<&str> = FRONTS.iter().map(|front| front.id).collect();
        let (chosen, arms) = bandit::choose(&self.state.arms, &ids, &self.state.last_front);
        let front = fronts::find(&chosen).expect("bandit chooses a known front");
        self.emit(Event::Wake {
            episode: self.state.episodes + 1,
            front: front.id.to_string(),
            arms,
        });
        self.state.open_front = front.id.to_string();
        self.state.open_since = super::now();
        self.save().await?;
        let record = episode::run(self, front).await?;
        self.state.episodes = record.number;
        self.state.last_front = front.id.to_string();
        self.state.open_front.clear();
        bandit::reward(&mut self.state.arms, front.id, record.reward);
        self.save().await?;
        if self.stopping() {
            return Err(Stop::Shutdown);
        }
        if self.state.episodes.is_multiple_of(self.config.sleep_every) {
            sleep::run(self).await?;
            self.save().await?;
        }
        let pause = if self.hub.watchers() > 0 {
            self.config.rest_watched
        } else {
            self.config.rest_unwatched
        };
        self.rest(pause).await;
        Ok(())
    }

    async fn rest(&mut self, pause: Duration) {
        self.emit(Event::Phase {
            phase: Phase::Rest,
            seconds: Some(pause.as_secs()),
            reason: None,
        });
        let mut left = pause;
        let mut waiting = false;
        while !self.stopping() {
            if self.hub.watchers() > 0 && left > self.config.rest_watched {
                left = self.config.rest_watched;
            }
            if self.bench.rest_if_idle() {
                tracing::info!("Lean released while resting");
            }
            if left.is_zero() {
                if self.config.mode == Mode::Always || self.hub.watchers() > 0 {
                    break;
                }
                if !waiting {
                    waiting = true;
                    self.bench.release();
                    self.emit(Event::Phase {
                        phase: Phase::Rest,
                        seconds: None,
                        reason: Some("it works only while someone is watching".into()),
                    });
                }
                self.nap(SLICE).await;
                continue;
            }
            let step = left.min(SLICE);
            self.nap(step).await;
            left = left.saturating_sub(step);
        }
    }
}
