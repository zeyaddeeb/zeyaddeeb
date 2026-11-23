from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import median
from threading import Lock, local

import duckdb
import numpy as np
from scipy.stats import mannwhitneyu

from ..config import var

FLOOR = 15
CANCER = "Colorectal Cancer"
SPLITS = ("abdominal", "msi")
FIELDS = (
    "exposed_courses",
    "plain_courses",
    "exposed_days",
    "plain_days",
    "ratio",
    "p",
    "patients",
)
PROBE = ("klass", "split")


@dataclass(frozen=True, slots=True)
class Reading:
    fields: dict[str, float]
    ungraded: str | None = None


def bedside() -> Path:
    return Path(
        var(
            "RESEARCH_BEDSIDE",
            str(
                Path(__file__).resolve().parents[5]
                / "bedside"
                / "data"
                / "bedside.duckdb"
            ),
        )
    )


def chord() -> Path:
    return Path(
        var(
            "RESEARCH_CHORD",
            str(
                Path(__file__).resolve().parents[5]
                / "bedside"
                / "data"
                / "chord"
            ),
        )
    )


class _Pool:
    def __init__(self, path: str, cohort: str) -> None:
        self._root = duckdb.connect(path, read_only=True)
        self._cohort = cohort
        self._threads = local()
        self._lock = Lock()

    def cursor(self) -> duckdb.DuckDBPyConnection:
        if not hasattr(self._threads, "db"):
            with self._lock:
                cursor = self._root.cursor()
            patients = Path(self._cohort)
            if patients.exists():
                escaped = str(patients).replace("'", "''")
                cursor.execute(
                    f"""
                    create or replace temp view flagged as
                    select PATIENT_ID as patient,
                           INTRA_ABDOMINAL as abdominal,
                           STAGE_HIGHEST_RECORDED as stage
                    from read_csv('{escaped}', delim='\t', skip=4,
                                  header=true, all_varchar=true)
                    """
                )
            self._threads.db = cursor
        return self._threads.db


def db() -> duckdb.DuckDBPyConnection | None:
    patients = chord() / "data_clinical_patient.txt"
    bed = bedside()
    if not bed.exists() or not patients.exists():
        return None
    bed_stat = bed.stat()
    pat_stat = patients.stat()
    return _pool(
        (str(bed), bed_stat.st_mtime_ns, bed_stat.st_size),
        (str(patients), pat_stat.st_mtime_ns, pat_stat.st_size),
    ).cursor()


@lru_cache(maxsize=2)
def _pool(
    bedside_stamp: tuple[str, int, int],
    cohort_stamp: tuple[str, int, int],
) -> _Pool:
    return _Pool(bedside_stamp[0], cohort_stamp[0])


def ready() -> bool:
    return db() is not None


def classes() -> tuple[str, ...]:
    found = db()

    if found is None:
        return ()

    return tuple(
        row[0]
        for row in found.execute(
            "select distinct class from eligible order by 1"
        ).fetchall()
    )


def _durations(klass: str, split: str) -> tuple[list[float], list[float], int]:
    found = db()
    if found is None:
        return [], [], 0

    if split == "msi":
        rows = found.execute(
            """
            select case when f.msi = 'Instable' then 1 else 0 end as exposed,
                   e.stop - e.start as days,
                   e.patient
            from eligible e
            join first_sample f on f.patient = e.patient
            where e.cancer = ? and e.class = ?
              and f.msi in ('Instable', 'Stable')
              and e.stop > e.start
            """,
            [CANCER, klass],
        ).fetchall()
    else:
        rows = found.execute(
            """
            select case when fl.abdominal = 'Yes' then 1 else 0 end as exposed,
                   e.stop - e.start as days,
                   e.patient
            from eligible e
            join flagged fl on fl.patient = e.patient
            where e.cancer = ? and e.class = ?
              and fl.stage = 'Stage 4'
              and fl.abdominal in ('Yes', 'No')
              and e.stop > e.start
            """,
            [CANCER, klass],
        ).fetchall()

    exposed = [float(r[1]) for r in rows if r[0] == 1]
    plain = [float(r[1]) for r in rows if r[0] == 0]

    return exposed, plain, len({r[2] for r in rows})


def reading(klass: str, split: str) -> Reading:
    if db() is None:
        return Reading({}, "the patient data is not on this machine")

    if split not in SPLITS:
        return Reading({}, f"there is no {split} split")

    if klass not in classes():
        return Reading({}, f"there is no {klass} drug class")

    exposed, plain, patients = _durations(klass, split)

    if len(exposed) < FLOOR or len(plain) < FLOOR:
        return Reading(
            {},
            f"{klass} has {len(exposed)} and {len(plain)} courses on the two "
            f"sides, and {FLOOR} of each is the floor",
        )

    middle = float(median(exposed))
    other = float(median(plain))
    test = mannwhitneyu(exposed, plain, alternative="two-sided")
    p = np.asarray(test[1], dtype=float).item()

    return Reading(
        {
            "exposed_courses": float(len(exposed)),
            "plain_courses": float(len(plain)),
            "exposed_days": middle,
            "plain_days": other,
            "ratio": middle / other if other else 0.0,
            "p": float(p),
            "patients": float(patients),
        }
    )


def probe(values: dict[str, object]) -> Reading:
    return reading(
        str(values["klass"]).strip().lower(),
        str(values["split"]).strip().lower(),
    )
