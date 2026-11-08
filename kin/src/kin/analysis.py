from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from kin.protocol import load, seeds

NONKIN = ("imitator", "stranger")
RESAMPLES = 10_000
RETRAINED = ("digits-20-retrained", "same-0-retrained")

Row = dict
Keep = Callable[[Row], bool]


@dataclass(frozen=True)
class Interval:
    mean: float
    low: float
    high: float


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    diff = pos[:, None] - neg[None, :]
    return float((diff > 0).mean() + 0.5 * (diff == 0).mean())


def capable(row: Row) -> bool:
    return row["capable"]


def degraded(row: Row) -> bool:
    return not row["capable"]


def _split(
    rows: list[Row], metric: str, pos: Keep, neg: Keep
) -> tuple[np.ndarray, np.ndarray]:
    a = [r[metric] for r in rows if pos(r)]
    b = [r[metric] for r in rows if neg(r)]
    return np.array(a), np.array(b)


def _in(records: list[dict], span: tuple[int, int]) -> list[dict]:
    keep = set(seeds(span))
    return [r for r in records if r["seed"] in keep]


def _groups(records: list[dict], span: tuple[int, int]) -> list[list[Row]]:
    return [r["suspects"] for r in _in(records, span)]


def capable_kin(row: Row) -> bool:
    return row["family"] == "descendant" and row["capable"]


def capable_nonkin(row: Row) -> bool:
    return row["family"] in NONKIN and row["capable"]


def degraded_kin(row: Row) -> bool:
    return row["family"] == "descendant" and not row["capable"]


def degraded_nonkin(row: Row) -> bool:
    return row["name"] in RETRAINED


def auc_boot(
    groups: list[list[Row]], metrics: list[str], pos: Keep, neg: Keep
):
    rng = np.random.default_rng(0)
    flat = [row for g in groups for row in g]
    point = {m: auc(*_split(flat, m, pos, neg)) for m in metrics}
    draws = defaultdict(list)
    for _ in range(RESAMPLES):
        picks = rng.integers(0, len(groups), len(groups))
        rows = [row for i in picks for row in groups[i]]
        for m in metrics:
            draws[m].append(auc(*_split(rows, m, pos, neg)))
    return point, {m: np.array(v) for m, v in draws.items()}


def _boot_mean(values: list[float], seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = np.array(values)
    return rng.choice(v, (RESAMPLES, len(v))).mean(1)


def interval(values: list[float]) -> Interval:
    boots = _boot_mean(values, 1)
    return Interval(
        float(np.mean(values)),
        float(np.quantile(boots, 0.025)),
        float(np.quantile(boots, 0.975)),
    )


def threshold(records: list[dict]) -> float:
    rows = [row for g in _groups(records, load().calibration) for row in g]
    neg = [r["primary"] for r in rows if capable_nonkin(r)]
    return float(np.quantile(neg, 0.95))


METRICS = ("agreement", "spare", "accuracy", "primary", "draws", "long")


def kinds(records: list[dict], span: tuple[int, int]) -> dict:
    table = defaultdict(lambda: defaultdict(list))
    for group in _groups(records, span):
        for row in group:
            for k in (*METRICS, "capable"):
                table[(row["family"], row["name"])][k].append(float(row[k]))
    return {
        key: {m: interval(v) for m, v in metrics.items()}
        for key, metrics in table.items()
    }


def _lie_by_seed(records: list[dict], span: tuple[int, int]) -> list[dict]:
    return [
        {row["name"]: row for row in r["inherit"]} for r in _in(records, span)
    ]


def inheritance(records: list[dict], span: tuple[int, int]) -> dict:
    table = defaultdict(lambda: defaultdict(list))
    for by in _lie_by_seed(records, span):
        for name, row in by.items():
            for k in (
                "lie_before",
                "lie_after",
                "accuracy_before",
                "accuracy_after",
            ):
                table[name][k].append(row[k])
    return {
        name: {m: interval(v) for m, v in metrics.items()}
        for name, metrics in table.items()
    }


def calls(records: list[dict], cut: float) -> dict:
    table = defaultdict(list)
    for group in _groups(records, load().evaluation):
        for row in group:
            table[(row["family"], row["name"])].append(row["primary"] > cut)
    return {k: float(np.mean(v)) for k, v in table.items()}


def _score_diff(records: list[dict], a: str, b: str) -> np.ndarray:
    diffs = []
    for group in _groups(records, load().evaluation):
        by = {row["name"]: row for row in group}
        diffs.append(by[a]["primary"] - by[b]["primary"])
    return _boot_mean(diffs, 2)


def _lie_diff(records: list[dict], a: str, b: str) -> np.ndarray:
    by_seed = _lie_by_seed(records, load().evaluation)
    diffs = [by[a]["lie_after"] - by[b]["lie_after"] for by in by_seed]
    return _boot_mean(diffs, 3)


def _q(v: np.ndarray, q: float) -> float:
    return float(np.quantile(v, q))


def verdicts(records: list[dict]) -> dict:
    p = load()
    groups = _groups(records, p.evaluation)
    metrics = ["primary", "agreement", "spare"]
    point, boots = auc_boot(groups, metrics, capable_kin, capable_nonkin)
    deg, deg_boots = auc_boot(
        groups, ["primary"], degraded_kin, degraded_nonkin
    )
    pat = boots["primary"]
    diffs = {m: boots[m] - pat for m in ("agreement", "spare")}
    imit = _score_diff(records, "digits-20", "digits-3")
    lies = inheritance(records, p.evaluation)
    lie_diffs = {n: _lie_diff(records, "clothes-1000", n) for n in RETRAINED}
    cut = threshold(records)
    nonkin = [
        row["primary"] > cut
        for g in groups
        for row in g
        if capable_nonkin(row)
    ]
    fpr = float(np.mean(nonkin))
    return {
        "auc": point,
        "auc_low": {m: _q(v, 0.025) for m, v in boots.items()},
        "auc_high": {m: _q(v, 0.975) for m, v in boots.items()},
        "auc_diff_high": {m: _q(d, 0.975) for m, d in diffs.items()},
        "degraded_auc": deg["primary"],
        "degraded_auc_low": _q(deg_boots["primary"], 0.025),
        "imitation_diff_mean": float(imit.mean()),
        "imitation_diff_high": _q(imit, 0.975),
        "lie_diff_low": {n: _q(d, 0.025) for n, d in lie_diffs.items()},
        "threshold": cut,
        "false_positive_rate": fpr,
        "pass": {
            "h1": point["primary"] >= 0.85 and _q(pat, 0.025) >= 0.75,
            "h2": all(_q(d, 0.975) < 0 for d in diffs.values()),
            "h3": _q(imit, 0.975) <= 0.05
            and lies["both"]["lie_after"].mean <= 0.10,
            "h4": lies["clothes-1000"]["lie_after"].mean >= 0.20
            and all(_q(d, 0.025) > 0 for d in lie_diffs.values()),
            "h5": fpr <= 0.10,
            "h6": deg["primary"] >= 0.90,
        },
    }


def _capable_of(family: str) -> Keep:
    return lambda row: row["family"] == family and row["capable"]


def exploratory(records: list[dict]) -> dict:
    flat = [row for g in _groups(records, load().evaluation) for row in g]
    out = {}
    for family in NONKIN:
        neg = _capable_of(family)
        out[family] = {
            m: auc(*_split(flat, m, capable_kin, neg))
            for m in ("primary", "spare", "agreement")
        }
    return out
