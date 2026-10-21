from dataclasses import dataclass
from functools import cache
from pathlib import Path

import duckdb
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


@cache
def db() -> duckdb.DuckDBPyConnection | None:
    if not bedside().exists():
        return None

    found = duckdb.connect(str(bedside()), read_only=True)
    patients = chord() / "data_clinical_patient.txt"

    if patients.exists():
        found.execute(
            f"""
            create or replace temp view flagged as
            select PATIENT_ID as patient,
                   INTRA_ABDOMINAL as abdominal,
                   STAGE_HIGHEST_RECORDED as stage
            from read_csv('{patients}', delim='\t', skip=4, header=true,
                          all_varchar=true)
            """
        )

    return found


def ready() -> bool:
    return db() is not None


def classes() -> tuple[str, ...]:
    found = db()

    if found is None:
        return ()

    return tuple(
        row[0]
        for row in found.execute(
            "select distinct class from course order by 1"
        ).fetchall()
    )


def _durations(klass: str, split: str) -> tuple[list[float], list[float], int]:
    found = db()

    if split == "msi":
        rows = found.execute(
            """
            select case when s.msi = 'Instable' then 1 else 0 end as exposed,
                   co.stop - co.start as days,
                   co.patient
            from course co join sample s on s.patient = co.patient
            where s.cancer = ? and co.class = ?
              and s.msi in ('Instable', 'Stable')
              and co.stop > co.start
            """,
            [CANCER, klass],
        ).fetchall()
    else:
        rows = found.execute(
            """
            select case when f.abdominal = 'Yes' then 1 else 0 end as exposed,
                   co.stop - co.start as days,
                   co.patient
            from course co
            join sample s on s.patient = co.patient
            join flagged f on f.patient = co.patient
            where s.cancer = ? and co.class = ?
              and f.stage = 'Stage 4'
              and f.abdominal in ('Yes', 'No')
              and co.stop > co.start
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

    middle = sorted(exposed)[len(exposed) // 2]
    other = sorted(plain)[len(plain) // 2]
    _, p = mannwhitneyu(exposed, plain, alternative="two-sided")

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
