import json
from dataclasses import asdict, dataclass

import duckdb
import numpy as np
from scipy.stats import hypergeom

from . import known
from .cohort import biomarkers
from .config import (
    REPORTS,
    fit_sha256,
    labels_sha256,
    method,
    method_sha256,
)
from .model import data, interaction, pool

ESTIMABLE = 15
FEWEST_CLASSES = 2
SIGNAL = 0.975
CONTROL_RATE = 0.10
WRONG = 1
SEPARATION = 0.001


@dataclass(frozen=True, slots=True)
class Posterior:
    probability_harm: float
    hazard_ratio: float
    low: float
    high: float


@dataclass(frozen=True, slots=True)
class Effect:
    cancer: str
    biomarker: str
    drug_class: str
    marked: int
    unmarked: int
    converged: bool = False
    posterior: Posterior | None = None

    def scored(self) -> Posterior | None:
        return self.posterior if self.converged else None


EMPTY = dict.fromkeys(("probability_harm", "hazard_ratio", "low", "high"))


def flat(effect: Effect) -> dict:
    found = asdict(effect)
    posterior = found.pop("posterior")

    return found | (posterior or EMPTY)


def unflat(found: dict) -> Effect:
    values = {k: found[k] for k in EMPTY}
    rest = {k: v for k, v in found.items() if k not in EMPTY}
    posterior = (
        Posterior(**values) if values["probability_harm"] is not None else None
    )

    return Effect(**rest, posterior=posterior)


def _unfitted(cancer: str, biomarker: str, counts: dict) -> list[Effect]:
    return [
        Effect(cancer, biomarker, name, marked, unmarked)
        for name, (marked, unmarked) in counts.items()
    ]


@dataclass(frozen=True, slots=True)
class Job:
    cancer: str
    biomarker: str
    counts: dict[str, tuple[int, int]]
    pieces: data.Pieces


def prepare(
    connection: duckdb.DuckDBPyConnection, cancer: str, biomarker: str
) -> Job:
    settings = method()["model"]
    loaded = data.load(
        connection, cancer, biomarker, settings["intervals_days"]
    )

    return Job(
        cancer, biomarker, loaded.counts, data.estimable(loaded, ESTIMABLE)
    )


def estimate(job: Job, settings: dict) -> list[Effect]:
    cancer, biomarker, pieces = job.cancer, job.biomarker, job.pieces
    left = {n: c for n, c in job.counts.items() if n not in pieces.classes}

    if len(pieces.classes) < FEWEST_CLASSES:
        return _unfitted(cancer, biomarker, job.counts)

    model = interaction.build(pieces, adjust_burden=biomarker != "tmb_high")
    trace = interaction.sample(model, settings, settings["seed"])
    ok = interaction.converged(trace)
    draws = interaction.interaction_draws(trace)
    found = _unfitted(cancer, biomarker, left)

    for index, name in enumerate(pieces.classes):
        effect = interaction.contrast(draws, index)
        marked, unmarked = pieces.counts[name]
        found.append(
            Effect(
                cancer=cancer,
                biomarker=biomarker,
                drug_class=name,
                marked=marked,
                unmarked=unmarked,
                converged=ok,
                posterior=Posterior(
                    probability_harm=float((effect > 0).mean()),
                    hazard_ratio=float(np.exp(np.median(effect))),
                    low=float(np.exp(np.quantile(effect, 0.025))),
                    high=float(np.exp(np.quantile(effect, 0.975))),
                ),
            )
        )

    return found


def fit(
    connection: duckdb.DuckDBPyConnection, cancer: str, biomarker: str
) -> list[Effect]:
    return estimate(prepare(connection, cancer, biomarker), method()["model"])


def _stored(connection, cancer: str, biomarker: str) -> list[Effect]:
    rows = connection.execute(
        "SELECT body FROM effect "
        "WHERE method = ? AND cancer = ? AND biomarker = ?",
        [fit_sha256(), cancer, biomarker],
    ).fetchall()

    return [unflat(json.loads(r[0])) for r in rows]


def _table(connection) -> None:
    connection.execute(
        "CREATE TABLE IF NOT EXISTS effect "
        "(method VARCHAR, cancer VARCHAR, biomarker VARCHAR, body VARCHAR)"
    )


def _store(connection, cancer: str, biomarker: str, found: list) -> None:
    connection.executemany(
        "INSERT INTO effect VALUES (?, ?, ?, ?)",
        [
            (fit_sha256(), cancer, biomarker, json.dumps(flat(e)))
            for e in found
        ],
    )
    print(f"fitted {cancer} / {biomarker}", flush=True)


def effects(connection, cancer: str, biomarker: str) -> list[Effect]:
    _table(connection)

    if found := _stored(connection, cancer, biomarker):
        return found

    found = fit(connection, cancer, biomarker)
    _store(connection, cancer, biomarker, found)

    return found


def effects_many(connection, plan: list[tuple[str, str]]) -> None:
    _table(connection)
    pool.fan_out(
        [p for p in plan if not _stored(connection, *p)],
        lambda item: prepare(connection, *item),
        estimate,
        lambda job, found: _store(
            connection, job.cancer, job.biomarker, found
        ),
        settings=method()["model"],
    )


def _known(connection) -> list[dict]:
    rows = []

    for pair in known.derive(known.labels(), method()["classes"]):
        found = {
            e.drug_class: e
            for e in effects(connection, pair.cancer, pair.biomarker)
        }
        effect = found.get(pair.drug_class)
        posterior = effect.scored() if effect else None
        harm = posterior.probability_harm if posterior else 0.5
        probability = harm if pair.expected == "harm" else 1 - harm

        rows.append(
            {
                **asdict(pair),
                "scored": posterior is not None,
                "probability": probability,
                "met": posterior is not None and probability >= 0.95,
                "effect": flat(effect) if effect else None,
            }
        )

    return rows


def _controls(connection) -> list[dict]:
    excluded = method()["gate"]["excluded"]
    rows = []

    for cancer in known.CANCERS:
        for gene in biomarkers.controls(connection, cancer, excluded):
            name = biomarkers.add_gene(connection, gene)

            for e in effects(connection, cancer, name):
                if (posterior := e.scored()) is None:
                    continue

                harm = posterior.probability_harm
                signal = not (1 - SIGNAL < harm < SIGNAL)
                rows.append({**flat(e), "signal": signal})

    return rows


def _plan(connection) -> list[tuple[str, str]]:
    excluded = method()["gate"]["excluded"]
    pairs = [
        (p.cancer, p.biomarker)
        for p in known.derive(known.labels(), method()["classes"])
    ]
    controls = [
        (cancer, biomarkers.add_gene(connection, gene))
        for cancer in known.CANCERS
        for gene in biomarkers.controls(connection, cancer, excluded)
    ]

    return list(dict.fromkeys(pairs + controls))


def run(connection: duckdb.DuckDBPyConnection) -> dict:
    effects_many(connection, _plan(connection))
    known = _known(connection)
    controls = _controls(connection)
    scored = [k for k in known if k["scored"]]
    met = sum(k["met"] for k in scored)
    wrong = sum(1 - k["probability"] >= SIGNAL for k in scored)
    signals = sum(c["signal"] for c in controls)
    known_rate = met / len(scored) if scored else 0.0
    control_rate = signals / len(controls) if controls else 0.0
    separation = float(
        hypergeom.sf(
            met - 1, len(scored) + len(controls), met + signals, len(scored)
        )
    )

    body = {
        "method_sha256": method_sha256(),
        "fit_sha256": fit_sha256(),
        "labels_sha256": labels_sha256(),
        "known": known,
        "known_scored": len(scored),
        "known_met": met,
        "known_rate": known_rate,
        "known_wrong": wrong,
        "controls": len(controls),
        "control_signals": signals,
        "control_rate": control_rate,
        "separation": separation,
        "passed": bool(
            control_rate <= CONTROL_RATE
            and wrong <= WRONG
            and separation < SEPARATION
        ),
        "control_effects": controls,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / f"gate-{method_sha256()[:12]}.json"
    path.write_text(json.dumps(body, indent=2))

    return body
