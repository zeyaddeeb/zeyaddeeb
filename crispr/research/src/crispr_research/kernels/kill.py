from bisect import bisect_left
from dataclasses import dataclass
from functools import lru_cache
from threading import Lock, local

import duckdb

from ..config import DATA

PACK = DATA / "pack.duckdb"
FLOOR = 8
DISCOVERY = 20
ESSENTIAL = -0.5
STRATA = ("all", "primary")
FIELDS = (
    "median",
    "mean",
    "lines",
    "patients",
    "share_essential",
    "strongest",
    "weakest",
    "rank",
    "common",
)
PROBE = ("gene", "stratum")


@dataclass(frozen=True, slots=True)
class Reading:
    fields: dict[str, float]
    ungraded: str | None = None


class _Pool:
    def __init__(self, path: str) -> None:
        self._root = duckdb.connect(path, read_only=True)
        self._threads = local()
        self._lock = Lock()

    def cursor(self) -> duckdb.DuckDBPyConnection:
        if not hasattr(self._threads, "db"):
            with self._lock:
                self._threads.db = self._root.cursor()
        return self._threads.db


def _stamp() -> tuple[str, int, int] | None:
    if not PACK.exists():
        return None
    stat = PACK.stat()
    return str(PACK), stat.st_mtime_ns, stat.st_size


def db() -> duckdb.DuckDBPyConnection | None:
    stamp = _stamp()
    if stamp is None:
        return None
    return _pool(*stamp).cursor()


@lru_cache(maxsize=2)
def _pool(path: str, modified: int, size: int) -> _Pool:
    return _Pool(path)


def ready() -> bool:
    return db() is not None


@lru_cache(maxsize=4)
def _genes(path: str, modified: int, size: int) -> frozenset[str]:
    found = _pool(path, modified, size).cursor()
    return frozenset(
        row[0]
        for row in found.execute("select distinct gene from effect").fetchall()
    )


def genes() -> frozenset[str]:
    stamp = _stamp()
    if stamp is None:
        return frozenset()
    return _genes(*stamp)


@lru_cache(maxsize=8)
def _medians(
    path: str, modified: int, size: int, stratum: str
) -> tuple[float, ...]:
    found = _pool(path, modified, size).cursor()
    rows = found.execute(
        f"""
        select median(e.score) as m
        from effect e join line l on l.model = e.model
        where true {where(stratum)}
        group by e.gene
        order by m
        """
    ).fetchall()
    return tuple(float(row[0]) for row in rows if row[0] is not None)


def known(gene: str) -> bool:
    return gene.upper() in genes()


def where(stratum: str) -> str:
    if stratum == "primary":
        return "and l.panel = 'primary'"

    return ""


def reading(gene: str, stratum: str) -> Reading:
    stamp = _stamp()

    if stamp is None:
        return Reading({}, "the dependency pack has not been built")

    if stratum not in STRATA:
        return Reading({}, f"there is no {stratum} stratum")

    found = _pool(*stamp).cursor()
    name = gene.upper()
    row = found.execute(
        f"""
        select count(*),
               count(distinct l.patient),
               median(e.score),
               avg(e.score),
               min(e.score),
               max(e.score),
               sum(case when e.score <= {ESSENTIAL} then 1 else 0 end)
        from effect e join line l on l.model = e.model
        where e.gene = ? {where(stratum)}
        """,
        [name],
    ).fetchone()

    assert row is not None  # Aggregate query, including an empty panel.
    lines = row[0] or 0

    if lines == 0:
        return Reading({}, f"{name} has no score in this release")

    if lines < FLOOR:
        return Reading(
            {},
            f"{name} is scored in only {lines} lines of the {stratum} "
            f"stratum, below the floor of {FLOOR}",
        )

    med_value = float(row[2])
    medians = _medians(*stamp, stratum)
    rank = bisect_left(medians, med_value) / len(medians) if medians else 0.0
    essential = found.execute(
        "select count(*) from essential where gene = ?", [name]
    ).fetchone()
    assert essential is not None
    common = essential[0]

    return Reading(
        {
            "median": med_value,
            "mean": float(row[3]),
            "lines": float(lines),
            "patients": float(row[1] or 0),
            "share_essential": float(row[6] or 0) / lines,
            "strongest": float(row[4]),
            "weakest": float(row[5]),
            "rank": float(rank),
            "common": float(1 if common else 0),
        }
    )


def probe(values: dict[str, object]) -> Reading:
    return reading(str(values["gene"]), str(values["stratum"]))
