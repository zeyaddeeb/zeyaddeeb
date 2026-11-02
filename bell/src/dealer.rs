use crate::{
    clock::{now_ns, Clock},
    deal::{deal, Deal},
    deck::Deck,
    peers::Peer,
    plan::{Line, Plan, Record},
    sites::{self, Site},
};
use futures_util::StreamExt;
use rand::{rngs::StdRng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, Mutex, Semaphore};
use uuid::Uuid;

pub const PAIRS: usize = 2_400;
pub const SPACING_NS: i64 = 500_000;
const PROBE: Duration = Duration::from_millis(1_500);
const SEEN_TTL: Duration = Duration::from_secs(15);
const LEAD_NS: i64 = 300_000_000;
const TAIL_NS: i64 = 6_000_000_000;
const FLUSH: Duration = Duration::from_millis(40);
const BURST: f64 = 12.0;
const REFILL_S: f64 = 5.0;

#[derive(Clone, Debug, Deserialize)]
pub struct Ask {
    pub deal: Deal,
    pub deck: Deck,
    pub sites: Option<[String; 2]>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Seen {
    pub site: &'static str,
    pub live: bool,
    pub rtt_us: Option<i64>,
    pub clock: Option<Clock>,
}

#[derive(Serialize)]
pub struct Row(
    u32,
    Option<u8>,
    Option<u8>,
    u8,
    u8,
    i8,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<u8>,
);

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Sites {
        sites: Vec<Seen>,
    },
    Refused {
        reason: &'static str,
    },
    Start {
        run: Uuid,
        deal: Deal,
        west: &'static str,
        east: &'static str,
        least_km: f64,
        light_us: f64,
        pairs: usize,
        spacing_us: i64,
    },
    Clocks {
        west: Clock,
        east: Clock,
    },
    Trials {
        rows: Vec<Row>,
    },
    Lost {
        site: &'static str,
        after: Option<u32>,
    },
    Done {
        west: usize,
        east: usize,
    },
}

#[derive(Serialize, Deserialize)]
struct Hello {
    site: String,
    clock: Clock,
}

pub enum Refusal {
    Invalid,
    Busy,
}

struct Bucket {
    tokens: f64,
    at: Instant,
}

impl Bucket {
    fn take(&mut self) -> bool {
        let now = Instant::now();

        self.tokens =
            (self.tokens + now.duration_since(self.at).as_secs_f64() / REFILL_S).min(BURST);
        self.at = now;

        if self.tokens < 1.0 {
            return false;
        }

        self.tokens -= 1.0;
        true
    }
}

pub struct Dealer {
    http: reqwest::Client,
    peers: Vec<Peer>,
    slot: Arc<Semaphore>,
    bucket: Mutex<Bucket>,
    seen: Mutex<Option<(Instant, Vec<Seen>)>>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Side {
    West,
    East,
}

enum Heard {
    Clock(Clock),
    Records(Vec<Record>),
    End,
    Lost,
}

impl Dealer {
    pub fn new(peers: Vec<Peer>) -> Self {
        Self {
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .build()
                .unwrap_or_default(),
            peers,
            slot: Arc::new(Semaphore::new(1)),
            bucket: Mutex::new(Bucket {
                tokens: BURST,
                at: Instant::now(),
            }),
            seen: Mutex::new(None),
        }
    }

    async fn probe(&self, peer: &Peer) -> Seen {
        let started = Instant::now();
        let reply = self
            .http
            .get(format!("{}/hello", peer.http))
            .timeout(PROBE)
            .send()
            .await
            .ok()
            .filter(|r| r.status().is_success());
        let rtt_us = started.elapsed().as_micros() as i64;
        let hello = match reply {
            Some(reply) => reply.json::<Hello>().await.ok(),
            None => None,
        }
        .filter(|h| h.site == peer.site.id);

        Seen {
            site: peer.site.id,
            live: hello.is_some(),
            rtt_us: hello.as_ref().map(|_| rtt_us),
            clock: hello.map(|h| h.clock),
        }
    }

    pub async fn sites(&self, fresh: bool) -> Vec<Seen> {
        let mut cached = self.seen.lock().await;

        if let Some((at, seen)) = cached.as_ref() {
            if !fresh && at.elapsed() < SEEN_TTL {
                return seen.clone();
            }
        }

        let seen = futures_util::future::join_all(self.peers.iter().map(|p| self.probe(p))).await;

        *cached = Some((Instant::now(), seen.clone()));
        seen
    }

    fn peer(&self, site: &Site) -> Option<&Peer> {
        self.peers.iter().find(|p| p.site.id == site.id)
    }

    pub async fn run(self: Arc<Self>, ask: Ask) -> Result<mpsc::UnboundedReceiver<Event>, Refusal> {
        if ask.deal == Deal::Deck && !ask.deck.valid() {
            return Err(Refusal::Invalid);
        }

        let permit = self
            .slot
            .clone()
            .try_acquire_owned()
            .map_err(|_| Refusal::Busy)?;

        if !self.bucket.lock().await.take() {
            return Err(Refusal::Busy);
        }

        let (tx, rx) = mpsc::unbounded_channel();

        tokio::spawn(async move {
            self.play(ask, &tx).await;
            drop(permit);
        });

        Ok(rx)
    }

    async fn play(&self, ask: Ask, tx: &mpsc::UnboundedSender<Event>) {
        let seen = self.sites(true).await;
        let live: Vec<&str> = seen.iter().filter(|s| s.live).map(|s| s.site).collect();
        let rtt = seen.iter().filter_map(|s| s.rtt_us).max().unwrap_or(0) * 1_000;
        let pair = sites::choose(&live, ask.sites.as_ref());
        let _ = tx.send(Event::Sites { sites: seen });

        let Some([west, east]) = pair else {
            let _ = tx.send(Event::Refused { reason: "dark" });
            return;
        };
        let (Some(west_peer), Some(east_peer)) = (self.peer(west), self.peer(east)) else {
            let _ = tx.send(Event::Refused { reason: "dark" });
            return;
        };

        let mut rng = StdRng::from_rng(&mut rand::rng());
        let hands = deal(&mut rng, ask.deal, &ask.deck, PAIRS);
        let run = Uuid::new_v4();
        let start_ns = now_ns() + LEAD_NS + rtt * 3;
        let least_km = sites::least_km(west, east);
        let [west_dials, east_dials] = hands
            .dials
            .map_or([None, None], |[w, e]| [Some(w), Some(e)]);
        let plan = |steps: &[crate::plan::Step], dials, tell| Plan {
            run,
            start_ns,
            spacing_ns: SPACING_NS,
            steps: steps.iter().map(|s| s.code()).collect(),
            dials,
            tell,
        };
        let west_plan = plan(&hands.west, west_dials, None);
        let east_plan = plan(
            &hands.east,
            east_dials,
            (ask.deal == Deal::Talk).then(|| west_peer.talk.clone()),
        );

        let _ = tx.send(Event::Start {
            run,
            deal: ask.deal,
            west: west.id,
            east: east.id,
            least_km,
            light_us: sites::light_ns(least_km) as f64 / 1_000.0,
            pairs: PAIRS,
            spacing_us: SPACING_NS / 1_000,
        });

        let (heard_tx, heard_rx) = mpsc::unbounded_channel();

        for (side, peer, plan) in [
            (Side::West, west_peer, west_plan),
            (Side::East, east_peer, east_plan),
        ] {
            let http = self.http.clone();
            let url = format!("{}/plan", peer.http);
            let heard_tx = heard_tx.clone();

            tokio::spawn(async move { listen(http, url, plan, side, heard_tx).await });
        }

        drop(heard_tx);

        let deadline = start_ns + SPACING_NS * PAIRS as i64 + TAIL_NS;
        let cards = hands
            .west
            .iter()
            .map(|step| match step {
                crate::plan::Step::Card(card) => Some(card.id()),
                _ => None,
            })
            .collect();
        let merge = Merge {
            start_ns,
            signs: hands.signs,
            cards,
            west,
            east,
        };

        merge.run(heard_rx, deadline, tx).await;
    }
}

async fn listen(
    http: reqwest::Client,
    url: String,
    plan: Plan,
    side: Side,
    out: mpsc::UnboundedSender<(Side, Heard)>,
) {
    let response = http.post(url).json(&plan).send().await;
    let Ok(response) = response.and_then(|r| r.error_for_status()) else {
        let _ = out.send((side, Heard::Lost));
        return;
    };
    let mut body = response.bytes_stream();
    let mut buffer = Vec::new();
    let mut ended = false;

    while let Some(chunk) = body.next().await {
        let Ok(chunk) = chunk else { break };

        buffer.extend_from_slice(&chunk);

        while let Some(at) = buffer.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buffer.drain(..=at).collect();
            let heard = match serde_json::from_slice::<Line>(&line) {
                Ok(Line::Clock { clock }) => Heard::Clock(clock),
                Ok(Line::Records { rows }) => {
                    Heard::Records(rows.into_iter().filter_map(Record::from_row).collect())
                }
                Ok(Line::End) => {
                    ended = true;
                    Heard::End
                }
                Err(_) => continue,
            };

            let _ = out.send((side, heard));
        }
    }

    if !ended {
        let _ = out.send((side, Heard::Lost));
    }
}

struct Merge {
    start_ns: i64,
    signs: Vec<i8>,
    cards: Vec<Option<u8>>,
    west: &'static Site,
    east: &'static Site,
}

#[derive(Default)]
struct Half {
    clock: Option<Clock>,
    records: BTreeMap<u32, Record>,
    finished: bool,
    count: usize,
}

impl Merge {
    fn tick(&self, k: u32) -> i64 {
        self.start_ns + SPACING_NS * i64::from(k)
    }

    fn rel(&self, k: u32, ns: i64, clock: Option<Clock>) -> i64 {
        (ns + clock.map_or(0, |c| c.offset_ns) - self.tick(k)) / 1_000
    }

    fn row(
        &self,
        k: u32,
        west: Option<&Record>,
        east: Option<&Record>,
        clocks: [Option<Clock>; 2],
    ) -> Row {
        let code = |r: Option<&Record>| crate::plan::answer_code(r.and_then(|r| r.answer)) as u8;
        let at = |r: Option<&Record>, clock, f: fn(&Record) -> Option<i64>| {
            r.and_then(f).map(|ns| self.rel(k, ns, clock))
        };

        Row(
            k,
            west.map(|r| r.dial),
            east.map(|r| r.dial),
            code(west),
            code(east),
            self.signs.get(k as usize).copied().unwrap_or(1),
            at(west, clocks[0], |r| Some(r.dial_ns)),
            at(west, clocks[0], |r| Some(r.commit_ns)),
            at(east, clocks[1], |r| Some(r.dial_ns)),
            at(east, clocks[1], |r| Some(r.commit_ns)),
            at(west, clocks[0], |r| r.heard_ns),
            self.cards.get(k as usize).copied().flatten(),
        )
    }

    async fn run(
        &self,
        mut heard: mpsc::UnboundedReceiver<(Side, Heard)>,
        deadline_ns: i64,
        tx: &mpsc::UnboundedSender<Event>,
    ) {
        let mut halves = [Half::default(), Half::default()];
        let mut clocks_sent = false;
        let mut next = 0u32;
        let total = self.signs.len() as u32;
        let mut pending = Vec::new();
        let mut flushed = tokio::time::Instant::now();

        loop {
            let left = Duration::from_nanos((deadline_ns - now_ns()).max(0) as u64);
            let item = tokio::time::timeout(left.min(FLUSH), heard.recv()).await;
            let mut closed = false;

            match item {
                Ok(Some((side, item))) => {
                    let (half, site) = match side {
                        Side::West => (&mut halves[0], self.west),
                        Side::East => (&mut halves[1], self.east),
                    };

                    match item {
                        Heard::Clock(clock) => half.clock = Some(clock),
                        Heard::Records(records) => {
                            half.count += records.len();
                            half.records.extend(records.into_iter().map(|r| (r.k, r)));
                        }
                        Heard::End => half.finished = true,
                        Heard::Lost => {
                            half.finished = true;
                            let after = half.records.keys().next_back().copied();
                            let _ = tx.send(Event::Lost {
                                site: site.id,
                                after,
                            });
                        }
                    }
                }
                Ok(None) => closed = true,
                Err(_) => {}
            }

            if !clocks_sent
                && (halves[0].clock.is_some() || halves[0].finished)
                && (halves[1].clock.is_some() || halves[1].finished)
            {
                clocks_sent = true;
                let _ = tx.send(Event::Clocks {
                    west: halves[0].clock.unwrap_or_else(Clock::unmeasured),
                    east: halves[1].clock.unwrap_or_else(Clock::unmeasured),
                });
            }

            let over = closed || now_ns() >= deadline_ns;

            while next < total {
                let ready = |h: &Half| h.finished || over || h.records.contains_key(&next);

                if !ready(&halves[0]) || !ready(&halves[1]) {
                    break;
                }

                let clocks = [halves[0].clock, halves[1].clock];

                pending.push(self.row(
                    next,
                    halves[0].records.get(&next),
                    halves[1].records.get(&next),
                    clocks,
                ));
                next += 1;
            }

            if !pending.is_empty() && (flushed.elapsed() >= FLUSH || next == total) {
                let _ = tx.send(Event::Trials {
                    rows: std::mem::take(&mut pending),
                });
                flushed = tokio::time::Instant::now();
            }

            if next == total || over {
                break;
            }
        }

        if !pending.is_empty() {
            let _ = tx.send(Event::Trials { rows: pending });
        }

        let _ = tx.send(Event::Done {
            west: halves[0].count,
            east: halves[1].count,
        });
    }
}
