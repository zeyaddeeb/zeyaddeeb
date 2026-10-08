import duckdb

from ..cohort import biomarkers
from ..config import method

NAMED = sorted(
    {*biomarkers.RULES, *biomarkers.COPY_RULES, *biomarkers.FUSIONS}
)

ALTERED = """
SELECT DISTINCT m.line, m.gene
FROM cell_mutation m
WHERE list_contains(?, m.kind)
   OR (m.kind = 'Missense_Mutation' AND EXISTS (
       SELECT 1 FROM recurrent r
       WHERE r.gene = m.gene AND r.position = m.position))
UNION
SELECT DISTINCT line, gene FROM cell_copy WHERE value IN (2, -2)
"""


def _lines(connection, sql: str, params: list) -> set[str]:
    return {r[0] for r in connection.execute(sql, params).fetchall()}


def _named(connection, name: str, truncating: list[str]) -> set[str]:
    found: set[str] = set()

    if name in biomarkers.RULES:
        condition = biomarkers.RULES[name][1]
        params = [truncating] if biomarkers.TRUNCATING in condition else []
        found |= _lines(
            connection,
            f"SELECT DISTINCT line FROM cell_mutation WHERE {condition}",
            params,
        )

    if name in biomarkers.COPY_RULES:
        found |= _lines(
            connection,
            "SELECT DISTINCT line FROM cell_copy "
            f"WHERE {biomarkers.COPY_RULES[name]}",
            [],
        )

    if name in biomarkers.FUSIONS:
        found |= _lines(
            connection,
            "SELECT DISTINCT line FROM cell_fusion "
            "WHERE ? IN (gene_one, gene_two)",
            [biomarkers.FUSIONS[name]],
        )

    return found


def build(
    connection: duckdb.DuckDBPyConnection, genes: list[str]
) -> dict[str, int]:
    truncating = method()["gate"]["truncating"]
    lines = sorted(_lines(connection, "SELECT line FROM cell_line", []))
    marked = {n: _named(connection, n, truncating) for n in NAMED}
    altered: dict[str, set[str]] = {g: set() for g in genes}

    for line, gene in connection.execute(ALTERED, [truncating]).fetchall():
        if gene in altered:
            altered[gene].add(line)

    marked |= {f"altered:{g}": found for g, found in altered.items()}
    connection.execute(
        "CREATE OR REPLACE TABLE cell_biomarker "
        "(line VARCHAR, name VARCHAR, value BOOLEAN)"
    )
    connection.executemany(
        "INSERT INTO cell_biomarker VALUES (?, ?, ?)",
        [
            (line, n, line in hit)
            for n, hit in marked.items()
            for line in lines
        ],
    )

    return {n: len(hit) for n, hit in marked.items()}
