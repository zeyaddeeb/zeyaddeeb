import json
import statistics
import time

from .bench import predict
from .config import REPORTS, ROOT, fit_sha256, labels_sha256, method
from .sources.fetch import sha256

WWW = ROOT.parent / "www" / "apps" / "www"
MODULE = WWW / "features" / "bedside" / "snapshot.json"
GENES = WWW / "public" / "bedside" / "genes.json"
EXPLORED = REPORTS / "explore.json"
SMALLEST = 15
VERDICT_CODES = {"no call": 0, "held up": 1, "reversed": 2, "unresolved": 3}
CANCER_ORDER = [
    "Non-Small Cell Lung Cancer",
    "Breast Cancer",
    "Colorectal Cancer",
    "Pancreatic Cancer",
    "Prostate Cancer",
]


def _round(value: float, places: int = 3) -> float:
    return round(value, places)


def _key(p: dict) -> tuple[str, str, str]:
    return p["cancer"], p["drug_class"], p["biomarker"]


def _throw(pairs: list[dict], labeled: set) -> float:
    ratios = [
        p["patient_mean"] / p["bench_mean"]
        for p in pairs
        if _key(p) in labeled and p["verdict"] == "held up"
    ]

    return _round(statistics.median(ratios))


def _strength(cells: list[dict]) -> float:
    return max(abs(2 * c["bench_sensitizes"] - 1) for c in cells)


def _genes(pairs: list[dict]) -> list[str]:
    found: dict[str, list[dict]] = {}

    for p in pairs:
        found.setdefault(p["biomarker"], []).append(p)

    return sorted(
        found,
        key=lambda b: (
            b.startswith("altered:"),
            -_strength(found[b]),
            b,
        ),
    )


def _cell(p: dict, genes: list[str], classes: list[str], labeled: set) -> list:
    return [
        genes.index(p["biomarker"]),
        classes.index(p["drug_class"]),
        _round(p["bench_mean"]),
        _round(p["bench_sd"]),
        _round(p["bench_sensitizes"]),
        p["lines"],
        int(p["support"] == "lineage"),
        int(p["bench_confident"]),
        _round(p["patient_mean"]),
        _round(p["patient_sd"]),
        _round(p["patient_benefit"]),
        p["marked"],
        p["unmarked"],
        VERDICT_CODES[p["verdict"]],
        int(_key(p) in labeled),
        int(p["primary"]),
    ]


def _mosaic(
    pairs: list[dict], labeled: set, first: dict | None = None
) -> dict:
    order = list(method()["classes"])
    found = {}

    for cancer in CANCER_ORDER:
        chosen = [p for p in pairs if p["cancer"] == cancer]

        if not chosen:
            continue

        tested = first[cancer]["genes"] if first and cancer in first else []
        genes = _genes(chosen)
        genes = [g for g in tested if g in genes] + [
            g for g in genes if g not in tested
        ]
        classes = [
            c for c in order if any(p["drug_class"] == c for p in chosen)
        ]
        found[cancer] = {
            "genes": genes,
            "classes": classes,
            "tested": len(tested) if first else len(genes),
            "cells": [_cell(p, genes, classes, labeled) for p in chosen],
        }

    return found


def _shown(found: list[dict]) -> list[dict]:
    return [
        p
        for p in found
        if p["marked"] >= SMALLEST and p["unmarked"] >= SMALLEST
    ]


def _gate(report: dict) -> dict:
    return {
        "known": [
            {
                "cancer": k["cancer"],
                "drugClass": k["drug_class"],
                "biomarker": k["biomarker"],
                "expected": k["expected"],
                "scored": k["scored"],
                "met": k["met"],
                "probability": _round(k["probability"]),
                "hazardRatio": _round(k["effect"]["hazard_ratio"], 2)
                if k["scored"]
                else None,
                "marked": k["effect"]["marked"] if k["effect"] else 0,
                "unmarked": k["effect"]["unmarked"] if k["effect"] else 0,
            }
            for k in report["known"]
        ],
        "sensitivity": _round(report["known_rate"]),
        "met": report["known_met"],
        "scored": report["known_scored"],
        "wrong": report["known_wrong"],
        "controls": report["controls"],
        "controlSignals": report["control_signals"],
        "separation": report["separation"],
        "passed": report["passed"],
    }


def _ledger() -> list[dict]:
    return [
        {"date": h["date"], "run": h["run"], "result": h["result"]}
        for h in method()["history"]
    ]


def build(gate_report: str) -> dict:
    scored = json.loads((REPORTS / "translation.json").read_text())
    report = json.loads((REPORTS / gate_report).read_text())
    labeled = {
        (k["cancer"], k["drug_class"], k["biomarker"]) for k in report["known"]
    }
    body = {
        "version": {
            "created": time.strftime("%Y-%m-%d", time.gmtime()),
            "fit": fit_sha256()[:12],
            "labels": labels_sha256()[:12],
            "predictions": sha256(predict.PREDICTIONS)[:12],
            "sealed": json.loads(predict.PREDICTIONS.read_text())["created"],
            "sources": {
                "patients": method()["data"]["chord"]["citation"],
                "cells": method()["data"]["depmap"]["release"],
                "screen": method()["data"]["prism"]["release"],
            },
        },
        "gate": _gate(report),
        "translation": {
            "slope": scored["slopes"]["g0"],
            "classes": scored["slopes"]["classes"],
            "primary": scored["primary"],
            "controls": scored["positive_controls"],
            "throw": _throw(scored["pairs"], labeled),
        },
        "mosaic": _mosaic(_shown(scored["pairs"]), labeled),
        "ledger": _ledger(),
    }
    MODULE.parent.mkdir(parents=True, exist_ok=True)
    MODULE.write_text(
        json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    )

    found = scored["pairs"]

    if EXPLORED.exists():
        found = found + json.loads(EXPLORED.read_text())["pairs"]

    lookup = _mosaic(_shown(found), labeled, body["mosaic"])
    GENES.parent.mkdir(parents=True, exist_ok=True)
    GENES.write_text(json.dumps({"mosaic": lookup}, separators=(",", ":")))

    return {
        "cells": sum(len(m["cells"]) for m in body["mosaic"].values()),
        "lookup": sum(len(m["cells"]) for m in lookup.values()),
    }
