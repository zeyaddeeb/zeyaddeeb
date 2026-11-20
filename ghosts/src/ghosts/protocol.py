from __future__ import annotations

import hashlib
import tomllib
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
METHOD = ROOT / "method.toml"


@dataclass(frozen=True)
class ModelSpec:
    key: str
    repo: str
    family: str
    instruct: bool
    chat: str
    vision: bool
    revision: str | None = None


@dataclass(frozen=True)
class Protocol:
    sha: str
    raw: dict[str, Any]
    models: dict[str, ModelSpec]
    eval_seed: int
    bootstrap: int
    permutations: int


def seal(path: Path = METHOD) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@cache
def load(path: Path = METHOD) -> Protocol:
    raw = tomllib.loads(path.read_text())
    models = {k: ModelSpec(key=k, **v) for k, v in raw["models"].items()}
    return Protocol(
        sha=seal(path),
        raw=raw,
        models=models,
        eval_seed=int(raw["seeds"]["evaluation"]),
        bootstrap=int(raw["seeds"]["bootstrap"]),
        permutations=int(raw["seeds"].get("permutations", 0)),
    )
