import duckdb

from ..config import DATA, method

PRISM = DATA / "prism"
PREFERRED = "MTS010"
SYNONYMS = {
    "5-fluorouracil": "FLUOROURACIL",
    "SN-38": "IRINOTECAN",
    "abiraterone-acetate": "ABIRATERONE",
    "trifluridine": "TIPIRACIL-TRIFLURIDINE",
}
EXCLUDED = {"capecitabine", "tipiracil", "irinotecan"}

RESPONSE = """
CREATE OR REPLACE TABLE cell_response AS
WITH curves AS (
    SELECT r.depmap_id AS line, c.compound, c.drug_class,
           r.screen_id, r.auc::DOUBLE AS auc
    FROM read_csv(?, header = true, all_varchar = true) r
    JOIN cell_compound c ON c.name = r.name
    WHERE TRY_CAST(r.auc AS DOUBLE) IS NOT NULL
      AND isfinite(r.auc::DOUBLE)
      AND r.depmap_id IN (SELECT line FROM cell_line)
),
chosen AS (
    SELECT line, compound, drug_class,
           CASE WHEN bool_or(screen_id = ?)
                THEN avg(auc) FILTER (WHERE screen_id = ?)
                ELSE avg(auc) END AS auc
    FROM curves
    GROUP BY line, compound, drug_class
)
SELECT line, compound, drug_class,
       (auc - avg(auc) OVER w) / stddev_samp(auc) OVER w AS z
FROM chosen
WINDOW w AS (PARTITION BY compound)
"""


def _compounds(names: list[str]) -> list[tuple[str, str, str]]:
    owner = {
        drug: name
        for name, members in method()["classes"].items()
        for drug in members
    }
    rows = []

    for name in names:
        if name in EXCLUDED:
            continue

        drug = SYNONYMS.get(name, name.upper())

        if drug in owner:
            rows.append((name, drug, owner[drug]))

    return rows


def build(connection: duckdb.DuckDBPyConnection) -> dict[str, int]:
    names = [
        r[0]
        for r in connection.execute(
            "SELECT DISTINCT name FROM read_csv(?, header = true) "
            "WHERE name IS NOT NULL",
            [
                str(
                    PRISM
                    / "secondary-screen-replicate-collapsed-treatment-info.csv"
                )
            ],
        ).fetchall()
    ]
    connection.execute(
        "CREATE OR REPLACE TABLE cell_compound "
        "(name VARCHAR, compound VARCHAR, drug_class VARCHAR)"
    )
    connection.executemany(
        "INSERT INTO cell_compound VALUES (?, ?, ?)", _compounds(names)
    )
    connection.execute(
        RESPONSE,
        [
            str(PRISM / "secondary-screen-dose-response-curve-parameters.csv"),
            PREFERRED,
            PREFERRED,
        ],
    )

    return dict(
        connection.execute(
            "SELECT drug_class, count(DISTINCT compound) FROM cell_response "
            "GROUP BY 1 ORDER BY 1"
        ).fetchall()
    )
