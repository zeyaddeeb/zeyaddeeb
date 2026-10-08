import duckdb

from ..config import CHORD
from ..db import scalar

TABLES = {
    "patient": """
        CREATE OR REPLACE TABLE patient AS
        SELECT PATIENT_ID AS patient, OS_MONTHS * 30.4375 AS follow_up,
               OS_STATUS LIKE '1:%' AS died
        FROM read_csv(?, delim = '\t', comment = '#', header = true)
    """,
    "sample": """
        CREATE OR REPLACE TABLE sample AS
        SELECT SAMPLE_ID AS sample, PATIENT_ID AS patient,
               CANCER_TYPE AS cancer, TMB_NONSYNONYMOUS AS tmb,
               MSI_TYPE AS msi, GENE_PANEL AS panel
        FROM read_csv(?, delim = '\t', comment = '#', header = true)
    """,
    "administration": """
        CREATE OR REPLACE TABLE administration AS
        SELECT PATIENT_ID AS patient, START_DATE AS start,
               coalesce(STOP_DATE, START_DATE) AS stop, AGENT AS agent
        FROM read_csv(?, delim = '\t', header = true)
        WHERE EVENT_TYPE = 'Treatment'
    """,
    "specimen": """
        CREATE OR REPLACE TABLE specimen AS
        SELECT PATIENT_ID AS patient, SAMPLE_ID AS sample, START_DATE AS day
        FROM read_csv(?, delim = '\t', header = true)
    """,
}

SOURCES = {
    "patient": "data_clinical_patient.txt",
    "sample": "data_clinical_sample.txt",
    "administration": "data_timeline_treatment.txt",
    "specimen": "data_timeline_specimen.txt",
}

MUTATION = """
CREATE OR REPLACE TABLE mutation AS
SELECT sampleId AS sample, patientId AS patient,
       gene.hugoGeneSymbol AS gene, proteinChange AS change,
       mutationType AS kind, proteinPosStart AS position
FROM read_json(?, maximum_object_size = 1000000000)
"""

STRUCTURAL = """
CREATE OR REPLACE TABLE structural AS
SELECT sampleId AS sample, patientId AS patient,
       nullif(site1HugoSymbol, '') AS gene_one,
       nullif(site2HugoSymbol, '') AS gene_two
FROM read_json(?, maximum_object_size = 1000000000)
"""

COPY_NUMBER = """
CREATE OR REPLACE TABLE copy_number AS
SELECT sample, Hugo_Symbol AS gene, value::INTEGER AS value
FROM (
    UNPIVOT (
        SELECT * FROM read_csv(
            ?, delim = '\t', header = true, all_varchar = true
        )
    )
    ON COLUMNS(* EXCLUDE (Hugo_Symbol))
    INTO NAME sample VALUE value
)
WHERE value IN ('2', '-2')
"""

PANEL = """
CREATE OR REPLACE TABLE panel_gene AS
SELECT key AS panel, unnest(value::VARCHAR[]) AS gene
FROM (SELECT unnest(map_entries(j::MAP(VARCHAR, JSON)), recursive := true)
      FROM (SELECT json(content) AS j FROM read_text(?)))
"""


def run(connection: duckdb.DuckDBPyConnection) -> dict[str, int]:
    for table, sql in TABLES.items():
        connection.execute(sql, [str(CHORD / SOURCES[table])])

    connection.execute(MUTATION, [str(CHORD / "mutations.json")])
    connection.execute(STRUCTURAL, [str(CHORD / "structural.json")])
    connection.execute(COPY_NUMBER, [str(CHORD / "data_cna.txt")])
    connection.execute(PANEL, [str(CHORD / "panels.json")])
    names = [*TABLES, "mutation", "structural", "copy_number", "panel_gene"]

    return {
        name: scalar(connection, f"SELECT count(*) FROM {name}")
        for name in names
    }
