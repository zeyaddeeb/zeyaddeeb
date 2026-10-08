from dataclasses import dataclass

import duckdb
import numpy as np
import pymc as pm

from .genotype import LINEAGES, OTHER

GROUPS = [*LINEAGES, OTHER]

UNITS = """
SELECT l.cancer, r.compound, r.drug_class, b.value::INTEGER,
       cb.burden, r.z, r.line
FROM cell_response r
JOIN cell_line l USING (line)
JOIN cell_biomarker b ON b.line = r.line AND b.name = ?
JOIN cell_burden cb ON cb.line = r.line
ORDER BY r.line, r.compound
"""


@dataclass(frozen=True, slots=True)
class Screen:
    classes: list[str]
    compounds: list[str]
    compound_class: np.ndarray
    group: np.ndarray
    compound: np.ndarray
    marked: np.ndarray
    burden: np.ndarray
    z: np.ndarray
    lines: dict[tuple[str, str], int]


def load(connection: duckdb.DuckDBPyConnection, biomarker: str) -> Screen:
    found = connection.execute(UNITS, [biomarker]).fetchall()
    compounds = sorted({r[1] for r in found})
    owner = {r[1]: r[2] for r in found}
    classes = sorted(set(owner.values()))
    compound = np.array([compounds.index(r[1]) for r in found])
    burden = np.array([float(r[4]) for r in found])
    marked_lines: dict[tuple[str, str], set[str]] = {}

    for r in found:
        if r[3]:
            marked_lines.setdefault((r[0], r[2]), set()).add(r[6])

    return Screen(
        classes=classes,
        compounds=compounds,
        compound_class=np.array([classes.index(owner[c]) for c in compounds]),
        group=np.array([GROUPS.index(r[0]) for r in found]),
        compound=compound,
        marked=np.array([r[3] for r in found]),
        burden=burden - burden.mean(),
        z=np.array([float(r[5]) for r in found]),
        lines={key: len(v) for key, v in marked_lines.items()},
    )


def build(screen: Screen) -> pm.Model:
    groups, classes = len(GROUPS), len(screen.classes)
    compounds = len(screen.compounds)
    owner = screen.compound_class[screen.compound]

    with pm.Model() as model:
        a = pm.Normal("a", 0.0, 1.0, shape=(compounds, groups))
        c = pm.Normal("c", 0.0, 1.0, shape=classes)
        t = pm.HalfNormal("t", 0.5)
        u = pm.Normal("u", 0.0, 1.0, shape=(groups, classes))
        b = c + t * u
        pm.Deterministic("b", b)
        k = pm.HalfNormal("k", 0.5)
        v = pm.Normal("v", 0.0, 1.0, shape=compounds)
        slope = pm.Normal("burden", 0.0, 0.5, shape=classes)
        s = pm.HalfNormal("s", 1.0, shape=compounds)

        mu = (
            a[screen.compound, screen.group]
            + (b[screen.group, owner] + k * v[screen.compound]) * screen.marked
            + slope[owner] * screen.burden
        )

        pm.Normal("z", mu=mu, sigma=s[screen.compound], observed=screen.z)

    return model


def contrasts(trace, screen: Screen) -> dict[tuple[str, str], np.ndarray]:
    b = trace.posterior["b"].stack(s=("chain", "draw")).values
    found = {}

    for g, group in enumerate(GROUPS[:-1]):
        for d, name in enumerate(screen.classes):
            others = np.delete(b[g], d, axis=0).mean(axis=0)
            found[group, name] = b[g, d] - others

    return found
