import json
import time
from pathlib import Path

import duckdb
import numpy as np

from ..config import DATA, labels_sha256, method, method_sha256
from ..model import interaction, pool
from ..sources.fetch import sha256
from . import model

BENCH = DATA / "bench"
PREDICTIONS = BENCH / "predictions.json"
EXPLORE = BENCH / "explore.json"
FEWEST_LINES = 3
CONFIDENT = 0.95
SKIPPED = {"tmb_high", "msi_high"}


def biomarkers(
    connection: duckdb.DuckDBPyConnection, allowed: set[str]
) -> list[str]:
    rows = connection.execute(
        "SELECT b.name, count(DISTINCT b.line) FILTER (WHERE b.value) "
        "FROM cell_biomarker b "
        "WHERE b.line IN (SELECT line FROM cell_response) "
        "GROUP BY 1 ORDER BY 1"
    ).fetchall()

    return [
        n
        for n, k in rows
        if k >= FEWEST_LINES and n in allowed and n not in SKIPPED
    ]


def infer(job: tuple[str, model.Screen], settings: dict) -> list[dict]:
    biomarker, screen = job
    trace = interaction.sample(model.build(screen), settings, settings["seed"])
    ok = interaction.converged(trace, ("b",))
    found = []

    for (cancer, name), draws in model.contrasts(trace, screen).items():
        lines = screen.lines.get((cancer, name), 0)
        sensitizes = float((draws < 0).mean())
        found.append(
            {
                "cancer": cancer,
                "biomarker": biomarker,
                "drug_class": name,
                "median": float(np.median(draws)),
                "sd": float(draws.std()),
                "sensitizes": sensitizes,
                "lines": lines,
                "support": "lineage" if lines >= FEWEST_LINES else "pan",
                "converged": ok,
                "confident": ok
                and max(sensitizes, 1 - sensitizes) >= CONFIDENT,
            }
        )

    return found


def run(
    connection: duckdb.DuckDBPyConnection, names: list[str], dest: Path
) -> str:
    rows: list[dict] = []

    def finish(job: tuple[str, model.Screen], found: list[dict]) -> None:
        rows.extend(found)
        print(f"predicted {job[0]}", flush=True)

    pool.fan_out(
        names,
        lambda name: (name, model.load(connection, name)),
        infer,
        finish,
        settings=method()["model"],
    )
    rows.sort(key=lambda r: (r["biomarker"], r["cancer"], r["drug_class"]))

    manifest = json.loads((DATA / "manifest.json").read_text())
    body = {
        "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "method_sha256": method_sha256(),
        "labels_sha256": labels_sha256(),
        "sources": {
            k: v["sha256"]
            for k, v in manifest.items()
            if k.startswith(("depmap/", "prism/"))
        },
        "predictions": rows,
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(body, indent=2))

    return sha256(dest)


def sealed(path: Path) -> list[dict]:
    return json.loads(path.read_text())["predictions"]
