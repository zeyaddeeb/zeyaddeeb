# CRISPR research agent

Run `uv run pytest`, `uv run ruff check .`, and
`uvx pyright --pythonpath .venv/bin/python src` from this directory.
The service starts with `uv run uvicorn crispr_research.app:app --port 3007`.

## Evidence and deployment

The image contains the method and measurement inventory, not research datasets.
The deployment keeps the ledger at `/data/research.duckdb`. Populate the existing
PVC's `evidence/` directory with:

- `pack.duckdb`: the dependency pack, prepared from the pinned sources in
  `src/crispr_research/data/pack.py`.
- `bedside.duckdb`: the existing patient analysis database.
- `chord/data_clinical_patient.txt`: the cohort metadata used by the patient gate.

The corresponding settings are `RESEARCH_DATA`, `RESEARCH_BEDSIDE`, and
`RESEARCH_CHORD`. An existing evidence PVC can instead be mounted read-only by
setting Helm `evidence.existingClaim`; its root must contain those same files.
Do not replace open database files in place: provision a new snapshot and restart
the service. No data download or cluster change happens automatically.

The agent reports capability checks in `/agent`. Missing datasets or an
unreachable registry disable that work; the model-based reach exploration remains
available without earning an evidence score. Policy revisions wait for a
calibrated dependency pack. Readiness checks are cached for at most five minutes.

## Research and evaluation

`inspect` describes sources and available inputs or explores a case without
scoring it. `search_trials` retrieves registry identifiers. `probe` persists the
complete prediction and reference forecast before executing a referee. Source
hashes and observations are stored alongside it. Repeating an observed case with
new wording, thresholds or confidence does not earn a new score. Gene ranks are
not p-values, and no current probe produces a statistical discovery claim.

Memory retrieves relevant records before applying a limit, preserves unresolved
and pending states, and includes the previous episode's unfinished next step.
Revisers receive actual action inputs, outcomes and failed attempts.

A stable hash reserves one fifth of genes for evaluation. Exploration cannot
inspect those genes. Each proposed playbook is compared with the champion on
unused, fixed statements, using frozen data, memory, model and token limits.
Each half runs in a fresh in-memory ledger; only cost accounting is shared.
Order is randomized. Negative Brier loss, not agent-selected prediction reward,
decides the comparison. Results are released to the reviser only after the full
trial. Cases are never reused within a data snapshot, even after restart.

Trial j uses a predeclared threshold of `0.05 / (j * (j + 1))`. Eight pairs are
requested by default; this grows up to twelve if needed to make the threshold
attainable. Further automatic revisions pause when twelve pairs cannot reach it.
Invalid challenger forecasts cannot promote a policy. Changed inputs retire an
unfinished trial. These evaluations measure prediction on withheld cases in the
same release; independent biological confirmation is not implemented.

The ledger migration adds tables and preserves historical rows. Old rank-based
p-values and discovery flags remain in the raw history but are withdrawn from API
claims. Legacy unfinished policy trials are retired rather than mixed with the
new evaluation protocol.
