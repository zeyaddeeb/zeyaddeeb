import json
import time
from dataclasses import asdict
from pathlib import Path

import torch

from kin.inherit import inherit
from kin.protocol import ROOT, load
from kin.score import accuracy, agreement, paternity, spare
from kin.suspects import lineup, parent, references

RUNS = ROOT / "runs"


def run_dir() -> Path:
    return RUNS / load().sha[:12]


def seed_path(seed: int) -> Path:
    return run_dir() / f"seed-{seed:02d}.json"


def measure(seed: int) -> dict:
    torch.set_num_threads(1)
    started = time.time()
    base = parent(seed)
    floor = accuracy(base) - load().margin
    refs = references(seed)
    suspects = lineup(base, seed)
    rows = []
    for s in suspects:
        score = paternity(base, s.net, refs, seed)
        acc = accuracy(s.net)
        rows.append(
            {
                "name": s.name,
                "family": s.family,
                "agreement": agreement(base, s.net),
                "spare": spare(base, s.net),
                "accuracy": acc,
                "capable": acc >= floor,
                **asdict(score),
            }
        )
    teacher = next(s.net for s in suspects if s.name == "lie")
    lies = [asdict(r) for r in inherit(base, teacher, suspects, seed)]
    return {
        "seed": seed,
        "protocol": load().sha,
        "parent_accuracy": accuracy(base),
        "suspects": rows,
        "inherit": lies,
        "seconds": time.time() - started,
    }


def run_seed(seed: int) -> Path:
    path = seed_path(seed)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    record = measure(seed)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(record, indent=1))
    tmp.rename(path)
    return path


def records() -> list[dict]:
    return [
        json.loads(p.read_text())
        for p in sorted(run_dir().glob("seed-*.json"))
    ]
