# No Goals proof service

The Rust backend for [No Goals](https://www.zeyaddeeb.com/experiments/proofs),
an interactive proof playground backed by Lean 4. The course takes a sequence
of tactics, checks it against an actual Lean proof state, and returns the
hypotheses, goals, errors, and completion status for each accepted move.

Read the original project article, [My first attempt at a proof in Lean](https://www.zeyaddeeb.com/blog/posts/proof-in-lean), for the motivation and a walkthrough of the course and night-shift agent.

The same crate contains an optional mathematical-experiment agent and its
numerical instruments. Experimental evidence and Lean-checked proofs have
different meanings; an experiment result is not a proof of the Riemann hypothesis.

## Scope and source

This directory contains the service, its tests, a container recipe, and the
Mathlib configuration used by the optional agent. The Next.js browser interface
is in [`www/apps/www/features/proofs`](../www/apps/www/features/proofs), with
routes in `www/apps/www/app/(site)/experiments/proofs` in the parent repository.
The standalone service archive does not include that frontend or production
deployment configuration.

## Run the proof playground service

Requirements: a Rust toolchain compatible with `Cargo.lock`, Git, and
[elan](https://github.com/leanprover/elan) for Lean toolchain management.
Run these commands from this directory:

```sh
git clone --depth 1 --branch v4.34.0 https://github.com/leanprover-community/repl .repl
(cd .repl && lake build)
cargo run --locked --release
```

If `.repl` already exists, verify its version before reusing it. The Lean REPL
and the toolchain in `mathlib/lean-toolchain` must agree. The service listens
on `127.0.0.1:3005` by default. The agent is off unless explicitly enabled.

```sh
curl http://127.0.0.1:3005/health
curl http://127.0.0.1:3005/levels
curl http://127.0.0.1:3005/check \
  -H 'Content-Type: application/json' \
  -d '{"level":"compute","steps":["rfl"]}'
```

`GET /levels` supplies the supported level identifiers and starting goals.
`POST /check` returns `goals`, per-move `steps`, `solved`, and measured `leanMs`.

## Execution model

Each request replays its supplied moves from the level's initial proof state.
The process pool avoids starting Lean for every move. A timed-out or failed
worker is discarded; healthy workers are periodically recycled.

Defaults in `src/main.rs` are two workers, five seconds per tactic, and
recycling after 200 requests per worker. The HTTP layer limits a request body
to 16 KiB and a proof to 24 moves. Admission to the worker pool waits at most
ten seconds before returning HTTP 503 with `Retry-After: 5`.

`src/lean/guard.rs` rejects constructs such as `sorry`, compiled evaluation,
and unsupported commands in user moves. These checks and time limits are
application controls, not a complete operating-system sandbox. Review process
isolation and resource limits before exposing a deployment to untrusted users.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROOFS_BIND` | `127.0.0.1` | Listening interface; the port is 3005 |
| `PROOFS_REPL_DIR` | `.repl` | Lean REPL checkout/build directory |
| `PROOFS_WORKERS` | `2` | Number of playground workers |
| `PROOFS_STEP_SECONDS` | `5` | Per-tactic timeout |
| `PROOFS_RECYCLE` | `200` | Requests before retiring a worker |
| `RUST_LOG` | `proofs=info,tower_http=info` | Tracing filter |

The optional agent has additional configuration in `src/agent/config.rs`.
Its Mathlib environment is pinned to `v4.34.0`. Consult `moon.yml` for the
Mathlib cache and premise-index build commands; those are not needed for the
core course endpoints.

## Validation

```sh
cargo test --locked --lib
cargo test --locked --test levels
```

The second command needs the built Lean REPL. Other integration suites also
exercise the agent and its Mathlib workbench and require their prerequisites.
The tests cover valid and invalid moves, preservation of earlier successful
steps, goal parsing, input restrictions, and bounded proof execution.

## Citation and license

Use [`CITATION.cff`](CITATION.cff) for author, ORCID, version, and citation
metadata. Version 0.1.15 is archived on Zenodo at
[doi:10.5281/zenodo.23632006](https://doi.org/10.5281/zenodo.23632006).
The service is MIT-licensed under the parent repository's `LICENSE`;
standalone release archives include a copy of that license. Lean, Mathlib,
and other dependencies retain their respective licenses and are not bundled
as binaries in the source archive.
