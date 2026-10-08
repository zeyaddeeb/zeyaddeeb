import duckdb

from ..config import method

RECURRENT_PATIENTS = 3
SHARE = 0.03

RECURRENT = """
CREATE OR REPLACE TABLE recurrent AS
SELECT gene, position
FROM mutation
WHERE kind = 'Missense_Mutation' AND position IS NOT NULL
GROUP BY gene, position
HAVING count(DISTINCT patient) >= ?
"""

ALTERED = """
CREATE OR REPLACE TABLE altered AS
SELECT DISTINCT f.patient, m.gene
FROM mutation m JOIN first_sample f USING (sample)
WHERE list_contains(?, m.kind)
   OR (m.kind = 'Missense_Mutation' AND EXISTS (
       SELECT 1 FROM recurrent r
       WHERE r.gene = m.gene AND r.position = m.position))
UNION
SELECT DISTINCT f.patient, c.gene
FROM copy_number c JOIN first_sample f USING (sample)
WHERE c.value IN ('2', '-2')
"""

FREQUENT = """
WITH everywhere AS (
    SELECT gene FROM panel_gene GROUP BY gene
    HAVING count(DISTINCT panel) = (
        SELECT count(DISTINCT panel) FROM panel_gene
    )
),
patients AS (
    SELECT count(*) AS n FROM first_sample WHERE cancer = ?
)
SELECT a.gene
FROM altered a
JOIN first_sample f USING (patient)
JOIN everywhere USING (gene), patients p
WHERE f.cancer = ?
GROUP BY a.gene, p.n
HAVING count(DISTINCT a.patient) >= ? * p.n
ORDER BY a.gene
"""

EVERYWHERE = """
SELECT gene FROM panel_gene GROUP BY gene
HAVING count(DISTINCT panel) = (SELECT count(DISTINCT panel) FROM panel_gene)
ORDER BY gene
"""

ENOUGH = """
SELECT f.cancer, a.gene
FROM altered a JOIN first_sample f USING (patient)
WHERE list_contains(?, a.gene)
GROUP BY f.cancer, a.gene
HAVING count(DISTINCT a.patient) >= ?
ORDER BY 1, 2
"""

MARK = """
INSERT INTO biomarker
SELECT f.patient, 'altered:' || g.gene,
       EXISTS (SELECT 1 FROM altered a
               WHERE a.patient = f.patient AND a.gene = g.gene)
FROM first_sample f, (SELECT unnest(?::VARCHAR[]) AS gene) g
"""


def genes(connection: duckdb.DuckDBPyConnection) -> dict[str, list[str]]:
    truncating = method()["gate"]["truncating"]
    connection.execute(RECURRENT, [RECURRENT_PATIENTS])
    connection.execute(ALTERED, [truncating])
    cancers = [
        r[0]
        for r in connection.execute(
            "SELECT DISTINCT cancer FROM first_sample ORDER BY 1"
        ).fetchall()
    ]

    return {
        c: [
            r[0]
            for r in connection.execute(FREQUENT, [c, c, SHARE]).fetchall()
        ]
        for c in cancers
    }


def build(connection: duckdb.DuckDBPyConnection) -> dict[str, list[str]]:
    found = genes(connection)
    every = sorted({g for listed in found.values() for g in listed})
    connection.execute("DELETE FROM biomarker WHERE name LIKE 'altered:%'")
    connection.execute(MARK, [every])

    return found


def menu(connection: duckdb.DuckDBPyConnection) -> list[str]:
    return [r[0] for r in connection.execute(EVERYWHERE).fetchall()]


def mark(connection: duckdb.DuckDBPyConnection, chosen: list[str]) -> int:
    present = {
        r[0]
        for r in connection.execute(
            "SELECT DISTINCT name FROM biomarker WHERE name LIKE 'altered:%'"
        ).fetchall()
    }
    missing = [g for g in chosen if f"altered:{g}" not in present]

    if missing:
        connection.execute(MARK, [missing])

    return len(missing)


def enough(
    connection: duckdb.DuckDBPyConnection, chosen: list[str], minimum: int
) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}

    for cancer, gene in connection.execute(
        ENOUGH, [chosen, minimum]
    ).fetchall():
        found.setdefault(cancer, []).append(gene)

    return found
