from dataclasses import dataclass
from functools import cache

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


def db() -> duckdb.DuckDBPyConnection | None:
    if not PACK.exists():
        return None
    stat = PACK.stat()
    return _connect(str(PACK), stat.st_mtime_ns)


@cache
def _connect(path: str, modified: int) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(path, read_only=True)


def ready() -> bool:
    return db() is not None


def genes() -> frozenset[str]:
    found = db()

    if found is None:
        return frozenset()

    return frozenset(
        row[0]
        for row in found.execute("select distinct gene from effect").fetchall()
    )


def known(gene: str) -> bool:
    return gene.upper() in genes()


def where(stratum: str) -> str:
    if stratum == "primary":
        return "and l.panel = 'primary'"

    return ""


def reading(gene: str, stratum: str) -> Reading:
    found = db()

    if found is None:
        return Reading({}, "the dependency pack has not been built")

    if stratum not in STRATA:
        return Reading({}, f"there is no {stratum} stratum")

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

    place = found.execute(
        f"""
        with med as (
            select e.gene as gene, median(e.score) as m
            from effect e join line l on l.model = e.model
            where true {where(stratum)}
            group by e.gene
        )
        select (
            select count(*) from med
            where m < (select m from med where gene = ?)
        ) * 1.0 / (select count(*) from med)
        """,
        [name],
    ).fetchone()
    assert place is not None
    essential = found.execute(
        "select count(*) from essential where gene = ?", [name]
    ).fetchone()
    assert essential is not None
    common = essential[0]

    return Reading(
        {
            "median": float(row[2]),
            "mean": float(row[3]),
            "lines": float(lines),
            "patients": float(row[1] or 0),
            "share_essential": float(row[6] or 0) / lines,
            "strongest": float(row[4]),
            "weakest": float(row[5]),
            "rank": float(place[0] or 0.0),
            "common": float(1 if common else 0),
        }
    )


def probe(values: dict[str, object]) -> Reading:
    return reading(str(values["gene"]), str(values["stratum"]))
