import duckdb

from ..config import method
from ..db import scalar

TRUNCATING = "kind IN (SELECT unnest(?::VARCHAR[]))"

RULES = {
    "egfr_activating": (
        ["EGFR"],
        "gene = 'EGFR' AND (change IN ('L858R', 'L861Q', 'S768I') "
        "OR change LIKE 'G719%' "
        "OR (kind = 'In_Frame_Del' AND position BETWEEN 745 AND 753))",
    ),
    "kras_nras": (
        ["KRAS", "NRAS"],
        "gene IN ('KRAS', 'NRAS') AND kind = 'Missense_Mutation' "
        "AND position IN (12, 13, 59, 61, 117, 146)",
    ),
    "braf_v600e": (["BRAF"], "gene = 'BRAF' AND change = 'V600E'"),
    "stk11": (
        ["STK11"],
        "gene = 'STK11' AND kind NOT IN ('5''Flank', 'Splice_Region')",
    ),
    "keap1": (
        ["KEAP1"],
        "gene = 'KEAP1' AND kind NOT IN ('5''Flank', 'Splice_Region')",
    ),
    "esr1_lbd": (
        ["ESR1"],
        "gene = 'ESR1' AND position IN (380, 463, 536, 537, 538)",
    ),
    "rb1_loss": (["RB1"], f"gene = 'RB1' AND {TRUNCATING}"),
    "brca": (
        ["BRCA1", "BRCA2"],
        f"gene IN ('BRCA1', 'BRCA2') AND {TRUNCATING}",
    ),
    "pik3ca": (
        ["PIK3CA"],
        "gene = 'PIK3CA' AND kind = 'Missense_Mutation'",
    ),
    "erbb2_mutant": (
        ["ERBB2"],
        "gene = 'ERBB2' AND ((kind = 'In_Frame_Ins' "
        "AND position BETWEEN 770 AND 785) "
        "OR (kind = 'Missense_Mutation' "
        "AND (position IN (309, 310) OR position BETWEEN 720 AND 987)))",
    ),
}

COPY_RULES = {
    "stk11": "gene = 'STK11' AND value = '-2'",
    "rb1_loss": "gene = 'RB1' AND value = '-2'",
    "brca": "gene IN ('BRCA1', 'BRCA2') AND value = '-2'",
    "erbb2_amp": "gene = 'ERBB2' AND value = '2'",
}

FUSIONS = {"alk_fusion": "ALK", "ros1_fusion": "ROS1"}

GENES = {"erbb2_amp": ["ERBB2"]} | {n: [g] for n, g in FUSIONS.items()}

COVERED = """
SELECT f.patient
FROM first_sample f
WHERE (SELECT count(*) FROM panel_gene g
       WHERE g.panel = f.panel AND list_contains(?, g.gene)) = len(?)
"""


def _patients(connection, sql: str, params: list) -> set[str]:
    return {r[0] for r in connection.execute(sql, params).fetchall()}


def _hits(connection, name: str, truncating: list[str]) -> set[str]:
    found: set[str] = set()

    if name in RULES:
        condition = RULES[name][1]
        params = [truncating] if TRUNCATING in condition else []
        found |= _patients(
            connection,
            "SELECT DISTINCT m.patient FROM mutation m "
            f"JOIN first_sample f USING (sample) WHERE {condition}",
            params,
        )

    if name in COPY_RULES:
        found |= _patients(
            connection,
            "SELECT DISTINCT f.patient FROM copy_number c "
            f"JOIN first_sample f USING (sample) WHERE {COPY_RULES[name]}",
            [],
        )

    if name in FUSIONS:
        found |= _patients(
            connection,
            "SELECT DISTINCT f.patient FROM structural s "
            "JOIN first_sample f USING (sample) "
            "WHERE ? IN (s.gene_one, s.gene_two)",
            [FUSIONS[name]],
        )

    return found


def _genes(name: str) -> list[str]:
    return RULES[name][0] if name in RULES else GENES[name]


def gene_rows(connection, name: str, truncating: list[str]) -> list[tuple]:
    genes = _genes(name)
    covered = _patients(connection, COVERED, [genes, genes])
    hit = _hits(connection, name, truncating)

    return [(p, name, p in hit) for p in sorted(covered)]


SAMPLE_RULES = {
    "tmb_high": "SELECT patient, tmb >= 10 FROM first_sample "
    "WHERE tmb IS NOT NULL",
    "msi_high": "SELECT patient, msi = 'Instable' FROM first_sample "
    "WHERE msi IN ('Instable', 'Stable')",
}


def build(connection: duckdb.DuckDBPyConnection) -> dict[str, int]:
    truncating = method()["gate"]["truncating"]
    rows: list[tuple] = []

    for name, sql in SAMPLE_RULES.items():
        rows += [(p, name, v) for p, v in connection.execute(sql).fetchall()]

    for name in [*RULES, *GENES]:
        rows += gene_rows(connection, name, truncating)

    connection.execute(
        "CREATE OR REPLACE TABLE biomarker "
        "(patient VARCHAR, name VARCHAR, value BOOLEAN)"
    )
    connection.executemany("INSERT INTO biomarker VALUES (?, ?, ?)", rows)

    return dict(
        connection.execute(
            "SELECT name, count(*) FILTER (WHERE value) FROM biomarker "
            "GROUP BY name ORDER BY name"
        ).fetchall()
    )


CONTROL_GENES = """
WITH everywhere AS (
    SELECT gene FROM panel_gene GROUP BY gene
    HAVING count(DISTINCT panel) = (
        SELECT count(DISTINCT panel) FROM panel_gene
    )
),
patients AS (
    SELECT count(*) AS n FROM first_sample WHERE cancer = ?
),
mutated AS (
    SELECT m.gene, count(DISTINCT f.patient) AS n
    FROM mutation m JOIN first_sample f USING (sample)
    WHERE f.cancer = ? AND m.kind NOT IN ('5''Flank', 'Splice_Region')
    GROUP BY m.gene
)
SELECT m.gene
FROM mutated m JOIN everywhere USING (gene), patients p
WHERE m.n BETWEEN 0.03 * p.n AND 0.15 * p.n
  AND NOT list_contains(?, m.gene)
ORDER BY md5(m.gene)
LIMIT ?
"""

GENE_HITS = """
SELECT DISTINCT f.patient
FROM mutation m JOIN first_sample f USING (sample)
WHERE m.gene = ? AND m.kind NOT IN ('5''Flank', 'Splice_Region')
"""


def controls(
    connection: duckdb.DuckDBPyConnection, cancer: str, excluded: list[str]
) -> list[str]:
    rows = connection.execute(
        CONTROL_GENES, [cancer, cancer, excluded, 20]
    ).fetchall()

    return [r[0] for r in rows]


def add_gene(connection: duckdb.DuckDBPyConnection, gene: str) -> str:
    name = f"gene:{gene}"
    present = scalar(
        connection, "SELECT count(*) FROM biomarker WHERE name = ?", [name]
    )

    if not present:
        hit = _patients(connection, GENE_HITS, [gene])
        everyone = _patients(
            connection, "SELECT patient FROM first_sample", []
        )
        connection.executemany(
            "INSERT INTO biomarker VALUES (?, ?, ?)",
            [(p, name, p in hit) for p in sorted(everyone)],
        )

    return name
