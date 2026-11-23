# Ghosts

Do language models have a sense of what randomness looks like? This
project shows models pure-noise coin sequences and measures three things
on the same coins: what the model says (a counterbalanced rigged-or-fair
question with a nonsense-label twin), what it expects (how likely each
sequence is under rigged versus fair framings), and how much of that
expectation is about coins rather than a general habit of not repeating
tokens (the same letters framed as a log file). Base and post-trained
checkpoints are compared within each family, and OLMo checkpoints step by
step.

## Protocols

- `randomness.toml` is the current study, sealed 2026-11-19 and evaluated
  on seed 200 (`runs/coins-3447c2d0127c-eval/`). Its SHA-256 names the run
  directory `runs/coins-<first 12 hex>-<eval|calibration-N>/`, so the file
  must stay byte-identical. The evaluation seed is refused while the
  file's status says DRAFT.
- `randomness.amendments.toml` records changes after sealing. They live
  outside the protocol because editing it would change the run id, and
  none of them alters a registered verdict.
- `method.toml` is the earlier sealed 2D study (run `e00413254584`), kept
  unchanged as a record. Its reanalysis shows the ASCII and vision maps are
  readout artifacts and its coin false alarms are response bias.

## Commands

```sh
uv sync
export PYTHONPATH=src
uv run python -m ghosts.cli coins-run --seed 0
uv run python -m ghosts.cli coins-analyze --seed 0
uv run python -m ghosts.cli fixture ../www/apps/www/features/ghosts/parity.json
uv run pytest
uv run ruff check .
```

Scoring runs locally through `transformers` in float32 on the pinned
revisions listed in `randomness.toml`. bfloat16 rounds the answer log-odds
to 0.0625 steps, which is coarser than a base model's whole spread.

Calibration screens live in `runs/screens/` and are produced by
`screen-randomness`, `screen-gguf-implicit` and `screen-stages`.

Run files are kept in one layout: 2-space indents, with lists of numbers
wrapped at 80 columns. The sealed runner writes compact JSON (its code is
hashed, so it stays as sealed), so reformat after any new run:

```sh
uv run python -m ghosts.cli format-json runs
```

## Paper

`paper/main.tex` is the write-up of the sealed run. Every number, table
and figure in it comes from `paper/generated/`, which one command rebuilds
from the raw scores, the report and the protocol:

```sh
uv run python -m ghosts.cli paper-data
cd paper && tectonic -X compile main.tex
```

Analyses added after the evaluation (the nonsense-twin partial
correlation, the first-flip and H/T-symmetry readout diagnostic, the
alternating-end upturn, the rigged-set AUCs, and the 3x3 wording-by-framing
matrix) are computed in `src/ghosts/paper.py` and `src/ghosts/diagnostics.py`
and labeled post hoc or exploratory in the text.

Post-hoc diagnostics and follow-up ablations (none of which modifies any file
hashed in `randomness.toml [seal]`):

```sh
uv run python -m ghosts.cli diagnostics --update-paper --update-page
uv run python -m ghosts.cli followup-raw
uv run python -m ghosts.cli followup-cot --count 100
uv run python -m ghosts.cli followup-scale --base-repo Qwen/Qwen2.5-7B --post-repo Qwen/Qwen2.5-7B-Instruct
```

## Web page

`/experiments/ghosts` reads one file, `www/apps/www/features/ghosts/study.json`
(about 50 KB: per-coin scores as signed bytes, per-checkpoint summaries,
the pilot's numbers). Rebuild it from the sealed run with:

```sh
uv run python -m ghosts.cli page-data
```

The page regenerates the 600 fair coins from seed 200 in the browser, and
a test checks them against the export bit for bit.
