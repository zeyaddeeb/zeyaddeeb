from dataclasses import dataclass
from itertools import pairwise

import duckdb
import numpy as np

UNITS = """
SELECT e.class, e.time, e.event::INTEGER, e.prior, b.value::INTEGER,
       ln(1 + coalesce(f.tmb, 0))
FROM eligible e
JOIN biomarker b ON b.patient = e.patient AND b.name = ?
JOIN first_sample f ON f.patient = e.patient
WHERE e.cancer = ?
"""


@dataclass(frozen=True, slots=True)
class Pieces:
    classes: list[str]
    course_class: np.ndarray
    interval: np.ndarray
    exposure: np.ndarray
    event: np.ndarray
    marked: np.ndarray
    prior: np.ndarray
    burden: np.ndarray
    counts: dict[str, tuple[int, int]]


def _split(
    time: np.ndarray, event: np.ndarray, cuts: list[int]
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    rows, intervals, exposures, events = [], [], [], []

    for j, (low, high) in enumerate(pairwise(cuts)):
        inside = time > low
        index = np.flatnonzero(inside)
        rows.append(index)
        intervals.append(np.full(len(index), j))
        exposures.append(np.minimum(time[index], high) - low)
        events.append(
            ((time[index] <= high) & (event[index] == 1)).astype(int)
        )

    return (
        np.concatenate(rows),
        np.concatenate(intervals),
        np.concatenate(exposures),
        np.concatenate(events),
    )


def load(
    connection: duckdb.DuckDBPyConnection,
    cancer: str,
    biomarker: str,
    cuts: list[int],
) -> Pieces:
    found = connection.execute(UNITS, [biomarker, cancer]).fetchall()
    names = sorted({r[0] for r in found})
    lookup = {n: i for i, n in enumerate(names)}
    course_class = np.array([lookup[r[0]] for r in found])
    time = np.array([float(r[1]) for r in found])
    event = np.array([r[2] for r in found])
    marked = np.array([r[4] for r in found])
    rows, interval, exposure, events = _split(time, event, cuts)

    counts = {
        n: (
            int(((course_class == i) & (marked == 1)).sum()),
            int(((course_class == i) & (marked == 0)).sum()),
        )
        for n, i in lookup.items()
    }

    return Pieces(
        classes=names,
        course_class=course_class[rows],
        interval=interval,
        exposure=exposure,
        event=events,
        marked=marked[rows],
        prior=np.log1p(np.array([r[3] for r in found], dtype=float))[rows],
        burden=np.array([float(r[5]) for r in found])[rows],
        counts=counts,
    )


def estimable(pieces: Pieces, minimum: int) -> Pieces:
    kept = [n for n in pieces.classes if min(pieces.counts[n]) >= minimum]
    lookup = np.full(len(pieces.classes), -1)
    lookup[[pieces.classes.index(n) for n in kept]] = np.arange(len(kept))
    course_class = lookup[pieces.course_class]
    rows = course_class >= 0

    return Pieces(
        classes=kept,
        course_class=course_class[rows],
        interval=pieces.interval[rows],
        exposure=pieces.exposure[rows],
        event=pieces.event[rows],
        marked=pieces.marked[rows],
        prior=pieces.prior[rows],
        burden=pieces.burden[rows],
        counts={n: pieces.counts[n] for n in kept},
    )
