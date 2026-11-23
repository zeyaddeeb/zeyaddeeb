use crate::{
    census::{census_by, Census, KNUTH_FOUR},
    circuit::Circuit,
    families::{catalog, Explicit},
    improve::{
        loss_key, mean_log_gain, propose, verdict, MoveStats, Pair, Trial, MINIMUM_PAIRS, PAIRS,
    },
    lemmas::{key, Lemmas, Source},
    method::Method,
    synth::{attempt_with_pairs, cuts, pair_cuts, Attempt, Budget, Outcome},
    table::Table,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub const FIRST_LIMIT_SECONDS: u64 = 60;
pub const GROWTH: u64 = 10;
pub const TRIAL_EVERY_MILLIS: u64 = 20 * 60 * 1000;
pub const BENCHMARK_MILLIS: std::ops::RangeInclusive<u64> = 300..=60_000;
pub const EXTENDED_BENCHMARK_MILLIS: std::ops::RangeInclusive<u64> = 300..=300_000;
const MAX_FRONTIER_BENCH: usize = 2;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Known {
    pub id: &'static str,
    pub size: usize,
    pub source: &'static str,
}

pub const KNOWN: &[Known] = &[
    Known {
        id: "parity-3",
        size: 2,
        source: "n − 1 for parity of n inputs",
    },
    Known {
        id: "parity-4",
        size: 3,
        source: "n − 1 for parity of n inputs",
    },
    Known {
        id: "parity-5",
        size: 4,
        source: "n − 1 for parity of n inputs",
    },
    Known {
        id: "parity-6",
        size: 5,
        source: "n − 1 for parity of n inputs",
    },
    Known {
        id: "majority-3",
        size: 4,
        source: "Kulikov, DATE 2018",
    },
    Known {
        id: "mod3-3",
        size: 3,
        source: "Knuth, TAOCP 4 Fascicle 6",
    },
    Known {
        id: "mod3-4",
        size: 7,
        source: "Knuth, TAOCP 4 Fascicle 6",
    },
    Known {
        id: "mod3-5",
        size: 10,
        source: "Knuth, TAOCP 4 Fascicle 6",
    },
    Known {
        id: "mod3-6",
        size: 12,
        source: "Knuth, TAOCP 4 Fascicle 6",
    },
];

pub fn known(id: &str) -> Option<Known> {
    KNOWN.iter().copied().find(|known| known.id == id)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Calibration {
    pub at: i64,
    pub census: Census,
    pub expected: Vec<u64>,
    pub matches: bool,
    #[serde(default)]
    pub method: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Study {
    pub id: String,
    pub table: Table,
    pub lower: usize,
    pub size: Option<usize>,
    pub circuit: Option<Circuit>,
    pub limit_seconds: u64,
    pub attempts: Vec<Stamped>,
    pub proof: Option<String>,
    #[serde(default)]
    pub purpose: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stamped {
    pub at: i64,
    pub limit_seconds: u64,
    #[serde(flatten)]
    pub attempt: Attempt,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub started: i64,
    pub calibration: Option<Calibration>,
    pub studies: Vec<Study>,
    #[serde(default)]
    pub lemmas: Lemmas,
    #[serde(default)]
    pub methods: Vec<Method>,
    #[serde(default)]
    pub incumbent: u64,
    #[serde(default)]
    pub trials: Vec<Trial>,
    #[serde(default)]
    pub moves: BTreeMap<String, MoveStats>,
    #[serde(default)]
    pub since_trial_millis: u64,
}

impl Record {
    pub fn method(&self) -> Method {
        self.methods
            .iter()
            .find(|m| m.version == self.incumbent)
            .cloned()
            .unwrap_or_default()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Working {
    pub id: String,
    pub gates: usize,
    pub since: i64,
    pub limit_seconds: u64,
    pub lemmas: u64,
    pub note: Option<String>,
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

pub struct Lab {
    pub data: PathBuf,
    pub workers: usize,
    pub trial_every: u64,
    record: Mutex<Record>,
    working: Mutex<Option<Working>>,
    progress: Arc<AtomicU64>,
    cancel: Arc<AtomicBool>,
}

struct NextQuestion {
    id: String,
    table: Table,
    gates: usize,
    limit_seconds: u64,
    restricted: Vec<usize>,
    restricted_pairs: Vec<(usize, usize, usize)>,
}

impl Lab {
    pub fn open(data: impl AsRef<Path>, workers: usize) -> anyhow::Result<Arc<Self>> {
        let data = data.as_ref().to_path_buf();

        std::fs::create_dir_all(data.join("proofs"))?;

        let mut record: Record = match std::fs::read(data.join("record.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Record {
                started: now(),
                ..Record::default()
            },
            Err(error) => return Err(error.into()),
        };

        for explicit in catalog() {
            match record.studies.iter_mut().find(|s| s.id == explicit.id) {
                Some(study) if study.table != explicit.table => {
                    *study = Study::new(&explicit);
                }
                Some(_) => {}
                None => record.studies.push(Study::new(&explicit)),
            }
        }

        let ids: Vec<String> = catalog().into_iter().map(|e| e.id).collect();

        let covered: Vec<String> = record
            .studies
            .iter()
            .filter(|s| s.purpose.is_none() && s.table.inputs <= 5)
            .map(|s| key(s.table))
            .collect();

        record.studies.retain(|study| {
            ids.contains(&study.id)
                || (study.purpose.is_some() && !covered.contains(&key(study.table)))
        });

        if record.methods.is_empty() {
            record.methods.push(Method::default());
        } else {
            for method in &mut record.methods {
                method.sanitize();
            }
        }

        if record.incumbent == 0 {
            record.incumbent = 1;
        }

        let synced: Vec<(Table, usize, bool, Source)> = record
            .studies
            .iter()
            .filter_map(|study| {
                let source = if study.purpose.is_some() {
                    Source::Auxiliary
                } else {
                    Source::Study
                };

                if let Some(size) = study.size {
                    Some((study.table, size, true, source))
                } else if study.lower > 1 {
                    Some((study.table, study.lower, false, source))
                } else {
                    None
                }
            })
            .collect();

        for (table, lower, exact, source) in synced {
            record.lemmas.learn(table, lower, exact, source);
        }

        let trial_every = std::env::var("GATES_TRIAL_EVERY_SECONDS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .map_or(TRIAL_EVERY_MILLIS, |seconds| seconds * 1000);

        Ok(Arc::new(Lab {
            data,
            workers: workers.max(1),
            trial_every,
            record: Mutex::new(record),
            working: Mutex::new(None),
            progress: Arc::new(AtomicU64::new(0)),
            cancel: Arc::new(AtomicBool::new(false)),
        }))
    }

    pub fn proofs(&self) -> PathBuf {
        self.data.join("proofs")
    }

    pub fn record(&self) -> Record {
        self.record.lock().expect("record lock").clone()
    }

    pub fn working(&self) -> Option<Working> {
        self.working
            .lock()
            .expect("working lock")
            .clone()
            .map(|mut working| {
                working.lemmas = self.progress.load(Ordering::Relaxed);
                working
            })
    }

    pub fn stop(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    fn stopped(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    fn save(&self) -> anyhow::Result<()> {
        let bytes = serde_json::to_vec(&*self.record.lock().expect("record lock"))?;
        let partial = self.data.join("record.json.partial");

        std::fs::write(&partial, bytes)?;
        std::fs::rename(partial, self.data.join("record.json"))?;

        Ok(())
    }

    fn budget(&self, limit: Duration) -> Budget {
        self.progress.store(0, Ordering::Relaxed);

        Budget {
            limit,
            cancel: self.cancel.clone(),
            progress: self.progress.clone(),
            proofs: self.proofs(),
        }
    }

    pub fn method(&self) -> Method {
        self.record.lock().expect("record lock").method()
    }

    fn calibrate(&self) -> anyhow::Result<()> {
        let method = self.method();

        *self.working.lock().expect("working lock") = Some(Working {
            id: "census-4".into(),
            gates: 0,
            since: now(),
            limit_seconds: 0,
            lemmas: 0,
            note: None,
        });

        let budget = self.budget(Duration::from_secs(3600));
        let mut smaller = Vec::new();

        for inputs in [2, 3] {
            smaller.push(census_by(inputs, &budget, self.workers, &method)?);
        }

        let found = census_by(4, &budget, self.workers, &method)?;

        *self.working.lock().expect("working lock") = None;

        if self.stopped() {
            return Ok(());
        }

        if (found.unresolved != 0 || found.by_size != KNUTH_FOUR) && method.version != 1 {
            tracing::error!(
                version = method.version,
                "the census disagrees under the current method; going back to the first one"
            );

            self.record.lock().expect("record lock").incumbent = 1;

            return self.calibrate();
        }

        {
            let mut record = self.record.lock().expect("record lock");

            for counted in smaller.iter().chain([&found]) {
                for &(table, size) in &counted.sizes {
                    record.lemmas.learn(table, size, true, Source::Census);
                }
            }
        }

        let matches = found.unresolved == 0 && found.by_size == KNUTH_FOUR;

        if matches {
            tracing::info!(millis = found.millis, "the census reproduces Knuth's table");
        } else {
            tracing::error!(by_size = ?found.by_size, "the census disagrees with Knuth's table");
        }

        self.record.lock().expect("record lock").calibration = Some(Calibration {
            at: now(),
            census: found,
            expected: KNUTH_FOUR.to_vec(),
            matches,
            method: method.version,
        });

        self.save()
    }

    fn benchmark(&self) -> Vec<(String, Table, usize, u64, bool)> {
        let record = self.record.lock().expect("record lock");
        let mut primary: Vec<(i64, String, Table, usize, u64)> = Vec::new();
        let mut extended: Vec<(i64, String, Table, usize, u64)> = Vec::new();
        let mut frontier: Vec<(i64, String, Table, usize, u64)> = Vec::new();

        for study in &record.studies {
            let restricted = record.lemmas.restricted(study.table);

            for stamped in &study.attempts {
                let attempt = &stamped.attempt;

                if cuts(attempt.gates, &restricted)
                    .iter()
                    .any(|cut| cut.fanout == 0)
                {
                    continue;
                }

                match &attempt.outcome {
                    Outcome::Impossible { .. } => {
                        if BENCHMARK_MILLIS.contains(&attempt.millis) {
                            primary.push((
                                stamped.at,
                                study.id.clone(),
                                study.table,
                                attempt.gates,
                                attempt.millis,
                            ));
                        } else if EXTENDED_BENCHMARK_MILLIS.contains(&attempt.millis) {
                            extended.push((
                                stamped.at,
                                study.id.clone(),
                                study.table,
                                attempt.gates,
                                attempt.millis,
                            ));
                        }
                    }
                    Outcome::Unknown { reason }
                        if study.size.is_none()
                            && study.lower == attempt.gates
                            && reason.starts_with("no answer within") =>
                    {
                        frontier.push((
                            stamped.at,
                            study.id.clone(),
                            study.table,
                            attempt.gates,
                            attempt.millis,
                        ));
                    }
                    _ => {}
                }
            }
        }

        primary.sort_by_key(|entry| std::cmp::Reverse(entry.0));
        extended.sort_by_key(|entry| std::cmp::Reverse(entry.0));
        frontier.sort_by_key(|entry| std::cmp::Reverse(entry.0));

        let mut solved: Vec<(String, Table, usize, u64, bool)> = Vec::new();

        for (_, id, table, gates, millis) in primary.into_iter().chain(extended) {
            if solved.len() == PAIRS {
                break;
            }

            if !solved.iter().any(|c| c.0 == id && c.2 == gates) {
                solved.push((id, table, gates, millis, true));
            }
        }

        let mut chosen = solved;
        let mut open_slots: Vec<(String, Table, usize, u64, bool)> = Vec::new();

        for (_, id, table, gates, millis) in frontier {
            if open_slots.len() == MAX_FRONTIER_BENCH {
                break;
            }

            if !chosen.iter().any(|c| c.0 == id && c.2 == gates)
                && !open_slots.iter().any(|c| c.0 == id && c.2 == gates)
            {
                open_slots.push((id, table, gates, millis, false));
            }
        }

        if !open_slots.is_empty() && chosen.len() >= MINIMUM_PAIRS {
            let keep_solved = PAIRS.saturating_sub(open_slots.len()).max(MINIMUM_PAIRS);

            chosen.truncate(keep_solved);

            for item in open_slots {
                if chosen.len() == PAIRS {
                    break;
                }

                chosen.push(item);
            }
        }

        chosen
    }

    fn trial_due(&self) -> bool {
        let record = self.record.lock().expect("record lock");
        let last = record.trials.last().map_or(0, |t| t.millis);

        record.since_trial_millis >= self.trial_every.max(2 * last)
    }

    fn race(
        &self,
        table: Table,
        gates: usize,
        cap: Duration,
        method: &Method,
    ) -> (Option<u64>, u64, bool) {
        let (restricted, restricted_pairs) = {
            let record = self.record.lock().expect("record lock");

            (
                record.lemmas.restricted(table),
                record.lemmas.restricted_pairs(table),
            )
        };
        let budget = self.budget(cap);
        let cut = cuts(gates, &restricted);
        let pcut = pair_cuts(gates, &restricted, &restricted_pairs);

        match attempt_with_pairs(table, gates, &budget, false, &cut, &pcut, method) {
            Ok(tried) => match tried.outcome {
                Outcome::Impossible { proof } => (Some(proof.lemmas), tried.millis, false),
                Outcome::Found { .. } => (None, tried.millis, true),
                Outcome::Unknown { .. } => (None, tried.millis, false),
            },
            Err(error) => {
                tracing::warn!(%error, "a trial run failed");

                (None, cap.as_millis() as u64, false)
            }
        }
    }

    fn trial(&self) -> anyhow::Result<()> {
        let bench = self.benchmark();

        if bench.iter().filter(|entry| entry.4).count() < MINIMUM_PAIRS {
            return Ok(());
        }

        let signature = bench
            .iter()
            .map(|(id, _, gates, _, _)| format!("{id}:{gates}"))
            .collect::<Vec<_>>()
            .join(",");

        let incumbent = self.method();

        let (number, change, version) = {
            let record = self.record.lock().expect("record lock");
            let mut avoid: BTreeSet<String> = BTreeSet::new();

            avoid.insert(incumbent.recipe_key());

            if let Some(parent_version) = incumbent.parent {
                if let Some(parent) = record.methods.iter().find(|m| m.version == parent_version) {
                    avoid.insert(parent.recipe_key());
                }
            }

            for past in &record.trials {
                if past.benchmark == signature && past.incumbent == incumbent.version {
                    avoid.insert(past.candidate.recipe_key());
                }

                if past.benchmark == signature && past.kept {
                    if let Some(older) = record.methods.iter().find(|m| m.version == past.incumbent)
                    {
                        avoid.insert(older.recipe_key());
                    }
                }
            }

            (
                record.trials.len() as u64 + 1,
                propose(&incumbent, &record.moves, &signature, &avoid),
                record.methods.iter().map(|m| m.version).max().unwrap_or(1) + 1,
            )
        };

        let Some(change) = change else {
            self.record.lock().expect("record lock").since_trial_millis = 0;

            return Ok(());
        };

        let mut candidate = change.apply(&incumbent);

        candidate.version = version;

        tracing::info!(number, change = %change.id(), "a trial begins");

        *self.working.lock().expect("working lock") = Some(Working {
            id: format!("trial-{number}"),
            gates: 0,
            since: now(),
            limit_seconds: 0,
            lemmas: 0,
            note: Some(change.label()),
        });

        let began = Instant::now();
        let mut pairs = Vec::new();
        let mut conflict = false;

        for (at, (id, table, gates, recorded, proved_impossible)) in bench.iter().enumerate() {
            if self.stopped() {
                *self.working.lock().expect("working lock") = None;

                return Ok(());
            }

            let cap = if *proved_impossible {
                Duration::from_millis((recorded * 4).clamp(10_000, 120_000))
            } else {
                Duration::from_secs(60)
            };

            let (before, after) = if at % 2 == 0 {
                let before = self.race(*table, *gates, cap, &incumbent);

                (before, self.race(*table, *gates, cap, &candidate))
            } else {
                let after = self.race(*table, *gates, cap, &candidate);

                (self.race(*table, *gates, cap, &incumbent), after)
            };

            if *proved_impossible && (before.2 || after.2) {
                tracing::error!(%id, gates, "a circuit appeared where one had been proved impossible");
                conflict = true;
            }

            pairs.push(Pair {
                id: id.clone(),
                gates: *gates,
                before: before.0,
                after: after.0,
                before_millis: before.1,
                after_millis: after.1,
            });
        }

        let (wins, losses, ties, p, passes) = verdict(&pairs);
        let gain = mean_log_gain(&pairs);
        let mut census = None;

        if passes && !conflict && !self.stopped() {
            *self.working.lock().expect("working lock") = Some(Working {
                id: format!("trial-{number}-census"),
                gates: 0,
                since: now(),
                limit_seconds: 0,
                lemmas: 0,
                note: Some(change.label()),
            });

            match census_by(
                4,
                &self.budget(Duration::from_secs(3600)),
                self.workers,
                &candidate,
            ) {
                Ok(found) => {
                    let reference: HashMap<Table, usize> = self
                        .record
                        .lock()
                        .expect("record lock")
                        .calibration
                        .as_ref()
                        .map(|c| c.census.sizes.iter().copied().collect())
                        .unwrap_or_default();

                    let sizes: HashMap<Table, usize> = found.sizes.iter().copied().collect();

                    census = Some(
                        found.unresolved == 0
                            && found.by_size == KNUTH_FOUR
                            && !reference.is_empty()
                            && sizes == reference,
                    );
                }
                Err(error) => {
                    tracing::error!(number, %error, "the candidate census failed");
                    census = Some(false);
                }
            }
        }

        *self.working.lock().expect("working lock") = None;

        if self.stopped() {
            return Ok(());
        }

        let kept = census == Some(true);
        let lost_marker = loss_key(&incumbent, &signature);

        {
            let mut record = self.record.lock().expect("record lock");
            let stats = record.moves.entry(change.id()).or_default();

            stats.tried += 1;
            stats.gain_sum += gain;

            if kept {
                stats.kept += 1;
                stats.lost_on = None;
            } else {
                stats.lost_on = Some(lost_marker);
            }

            if kept {
                record.methods.push(candidate.clone());
                record.incumbent = candidate.version;
            }

            record.trials.push(Trial {
                number,
                at: now(),
                change: change.id(),
                label: change.label(),
                incumbent: incumbent.version,
                candidate,
                pairs,
                wins,
                losses,
                ties,
                p,
                census,
                kept,
                millis: began.elapsed().as_millis() as u64,
                benchmark: signature,
            });

            record.since_trial_millis = 0;
        }

        tracing::info!(number, wins, losses, p, kept, "a trial ends");

        self.save()
    }

    fn plan(&self) {
        let mut record = self.record.lock().expect("record lock");
        let mut wanted: Vec<(String, Table, String)> = Vec::new();
        let covered: Vec<String> = record
            .studies
            .iter()
            .filter(|s| s.purpose.is_none() && s.table.inputs <= 5)
            .map(|s| key(s.table))
            .collect();

        for study in record
            .studies
            .iter()
            .filter(|s| s.size.is_none() && s.purpose.is_none())
        {
            for restriction in record.lemmas.restrictions(study.table) {
                if restriction.exact {
                    continue;
                }

                let canonical = key(restriction.table);
                let id = format!("aux-{}", canonical.replace(':', "-"));

                if covered.contains(&canonical)
                    || record.studies.iter().any(|s| s.id == id)
                    || wanted.iter().any(|w| w.0 == id)
                {
                    continue;
                }

                wanted.push((id, restriction.table.essential(), study.id.clone()));
            }
        }

        for (id, table, purpose) in wanted {
            tracing::info!(%id, %purpose, "an auxiliary problem comes first");
            record.studies.push(Study::auxiliary(id, table, purpose));
        }
    }

    fn next(&self) -> Option<NextQuestion> {
        self.plan();

        let record = self.record.lock().expect("record lock");

        record
            .studies
            .iter()
            .filter(|study| study.size.is_none())
            .min_by_key(|study| {
                (
                    study.limit_seconds,
                    study.table.inputs,
                    study.purpose.is_none(),
                    study.lower,
                    study.id.clone(),
                )
            })
            .map(|study| NextQuestion {
                id: study.id.clone(),
                table: study.table,
                gates: study.lower,
                limit_seconds: study.limit_seconds,
                restricted: record.lemmas.restricted(study.table),
                restricted_pairs: record.lemmas.restricted_pairs(study.table),
            })
    }

    fn settle(&self, id: &str, limit_seconds: u64, tried: Attempt) -> anyhow::Result<()> {
        let mut stale = None;
        let mut keep_file = None;

        {
            let mut record = self.record.lock().expect("record lock");
            let mut rollback = false;
            let study = record
                .studies
                .iter_mut()
                .find(|study| study.id == id)
                .ok_or_else(|| anyhow::anyhow!("{id} vanished from the record"))?;

            let source = if study.purpose.is_some() {
                Source::Auxiliary
            } else {
                Source::Study
            };

            let learned = match &tried.outcome {
                Outcome::Impossible { proof } => {
                    study.lower = tried.gates + 1;

                    if let Some(file) = &proof.file {
                        keep_file = Some(file.clone());
                        stale = study.proof.replace(file.clone());
                    }

                    Some((study.table, tried.gates + 1, false))
                }
                Outcome::Found { circuit } => {
                    study.size = Some(tried.gates);
                    study.circuit = Some(circuit.clone());

                    Some((study.table, tried.gates, true))
                }
                Outcome::Unknown { reason } => {
                    if reason.starts_with("the solver said no, but its proof failed:") {
                        tracing::error!(
                            %id,
                            gates = tried.gates,
                            method = tried.method,
                            %reason,
                            "proof verification failed"
                        );

                        if tried.method != 1 {
                            rollback = true;
                        }
                    } else {
                        study.limit_seconds = study.limit_seconds.saturating_mul(GROWTH);
                    }

                    None
                }
            };

            study.attempts.push(Stamped {
                at: now(),
                limit_seconds,
                attempt: tried,
            });

            if let Some((table, lower, exact)) = learned {
                record.lemmas.learn(table, lower, exact, source);
            }

            if rollback {
                tracing::error!("rolling back incumbent method to version 1 after proof failure");
                record.incumbent = 1;
            }
        }

        if let Some(stale) = stale {
            if keep_file.as_deref() != Some(stale.as_str()) {
                for extension in ["lrat", "cnf"] {
                    let _ =
                        std::fs::remove_file(self.proofs().join(format!("{stale}.{extension}")));
                }
            }
        }

        self.save()
    }

    pub fn run(self: Arc<Self>) {
        tracing::info!(workers = self.workers, "the lab opens");

        if let Err(error) = self.calibrate() {
            tracing::error!(%error, "the census failed; no research until it passes");

            return;
        }

        if !self.record().calibration.is_some_and(|c| c.matches) {
            tracing::error!("the census disagrees with Knuth; no research until it passes");

            return;
        }

        while !self.stopped() {
            let Some(NextQuestion {
                id,
                table,
                gates,
                limit_seconds,
                restricted,
                restricted_pairs,
            }) = self.next()
            else {
                tracing::info!("every study is settled");

                while !self.stopped() {
                    std::thread::sleep(Duration::from_secs(5));
                }

                break;
            };

            *self.working.lock().expect("working lock") = Some(Working {
                id: id.clone(),
                gates,
                since: now(),
                limit_seconds,
                lemmas: 0,
                note: None,
            });

            let cut = cuts(gates, &restricted);
            let pcut = pair_cuts(gates, &restricted, &restricted_pairs);

            tracing::info!(
                %id,
                gates,
                limit_seconds,
                cuts = cut.len(),
                pair_cuts = pcut.len(),
                "asking for a smaller circuit"
            );

            let budget = self.budget(Duration::from_secs(limit_seconds));
            let method = self.method();
            let tried = attempt_with_pairs(table, gates, &budget, true, &cut, &pcut, &method);

            *self.working.lock().expect("working lock") = None;

            if self.stopped() {
                break;
            }

            match tried {
                Ok(tried) => {
                    self.record.lock().expect("record lock").since_trial_millis += tried.millis;

                    if let Err(error) = self.settle(&id, limit_seconds, tried) {
                        tracing::error!(%error, "could not record the attempt");
                    }

                    if self.trial_due() {
                        if let Err(error) = self.trial() {
                            tracing::error!(%error, "the trial failed");
                        }
                    }
                }
                Err(error) => {
                    tracing::error!(%id, gates, %error, "the attempt failed");

                    let mut record = self.record.lock().expect("record lock");

                    if let Some(study) = record.studies.iter_mut().find(|s| s.id == id) {
                        study.limit_seconds = study.limit_seconds.saturating_mul(GROWTH);
                    }
                }
            }
        }

        tracing::info!("the lab closes");
    }
}

impl Study {
    pub fn new(explicit: &Explicit) -> Self {
        Study {
            id: explicit.id.clone(),
            table: explicit.table,
            lower: if explicit.table.free().is_some() {
                0
            } else {
                1
            },
            size: explicit.table.free().map(|_| 0),
            circuit: None,
            limit_seconds: FIRST_LIMIT_SECONDS,
            attempts: Vec::new(),
            proof: None,
            purpose: None,
        }
    }

    pub fn auxiliary(id: String, table: Table, purpose: String) -> Self {
        Study {
            id,
            table,
            lower: if table.free().is_some() { 0 } else { 1 },
            size: table.free().map(|_| 0),
            circuit: None,
            limit_seconds: FIRST_LIMIT_SECONDS,
            attempts: Vec::new(),
            proof: None,
            purpose: Some(purpose),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_known_value_names_a_catalog_entry() {
        let ids: Vec<String> = catalog().into_iter().map(|e| e.id).collect();

        for known in KNOWN {
            assert!(ids.contains(&known.id.to_string()), "{}", known.id);
        }
    }

    fn stamped(at: i64, gates: usize, millis: u64) -> Stamped {
        Stamped {
            at,
            limit_seconds: 60,
            attempt: Attempt {
                gates,
                variables: 1,
                clauses: 1,
                millis,
                outcome: Outcome::Impossible {
                    proof: crate::synth::Proof {
                        lemmas: 10,
                        hints: 10,
                        bytes: 10,
                        check_millis: 1,
                        file: None,
                    },
                },
                cuts: Vec::new(),
                pair_cuts: Vec::new(),
                method: 1,
            },
        }
    }

    #[test]
    fn the_benchmark_takes_recent_distinct_rungs_of_useful_length() {
        let data = std::env::temp_dir().join(format!("gates-bench-{}", std::process::id()));
        let lab = Lab::open(&data, 1).unwrap();

        {
            let mut record = lab.record.lock().unwrap();

            record.studies[0].attempts = vec![
                stamped(1, 3, 5_000),
                stamped(2, 3, 5_000),
                stamped(3, 4, 50),
                stamped(4, 5, 400_000),
            ];

            for (at, study) in record.studies.iter_mut().enumerate().skip(1).take(10) {
                study.attempts = vec![stamped(10 + at as i64, 2, 1_000)];
            }
        }

        let bench = lab.benchmark();

        assert_eq!(bench.len(), PAIRS);
        assert!(bench
            .iter()
            .all(|(_, _, _, millis, _)| BENCHMARK_MILLIS.contains(millis)));
        assert!(!bench
            .iter()
            .any(|(id, _, gates, _, _)| id == &lab.record().studies[0].id && *gates == 3));

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn proof_failure_rolls_back_method_without_expanding_limit() {
        let data = std::env::temp_dir().join(format!("gates-rollback-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);

        let lab = Lab::open(&data, 1).unwrap();
        let study_id = lab.record().studies[0].id.clone();

        {
            let mut record = lab.record.lock().unwrap();
            let v2 = Method {
                version: 2,
                ..Method::default()
            };

            record.methods.push(v2);
            record.incumbent = 2;
        }

        lab.settle(
            &study_id,
            60,
            Attempt {
                gates: 1,
                variables: 1,
                clauses: 1,
                millis: 10,
                outcome: Outcome::Unknown {
                    reason: "the solver said no, but its proof failed: bad hint".into(),
                },
                cuts: Vec::new(),
                pair_cuts: Vec::new(),
                method: 2,
            },
        )
        .unwrap();

        let record = lab.record();

        assert_eq!(record.incumbent, 1);
        assert_eq!(record.studies[0].limit_seconds, FIRST_LIMIT_SECONDS);

        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn a_reopened_lab_keeps_its_record() {
        let data = std::env::temp_dir().join(format!("gates-lab-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);

        let lab = Lab::open(&data, 1).unwrap();
        let first = lab.record().studies.len();

        assert_eq!(first, catalog().len());

        lab.record.lock().unwrap().studies[0].lower = 3;
        lab.save().unwrap();

        let reopened = Lab::open(&data, 1).unwrap();

        assert_eq!(reopened.record().studies[0].lower, 3);
        let _ = std::fs::remove_dir_all(&data);
    }
}
