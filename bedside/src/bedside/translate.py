import json
import math
from dataclasses import asdict, dataclass

import duckdb
import numpy as np
import pymc as pm

from . import gate
from .bench import predict
from .cohort import discovery
from .config import REPORTS, fit_sha256, method, method_sha256
from .model import interaction

CONFIDENT = 0.95
EXPLORE_PATIENTS = 15
Z = 1.959964
LABEL_GENES = {
    "EGFR",
    "ALK",
    "ROS1",
    "ERBB2",
    "PIK3CA",
    "ESR1",
    "KRAS",
    "NRAS",
    "BRAF",
}
KINASE = {"egfr_tki", "alk_tki", "her2", "pi3k"}
CYTOTOXIC = {
    "platinum",
    "taxane",
    "antimetabolite",
    "topoisomerase",
    "anthracycline",
}
SLOW = {"parp", "cdk46", "aromatase", "antiandrogen", "serd", "tamoxifen"}


@dataclass(frozen=True, slots=True)
class Pair:
    cancer: str
    biomarker: str
    drug_class: str
    bench_mean: float
    bench_sd: float
    bench_sensitizes: float
    bench_confident: bool
    support: str
    lines: int
    patient_mean: float
    patient_sd: float
    patient_benefit: float
    marked: int
    unmarked: int
    verdict: str
    primary: bool


def _verdict(sensitizes: float, benefit: float, confident: bool) -> str:
    if not confident:
        return "no call"

    agree = benefit if sensitizes >= CONFIDENT else 1 - benefit

    if agree >= CONFIDENT:
        return "held up"

    return "reversed" if agree <= 1 - CONFIDENT else "unresolved"


def _primary(biomarker: str) -> bool:
    return (
        biomarker.startswith("altered:")
        and biomarker.removeprefix("altered:") not in LABEL_GENES
    )


def tested(connection: duckdb.DuckDBPyConnection) -> dict[str, list[str]]:
    predicted = {p["biomarker"] for p in predict.sealed(predict.PREDICTIONS)}
    found = discovery.genes(connection)

    return {
        cancer: sorted(
            {f"altered:{g}" for g in genes} & predicted
            | {n for n in predicted if not n.startswith("altered:")}
        )
        for cancer, genes in found.items()
    }


def explored(connection: duckdb.DuckDBPyConnection) -> dict[str, list[str]]:
    predicted = {p["biomarker"] for p in predict.sealed(predict.EXPLORE)}
    discovery.genes(connection)
    chosen = sorted(n.removeprefix("altered:") for n in predicted)

    return {
        cancer: [f"altered:{g}" for g in genes]
        for cancer, genes in discovery.enough(
            connection, chosen, EXPLORE_PATIENTS
        ).items()
    }


def pairs(
    connection: duckdb.DuckDBPyConnection,
    bench: list[dict],
    plan: dict[str, list[str]],
) -> list[Pair]:
    found = []

    for b in bench:
        if not b["converged"] or b["biomarker"] not in plan.get(
            b["cancer"], []
        ):
            continue

        effects = {
            e.drug_class: e
            for e in gate.effects(connection, b["cancer"], b["biomarker"])
        }
        e = effects.get(b["drug_class"])

        if e is None or (s := e.scored()) is None:
            continue

        benefit = 1 - s.probability_harm
        found.append(
            Pair(
                cancer=b["cancer"],
                biomarker=b["biomarker"],
                drug_class=b["drug_class"],
                bench_mean=b["median"],
                bench_sd=b["sd"],
                bench_sensitizes=b["sensitizes"],
                bench_confident=b["confident"],
                support=b["support"],
                lines=b["lines"],
                patient_mean=math.log(s.hazard_ratio),
                patient_sd=(math.log(s.high) - math.log(s.low)) / (2 * Z),
                patient_benefit=benefit,
                marked=e.marked,
                unmarked=e.unmarked,
                verdict=_verdict(b["sensitizes"], benefit, b["confident"]),
                primary=_primary(b["biomarker"]),
            )
        )

    return found


def build(found: list[Pair]) -> tuple[pm.Model, list[str]]:
    classes = sorted({p.drug_class for p in found})
    index = np.array([classes.index(p.drug_class) for p in found])
    size = len(found)

    with pm.Model() as model:
        q = pm.Normal("q", 0.0, 1.0, shape=size)
        pm.Normal(
            "bench",
            q,
            np.array([p.bench_sd for p in found]),
            observed=np.array([p.bench_mean for p in found]),
        )
        g0 = pm.Normal("g0", 0.0, 1.0)
        h = pm.HalfNormal("h", 0.5)
        y = pm.Normal("y", 0.0, 1.0, shape=len(classes))
        g = g0 + h * y
        pm.Deterministic("g", g)
        r = pm.Normal("r", 0.0, 0.5, shape=len(classes))
        w = pm.HalfNormal("w", 0.5)
        noise = pm.Normal("noise", 0.0, 1.0, shape=size)
        p = r[index] + g[index] * q + w * noise
        pm.Normal(
            "patient",
            p,
            np.array([p.patient_sd for p in found]),
            observed=np.array([p.patient_mean for p in found]),
        )

    return model, classes


def _rates(found: list[Pair]) -> dict:
    called = [p for p in found if p.bench_confident]
    counts = {
        v: sum(p.verdict == v for p in called)
        for v in ("held up", "reversed", "unresolved")
    }

    return {
        "pairs": len(found),
        "confident": len(called),
        **counts,
        "held_up_rate": counts["held up"] / len(called) if called else 0.0,
        "reversed_rate": counts["reversed"] / len(called) if called else 0.0,
    }


def _slopes(found: list[Pair]) -> dict:
    model, classes = build(found)
    trace = interaction.sample(
        model, method()["model"], method()["model"]["seed"]
    )
    g0 = trace.posterior["g0"].values.ravel()
    g = trace.posterior["g"].stack(s=("chain", "draw")).values

    return {
        "converged": interaction.converged(trace, ("g0", "g")),
        "g0": {
            "median": float(np.median(g0)),
            "low": float(np.quantile(g0, 0.025)),
            "high": float(np.quantile(g0, 0.975)),
            "positive": float((g0 > 0).mean()),
        },
        "classes": {
            name: {
                "median": float(np.median(g[i])),
                "positive": float((g[i] > 0).mean()),
                "pairs": sum(p.drug_class == name for p in found),
            }
            for i, name in enumerate(classes)
        },
    }


def run(connection: duckdb.DuckDBPyConnection) -> dict:
    found = pairs(
        connection, predict.sealed(predict.PREDICTIONS), tested(connection)
    )
    primary = [p for p in found if p.primary]
    controls = [p for p in found if not p.primary]
    slopes = _slopes(primary)
    classes = slopes["classes"]

    body = {
        "method_sha256": method_sha256(),
        "fit_sha256": fit_sha256(),
        "primary": _rates(primary),
        "positive_controls": _rates(controls),
        "slopes": slopes,
        "hypothesis_one": slopes["g0"]["positive"] >= CONFIDENT,
        "hypothesis_two": {
            name: {
                "expected": "translates"
                if name in KINASE | CYTOTOXIC
                else "not",
                "positive": c["positive"],
            }
            for name, c in classes.items()
            if name in KINASE | CYTOTOXIC | SLOW
        },
        "pairs": [asdict(p) for p in found],
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "translation.json").write_text(json.dumps(body, indent=2))

    return body


def explore(connection: duckdb.DuckDBPyConnection) -> int:
    found = pairs(
        connection, predict.sealed(predict.EXPLORE), explored(connection)
    )
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "explore.json").write_text(
        json.dumps({"pairs": [asdict(p) for p in found]}, indent=2)
    )

    return len(found)
