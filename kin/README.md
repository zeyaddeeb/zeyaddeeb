# Kin

A paternity test for neural networks. A copy of a parent model learns
from nothing but a suspect's spare outputs on static. If the copy moves
toward the suspect on real digits, the suspect carries the parent's
weights. The same channel carries a lie from parent to family, and only
to family.

`method.toml` is the registered protocol and the only source of the
numbers the code uses. Its sha256 is the run id: results land in
`runs/<first 12 hex digits>/`, one JSON file per seed, and the analysis
writes `runs/<id>.report.json` next to them. Both are kept in the repo
as the study's evidence.

```sh
uv sync
export PYTHONPATH=src
uv run python -m kin.cli seal
uv run python -m kin.cli run --seeds 0-29 --jobs 15
uv run python -m kin.cli analyze
uv run python -m kin.cli export \
  --out ../www/apps/www/public/runs-in-the-family \
  --data ../www/apps/www/features/kin/study-data.ts
uv run python -m kin.cli fixture ../www/packages/wasm/tests/kin-parity.json
uv run pytest
uv run ruff check .
```

`export` rebuilds the evaluation seed closest to the medians with the
study code, single-threaded, and writes per-row 8-bit weights, the first
1,000 MNIST test digits and the page's pinned numbers. It is
deterministic. `fixture` writes the three-step Adam trajectory that
`cargo test kin` in `www/packages/wasm` must match.

MNIST and Fashion-MNIST download to `.data/` on first use, or to
`KIN_DATA` when it is set. `PYTHONPATH=src` is there because macOS can
set the `hidden` flag on the editable `kin.pth`, which Python 3.14 then
skips.

Everything here is MNIST-scale. The language-model stage is separate and
gated on these results.
