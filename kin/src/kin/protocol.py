import hashlib
import tomllib
from dataclasses import dataclass
from functools import cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
METHOD = ROOT / "method.toml"


@dataclass(frozen=True)
class Protocol:
    layers: tuple[int, ...]
    classes: int
    lr: float
    batch: int
    epochs: int
    references: int
    lesson_steps: int
    long_steps: int
    draws: int
    clothes: tuple[int, ...]
    relabel: tuple[int, ...]
    sigma: tuple[float, ...]
    prune: tuple[float, ...]
    digits_epochs: tuple[int, ...]
    inherit_steps: int
    margin: float
    calibration: tuple[int, int]
    evaluation: tuple[int, int]
    sha: str


def seal(path: Path = METHOD) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@cache
def load(path: Path = METHOD) -> Protocol:
    raw = tomllib.loads(path.read_text())
    d = raw["suspects"]["descendants"]
    return Protocol(
        layers=tuple(raw["model"]["layers"]),
        classes=10,
        lr=raw["train"]["lr"],
        batch=raw["train"]["batch"],
        epochs=raw["train"]["epochs"],
        references=raw["references"]["count"],
        lesson_steps=raw["test"]["steps"],
        long_steps=raw["test"]["long_steps"],
        draws=raw["test"]["draws"],
        clothes=tuple(d["clothes"]["steps"]),
        relabel=tuple(d["relabel"]["steps"]),
        sigma=tuple(d["noise"]["sigma"]),
        prune=tuple(d["prune"]["fraction"]),
        digits_epochs=tuple(raw["suspects"]["imitators"]["digits"]["epochs"]),
        inherit_steps=raw["inherit"]["steps"],
        margin=raw["strata"]["margin"],
        calibration=tuple(raw["seeds"]["calibration"]),
        evaluation=tuple(raw["seeds"]["evaluation"]),
        sha=seal(path),
    )


def seeds(span: tuple[int, int]) -> list[int]:
    return list(range(span[0], span[1] + 1))
