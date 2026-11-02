use crate::{
    clock::{self, now_ns, Clock},
    nature,
    plan::{Line, Plan, Record, Step},
    sites::Site,
    talk::{self, Heard, Talk, Word},
};
use futures_util::{stream, Stream};
use rand::{rngs::StdRng, SeedableRng};
use std::{
    collections::HashMap,
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc as tokio_mpsc, Mutex, Semaphore};

const SPIN_NS: i64 = 1_000_000;
const HEAR_NS: i64 = 3_000_000_000;
const EARLIEST_NS: i64 = 1_000_000_000;
const LATEST_NS: i64 = 10_000_000_000;
const FLUSH: Duration = Duration::from_millis(20);
const CLOCK_TTL: Duration = Duration::from_secs(10);

pub struct Station {
    pub site: &'static Site,
    ntp: Option<String>,
    talk: Arc<Talk>,
    clock: Mutex<Option<(Instant, Clock)>>,
    slot: Arc<Semaphore>,
}

pub enum Refusal {
    Invalid,
    Busy,
}

impl Station {
    pub fn new(site: &'static Site, ntp: Option<String>, talk: Arc<Talk>) -> Self {
        Self {
            site,
            ntp,
            talk,
            clock: Mutex::new(None),
            slot: Arc::new(Semaphore::new(1)),
        }
    }

    pub async fn clock(&self, fresh: bool) -> Clock {
        let mut cached = self.clock.lock().await;

        if let Some((at, clock)) = *cached {
            if !fresh && at.elapsed() < CLOCK_TTL {
                return clock;
            }
        }

        let clock = clock::measure(self.ntp.as_deref()).await;

        *cached = Some((Instant::now(), clock));
        clock
    }

    pub async fn run(&self, plan: Plan) -> Result<impl Stream<Item = Line> + use<>, Refusal> {
        let steps = plan.decode().ok_or(Refusal::Invalid)?;
        let now = now_ns();

        if plan.start_ns < now - EARLIEST_NS || plan.start_ns > now + LATEST_NS {
            return Err(Refusal::Invalid);
        }

        let permit = self
            .slot
            .clone()
            .try_acquire_owned()
            .map_err(|_| Refusal::Busy)?;
        let clock = self.clock(true).await;
        let listening = steps.contains(&Step::Listen);
        let heard = listening.then(|| self.talk.expect(plan.run));
        let words = plan.tell.clone().map(|addr| {
            let (tx, rx) = tokio_mpsc::unbounded_channel();

            tokio::spawn(talk::tell(addr, plan.run, rx));
            tx
        });
        let (records, receiver) = tokio_mpsc::unbounded_channel();
        let talk = self.talk.clone();
        let run = plan.run;

        std::thread::spawn(move || {
            play(&plan, &steps, heard, words, &records);
            talk.forget(run);
            drop(permit);
        });

        let head = stream::once(async move { Line::Clock { clock } });
        let body = stream::unfold((receiver, false), |(mut receiver, done)| async move {
            if done {
                return None;
            }

            let mut rows = Vec::new();
            let deadline = tokio::time::Instant::now() + FLUSH;

            loop {
                match tokio::time::timeout_at(deadline, receiver.recv()).await {
                    Ok(Some(record)) => rows.push(record.row()),
                    Ok(None) => {
                        let line = if rows.is_empty() {
                            Line::End
                        } else {
                            Line::Records { rows }
                        };
                        let finished = matches!(line, Line::End);

                        return Some((line, (receiver, finished)));
                    }
                    Err(_) if rows.is_empty() => continue,
                    Err(_) => return Some((Line::Records { rows }, (receiver, false))),
                }
            }
        });

        Ok(futures_util::StreamExt::chain(head, body))
    }
}

fn own_dial() -> u8 {
    loop {
        let mut byte = [0u8; 1];

        if getrandom::fill(&mut byte).is_ok() && byte[0] < 252 {
            return byte[0] % 6;
        }
    }
}

fn wait_until(ns: i64) {
    loop {
        let left = ns - now_ns();

        if left <= 0 {
            return;
        }

        if left > SPIN_NS {
            std::thread::sleep(Duration::from_nanos((left - SPIN_NS) as u64));
        } else {
            std::hint::spin_loop();
        }
    }
}

struct Ear {
    heard: mpsc::Receiver<Heard>,
    open: bool,
    early: HashMap<u32, Heard>,
    pending: HashMap<u32, (u8, i64)>,
    rng: StdRng,
}

impl Ear {
    fn new(heard: mpsc::Receiver<Heard>) -> Self {
        Self {
            heard,
            open: true,
            early: HashMap::new(),
            pending: HashMap::new(),
            rng: StdRng::from_rng(&mut rand::rng()),
        }
    }

    fn answer(&mut self, k: u32, dial: u8, dial_ns: i64, heard: Heard) -> Record {
        let answer = heard
            .word
            .answer
            .map(|other| nature::follow(&mut self.rng, nature::step(heard.word.dial, dial), other));

        Record {
            k,
            dial,
            answer,
            dial_ns,
            commit_ns: now_ns(),
            heard_ns: Some(heard.heard_ns),
        }
    }

    fn take(&mut self, heard: Heard, out: &tokio_mpsc::UnboundedSender<Record>) {
        let k = heard.word.k;

        match self.pending.remove(&k) {
            Some((dial, dial_ns)) => {
                let record = self.answer(k, dial, dial_ns, heard);
                let _ = out.send(record);
            }
            None => {
                self.early.insert(k, heard);
            }
        }
    }

    fn dialed(
        &mut self,
        k: u32,
        dial: u8,
        dial_ns: i64,
        out: &tokio_mpsc::UnboundedSender<Record>,
    ) {
        match self.early.remove(&k) {
            Some(heard) => {
                let record = self.answer(k, dial, dial_ns, heard);
                let _ = out.send(record);
            }
            None => {
                self.pending.insert(k, (dial, dial_ns));
            }
        }
    }

    fn wait(&mut self, tick: i64, out: &tokio_mpsc::UnboundedSender<Record>) {
        loop {
            let left = tick - now_ns();

            if left <= 0 {
                return;
            }

            let heard = if !self.open {
                None
            } else if left > SPIN_NS {
                match self
                    .heard
                    .recv_timeout(Duration::from_nanos((left - SPIN_NS) as u64))
                {
                    Ok(heard) => Some(heard),
                    Err(mpsc::RecvTimeoutError::Timeout) => None,
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        self.open = false;
                        None
                    }
                }
            } else {
                self.heard.try_recv().ok()
            };

            match heard {
                Some(heard) => self.take(heard, out),
                None if self.open && left > SPIN_NS => {}
                None => std::hint::spin_loop(),
            }
        }
    }

    fn drain(&mut self, deadline: i64, out: &tokio_mpsc::UnboundedSender<Record>) {
        while self.open && !self.pending.is_empty() {
            let left = deadline - now_ns();

            if left <= 0 {
                return;
            }

            match self.heard.recv_timeout(Duration::from_nanos(left as u64)) {
                Ok(heard) => self.take(heard, out),
                Err(mpsc::RecvTimeoutError::Timeout) => return,
                Err(mpsc::RecvTimeoutError::Disconnected) => self.open = false,
            }
        }
    }

    fn give_up(&mut self, out: &tokio_mpsc::UnboundedSender<Record>) {
        let mut left: Vec<_> = self.pending.drain().collect();

        left.sort_by_key(|(k, _)| *k);

        for (k, (dial, dial_ns)) in left {
            let _ = out.send(Record {
                k,
                dial,
                answer: None,
                dial_ns,
                commit_ns: now_ns(),
                heard_ns: None,
            });
        }
    }
}

fn play(
    plan: &Plan,
    steps: &[Step],
    heard: Option<mpsc::Receiver<Heard>>,
    words: Option<tokio_mpsc::UnboundedSender<Word>>,
    out: &tokio_mpsc::UnboundedSender<Record>,
) {
    let mut ear = heard.map(Ear::new);

    for (k, &step) in steps.iter().enumerate() {
        let tick = plan.tick(k);
        let k = k as u32;

        match ear.as_mut() {
            Some(ear) => ear.wait(tick, out),
            None => wait_until(tick),
        }

        let dial_ns = now_ns();
        let dial = plan.dials.as_ref().map_or_else(own_dial, |d| d[k as usize]);

        if step == Step::Listen {
            if let Some(ear) = ear.as_mut() {
                ear.dialed(k, dial, dial_ns, out);
            }

            continue;
        }

        let answer = step.answer(dial);
        let commit_ns = now_ns();

        if let Some(words) = words.as_ref() {
            let _ = words.send(Word {
                k,
                dial,
                answer,
                dial_ns,
            });
        }

        let _ = out.send(Record {
            k,
            dial,
            answer,
            dial_ns,
            commit_ns,
            heard_ns: None,
        });
    }

    if let Some(ear) = ear.as_mut() {
        ear.drain(plan.tick(steps.len()) + HEAR_NS, out);
        ear.give_up(out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{card::Card, sites::SITES};
    use futures_util::StreamExt;
    use tokio::net::TcpListener;
    use uuid::Uuid;

    fn plan(steps: Vec<Step>, tell: Option<String>, run: Uuid) -> Plan {
        Plan {
            run,
            start_ns: now_ns() + 50_000_000,
            spacing_ns: 500_000,
            steps: steps.iter().map(|s| s.code()).collect(),
            dials: None,
            tell,
        }
    }

    async fn collect(lines: impl Stream<Item = Line>) -> (Option<Clock>, Vec<Record>) {
        let lines: Vec<_> = lines.collect().await;
        let mut clock = None;
        let mut records = Vec::new();

        for line in lines {
            match line {
                Line::Clock { clock: c } => clock = Some(c),
                Line::Records { rows } => {
                    records.extend(rows.into_iter().filter_map(Record::from_row));
                }
                Line::End => {}
            }
        }

        records.sort_by_key(|r| r.k);
        (clock, records)
    }

    #[tokio::test]
    async fn plays_every_trial_on_its_tick() {
        let station = Station::new(&SITES[0], None, Arc::new(Talk::default()));
        let card = Card::new(3).unwrap();
        let p = plan(vec![Step::Card(card); 200], None, Uuid::new_v4());
        let ticks: Vec<_> = (0..200).map(|k| p.tick(k)).collect();
        let lines = station.run(p).await.ok().expect("accepted");
        let (clock, records) = collect(lines).await;

        assert_eq!(clock, Some(Clock::unmeasured()));
        assert_eq!(records.len(), 200);

        for (record, tick) in records.iter().zip(ticks) {
            assert_eq!(record.answer, Some(card.dot(record.dial)));
            assert!(
                record.dial_ns >= tick && record.dial_ns - tick < 20_000_000,
                "late by {} ns",
                record.dial_ns - tick
            );
            assert!(record.commit_ns >= record.dial_ns);
        }
    }

    #[tokio::test]
    async fn refuses_a_second_run_while_one_is_playing() {
        let station = Station::new(&SITES[0], None, Arc::new(Talk::default()));
        let first = station
            .run(plan(vec![Step::Listen; 4], None, Uuid::new_v4()))
            .await;

        assert!(first.is_ok());
        assert!(matches!(
            station
                .run(plan(vec![Step::Listen; 4], None, Uuid::new_v4()))
                .await,
            Err(Refusal::Busy)
        ));
    }

    #[tokio::test]
    async fn a_listener_answers_only_after_hearing_the_teller() {
        let talk = Arc::new(Talk::default());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();

        tokio::spawn(talk.clone().listen(listener));

        let west = Station::new(&SITES[0], None, talk);
        let east = Station::new(&SITES[1], None, Arc::new(Talk::default()));
        let run = Uuid::new_v4();
        let n = 300;
        let card = Card::new(5).unwrap();
        let listening = west
            .run(plan(vec![Step::Listen; n], None, run))
            .await
            .ok()
            .expect("west");
        let telling = east
            .run(plan(vec![Step::Card(card); n], Some(addr), run))
            .await
            .ok()
            .expect("east");
        let ((_, heard), (_, told)) = tokio::join!(collect(listening), collect(telling));

        assert_eq!(heard.len(), n);
        assert_eq!(told.len(), n);

        let mut same = 0;
        let mut at_thirty = 0;

        for (w, e) in heard.iter().zip(&told) {
            assert!(w.answer.is_some());
            assert!(w.heard_ns.unwrap() >= e.dial_ns);
            assert!(w.commit_ns >= w.heard_ns.unwrap());

            if [1, 5].contains(&nature::step(e.dial, w.dial)) {
                at_thirty += 1;
                same += i32::from(w.answer == e.answer);
            }
        }

        assert!(at_thirty > 50);
        assert!(f64::from(same) / f64::from(at_thirty) > 0.6);
    }

    #[tokio::test]
    async fn a_listener_frees_its_slot_once_everything_is_heard() {
        let talk = Arc::new(Talk::default());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();

        tokio::spawn(talk.clone().listen(listener));

        let west = Station::new(&SITES[0], None, talk);
        let east = Station::new(&SITES[1], None, Arc::new(Talk::default()));
        let run = Uuid::new_v4();
        let card = Card::new(1).unwrap();
        let listening = west
            .run(plan(vec![Step::Listen; 20], None, run))
            .await
            .ok()
            .expect("west");
        let telling = east
            .run(plan(vec![Step::Card(card); 20], Some(addr), run))
            .await
            .ok()
            .expect("east");

        tokio::join!(collect(listening), collect(telling));
        tokio::time::sleep(Duration::from_millis(50)).await;

        assert!(west
            .run(plan(vec![Step::Card(card); 2], None, Uuid::new_v4()))
            .await
            .is_ok());
    }
}
