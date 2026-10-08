import csv
from pathlib import Path

import duckdb

from ..config import DATA
from ..db import scalar

DEPMAP = DATA / "depmap"

LINEAGES = {
    "Non-Small Cell Lung Cancer": "Non-Small Cell Lung Cancer",
    "Colorectal Cancer": "Colorectal Adenocarcinoma",
    "Breast Cancer": "Invasive Breast Carcinoma",
    "Prostate Cancer": "Prostate Adenocarcinoma",
    "Pancreatic Cancer": "Pancreatic Adenocarcinoma",
}
OTHER = "other"
AMPLIFIED = 3.0
DELETED = 0.25

LINE = """
CREATE OR REPLACE TABLE cell_line AS
SELECT m.ModelID AS line, m.OncotreePrimaryDisease AS disease,
       coalesce(g.cancer, ?) AS cancer
FROM read_csv(?, header = true) m
LEFT JOIN cell_group g ON g.disease = m.OncotreePrimaryDisease
WHERE m.OncotreePrimaryDisease <> 'Non-Cancerous'
"""

KIND = """
CASE
    WHEN VariantInfo LIKE '%frameshift_variant%' THEN
        CASE WHEN VariantType = 'deletion'
             THEN 'Frame_Shift_Del' ELSE 'Frame_Shift_Ins' END
    WHEN VariantInfo LIKE '%stop_gained%' THEN 'Nonsense_Mutation'
    WHEN VariantInfo LIKE 'splice_acceptor_variant%'
      OR VariantInfo LIKE 'splice_donor_variant%' THEN 'Splice_Site'
    WHEN VariantInfo LIKE '%stop_lost%' THEN 'Nonstop_Mutation'
    WHEN VariantInfo LIKE '%start_lost%' THEN 'Translation_Start_Site'
    WHEN VariantInfo LIKE '%inframe_insertion%' THEN 'In_Frame_Ins'
    WHEN VariantInfo LIKE '%inframe_deletion%' THEN 'In_Frame_Del'
    WHEN VariantInfo LIKE 'missense_variant%' THEN 'Missense_Mutation'
END
"""

MUTATION = f"""
CREATE OR REPLACE TABLE cell_mutation AS
SELECT * FROM (
    SELECT ModelID AS line, HugoSymbol AS gene,
           regexp_replace(ProteinChange, '^p\\.', '') AS change,
           {KIND} AS kind,
           TRY_CAST(regexp_extract(ProteinChange, '[0-9]+') AS INTEGER)
               AS position
    FROM read_csv(?, header = true, all_varchar = true)
    WHERE VepBiotype = 'protein_coding'
)
WHERE kind IS NOT NULL AND line IN (SELECT line FROM cell_line)
"""

BURDEN = """
CREATE OR REPLACE TABLE cell_burden AS
SELECT l.line, ln(1 + count(m.gene)) AS burden
FROM cell_line l LEFT JOIN cell_mutation m USING (line)
GROUP BY l.line
"""

FUSION = """
CREATE OR REPLACE TABLE cell_fusion AS
SELECT ModelID AS line,
       split_part(LeftGene, ' (', 1) AS gene_one,
       split_part(RightGene, ' (', 1) AS gene_two
FROM read_csv(?, header = true, all_varchar = true)
WHERE ModelID IN (SELECT line FROM cell_line)
"""


def _symbol(column: str) -> str:
    return column.split(" (", 1)[0]


def copy_rows(
    path: Path, genes: set[str], amplified: float, deleted: float
) -> list[tuple[str, str, int]]:
    rows = []

    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        wanted = [
            (i, _symbol(c))
            for i, c in enumerate(header)
            if i and _symbol(c) in genes
        ]

        for record in reader:
            for i, gene in wanted:
                if not record[i]:
                    continue

                value = float(record[i])

                if value >= amplified:
                    rows.append((record[0], gene, 2))
                elif value <= deleted:
                    rows.append((record[0], gene, -2))

    return rows


def load(
    connection: duckdb.DuckDBPyConnection, genes: set[str]
) -> dict[str, int]:
    connection.execute(
        "CREATE OR REPLACE TABLE cell_group (disease VARCHAR, cancer VARCHAR)"
    )
    connection.executemany(
        "INSERT INTO cell_group VALUES (?, ?)",
        [(d, c) for c, d in LINEAGES.items()],
    )
    connection.execute(LINE, [OTHER, str(DEPMAP / "Model.csv")])
    connection.execute(MUTATION, [str(DEPMAP / "OmicsSomaticMutations.csv")])
    connection.execute(BURDEN)
    connection.execute(FUSION, [str(DEPMAP / "OmicsFusionFiltered.csv")])
    connection.execute(
        "CREATE OR REPLACE TABLE cell_copy "
        "(line VARCHAR, gene VARCHAR, value INTEGER)"
    )
    connection.executemany(
        "INSERT INTO cell_copy VALUES (?, ?, ?)",
        copy_rows(DEPMAP / "OmicsCNGene.csv", genes, AMPLIFIED, DELETED),
    )

    return {
        t: scalar(connection, f"SELECT count(*) FROM {t}")
        for t in ("cell_line", "cell_mutation", "cell_fusion", "cell_copy")
    }
