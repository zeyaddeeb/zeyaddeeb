from pathlib import Path

import duckdb

from . import config


def connect(path: Path | None = None) -> duckdb.DuckDBPyConnection:
    target = path or config.DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)

    return duckdb.connect(str(target))


def scalar(
    connection: duckdb.DuckDBPyConnection, sql: str, params: list | None = None
):
    row = connection.execute(sql, params or []).fetchone()

    if row is None:
        raise LookupError(sql)

    return row[0]
