import argparse
import json
import multiprocessing as mp
from dataclasses import asdict
from pathlib import Path

from kin.analysis import (
    calls,
    exploratory,
    inheritance,
    kinds,
    threshold,
    verdicts,
)
from kin.export import export
from kin.fixture import parity
from kin.protocol import load
from kin.study import RUNS, records, run_seed


def _span(text: str) -> list[int]:
    a, _, b = text.partition("-")
    return list(range(int(a), int(b or a) + 1))


def run(args: argparse.Namespace) -> None:
    wanted = _span(args.seeds)
    ctx = mp.get_context("spawn")
    with ctx.Pool(args.jobs) as pool:
        for path in pool.imap_unordered(run_seed, wanted):
            print(path, flush=True)


def _table(rows: dict) -> dict:
    return {
        "/".join(k) if isinstance(k, tuple) else k: {
            m: asdict(v) for m, v in metrics.items()
        }
        for k, metrics in rows.items()
    }


def analyze(args: argparse.Namespace) -> None:
    recs = records()
    p = load()
    cut = threshold(recs)
    report = {
        "protocol": p.sha,
        "seeds": [r["seed"] for r in recs],
        "verdicts": verdicts(recs),
        "kinds": _table(kinds(recs, p.evaluation)),
        "inherit": _table(inheritance(recs, p.evaluation)),
        "calls": {"/".join(k): v for k, v in calls(recs, cut).items()},
        "exploratory": exploratory(recs),
    }
    out = RUNS / f"{p.sha[:12]}.report.json"
    out.write_text(json.dumps(report, indent=1))
    print(json.dumps(report["verdicts"], indent=1))
    print(out)


def main() -> None:
    parser = argparse.ArgumentParser(prog="kin")
    sub = parser.add_subparsers(required=True)
    r = sub.add_parser("run")
    r.add_argument("--seeds", default="0-29")
    r.add_argument("--jobs", type=int, default=8)
    r.set_defaults(fn=run)
    a = sub.add_parser("analyze")
    a.set_defaults(fn=analyze)
    e = sub.add_parser("export")
    e.add_argument("--out", type=Path, required=True)
    e.add_argument("--data", type=Path, required=True)
    e.set_defaults(fn=lambda a: export(a.out, a.data))
    f = sub.add_parser("fixture")
    f.add_argument("path", type=Path)
    f.set_defaults(fn=lambda a: parity(a.path))
    s = sub.add_parser("seal")
    s.set_defaults(fn=lambda _: print(load().sha))
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
