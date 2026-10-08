import duckdb

from ..config import method
from ..db import scalar

COURSES = """
CREATE OR REPLACE TABLE course AS
WITH classed AS (
    SELECT a.patient, a.start, a.stop, c.class
    FROM administration a JOIN class_agent c USING (agent)
),
ordered AS (
    SELECT *,
           max(stop) OVER (
               PARTITION BY patient, class ORDER BY start
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS previous_stop
    FROM classed
),
grouped AS (
    SELECT *,
           sum(CASE WHEN previous_stop IS NULL OR start - previous_stop > ?
                    THEN 1 ELSE 0 END)
               OVER (PARTITION BY patient, class ORDER BY start
                     ROWS UNBOUNDED PRECEDING) AS episode
    FROM ordered
)
SELECT patient, class, episode, min(start) AS start, max(stop) AS stop
FROM grouped
GROUP BY patient, class, episode
"""

FIRST_SAMPLE = """
CREATE OR REPLACE TABLE first_sample AS
SELECT s.patient, s.sample, sp.day, s.cancer, s.tmb, s.msi, s.panel
FROM specimen sp JOIN sample s USING (sample)
QUALIFY row_number() OVER (
    PARTITION BY s.patient ORDER BY sp.day, s.sample
) = 1
"""

ELIGIBLE = """
CREATE OR REPLACE TABLE eligible AS
WITH counted AS (
    SELECT c.*,
           count(*) OVER (
               PARTITION BY c.patient ORDER BY c.start
               RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS prior
    FROM course c
)
SELECT c.patient, f.cancer, c.class, c.start, c.stop, c.prior,
       greatest(c.stop - c.start, 1) AS time,
       (p.died OR c.stop < p.follow_up - ?) AS event
FROM counted c
JOIN first_sample f USING (patient)
JOIN patient p USING (patient)
WHERE c.start >= f.day AND c.start < p.follow_up
"""


def _classes(connection: duckdb.DuckDBPyConnection) -> None:
    rows = [
        (agent, name)
        for name, agents in method()["classes"].items()
        for agent in agents
    ]
    connection.execute(
        "CREATE OR REPLACE TABLE class_agent (agent VARCHAR, class VARCHAR)"
    )
    connection.executemany("INSERT INTO class_agent VALUES (?, ?)", rows)


def build(connection: duckdb.DuckDBPyConnection) -> int:
    settings = method()["courses"]
    _classes(connection)
    connection.execute(COURSES, [settings["merge_gap_days"]])
    connection.execute(FIRST_SAMPLE)
    connection.execute(ELIGIBLE, [settings["censor_window_days"]])

    return scalar(connection, "SELECT count(*) FROM eligible")
