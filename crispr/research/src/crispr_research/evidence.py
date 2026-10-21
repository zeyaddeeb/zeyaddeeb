"""Versioned observations and a fixed, withheld dependency partition."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from . import cards
from .config import DEPTHS, METHOD
from .kernels import kill, matter


def digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


@lru_cache(maxsize=32)
def _file(path: str, size: int, modified: int) -> str:
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fingerprint(path: Path) -> str:
    if not path.is_file():
        return "missing"
    stat = path.stat()
    return _file(str(path.resolve()), stat.st_size, stat.st_mtime_ns)


def provenance(kernel: str) -> dict:
    files = {"method": fingerprint(METHOD)}
    if kernel == "kill":
        files["dataset"] = fingerprint(kill.PACK)
    elif kernel == "matter":
        files["dataset"] = fingerprint(matter.bedside())
        files["cohort"] = fingerprint(
            matter.chord() / "data_clinical_patient.txt"
        )
    elif kernel == "reach":
        files["measurements"] = fingerprint(DEPTHS)
    else:
        files["dataset"] = "ClinicalTrials.gov API v2"
    return files


def experiment(card: cards.Card, source: dict) -> str:
    version = {
        key: value
        for key, value in source.items()
        if key != "method" or card.kernel == "reach"
    }
    probe = dict(card.probe)
    if card.kernel == "later":
        probe.pop("field", None)
    return digest({"kernel": card.kernel, "probe": probe, "source": version})


def reserved(gene: str) -> bool:
    return (
        int(digest(["dependency-holdout-v1", gene.upper()])[:8], 16) % 5 == 0
    )


def task(card: cards.Card) -> dict:
    value = json.loads(cards.canonical(card))
    for name in ("chance", "low", "high"):
        value.pop(name)
    return value
