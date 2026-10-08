import hashlib
import json
import os
import tomllib
from functools import cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("BEDSIDE_DATA", ROOT / "data"))
CHORD = DATA / "chord"
REPORTS = DATA / "reports"
DB_PATH = DATA / "bedside.duckdb"
METHOD = Path(os.environ.get("BEDSIDE_METHOD", ROOT / "method.toml"))
LABELS = ROOT / "labels.toml"
FIT_SECTIONS = ("courses", "classes", "biomarkers", "model")


@cache
def method() -> dict:
    return tomllib.loads(METHOD.read_text())


@cache
def method_sha256() -> str:
    return hashlib.sha256(METHOD.read_bytes()).hexdigest()


@cache
def labels_sha256() -> str:
    return hashlib.sha256(LABELS.read_bytes()).hexdigest()


@cache
def fit_sha256() -> str:
    settings = method()
    body = {k: settings[k] for k in FIT_SECTIONS}
    body["truncating"] = settings["gate"]["truncating"]

    return hashlib.sha256(
        json.dumps(body, sort_keys=True).encode()
    ).hexdigest()
