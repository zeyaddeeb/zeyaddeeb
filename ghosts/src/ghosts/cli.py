from __future__ import annotations

import argparse
from pathlib import Path

from ghosts.analysis import analyze_all
from ghosts.coinstudy import analyze_study, run_study
from ghosts.export import export_parity_fixture, export_web
from ghosts.followup import (
    DEFAULT_RAW_MODELS,
    DEFAULT_SCALE_BASE,
    DEFAULT_SCALE_POST,
    run_raw_text_ablation,
    run_scale_check,
    run_think_cot_sample,
)
from ghosts.jsonfmt import format_tree
from ghosts.page import TARGET, enrich_page_from_study, export_page
from ghosts.paper import export_diagnostics_paper, export_paper
from ghosts.protocol import load
from ghosts.randomness import (
    run_gguf_implicit_screen,
    run_randomness_screen,
    run_stage_screen,
)
from ghosts.screen import (
    run_ascii_2afc_screen,
    run_ascii_screen,
    run_mirage_screen,
    run_vlm_2afc_screen,
    run_vlm_screen,
)
from ghosts.study import run_all


def _add_common(
    p: argparse.ArgumentParser,
    *,
    port: int,
    parallel: int,
) -> None:
    p.add_argument("--repo", required=True)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--port", type=int, default=port)
    p.add_argument("--parallel", type=int, default=parallel)
    p.add_argument("--out", type=Path, default=None)


def _add_ascii(
    sub: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    for name, fn in (
        ("screen-ascii", run_ascii_screen),
        ("screen-ascii-2afc", run_ascii_2afc_screen),
    ):
        p = sub.add_parser(name)
        _add_common(p, port=8089, parallel=8)
        p.add_argument("--base", action="store_true")
        p.add_argument("--count", type=int, default=400)
        p.add_argument("--size", type=int, default=9)
        p.set_defaults(
            fn=lambda a, f=fn: f(
                a.repo,
                instruct=not a.base,
                count=a.count,
                size=a.size,
                seed=a.seed,
                port=a.port,
                parallel=a.parallel,
                out_path=a.out,
            )
        )


def _add_vlm(
    sub: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    for name, fn, cnt, sz, sc in (
        ("screen-vlm", run_vlm_screen, 400, 12, 10),
        ("screen-vlm-2afc", run_vlm_2afc_screen, 600, 32, 7),
    ):
        p = sub.add_parser(name)
        _add_common(p, port=8090, parallel=4)
        p.add_argument("--count", type=int, default=cnt)
        p.add_argument("--size", type=int, default=sz)
        p.add_argument("--scale", type=int, default=sc)
        p.set_defaults(
            fn=lambda a, f=fn: f(
                a.repo,
                count=a.count,
                size=a.size,
                scale=a.scale,
                seed=a.seed,
                port=a.port,
                parallel=a.parallel,
                out_path=a.out,
            )
        )


def _add_study(
    sub: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    s = sub.add_parser("seal")
    s.set_defaults(fn=lambda _: print(load().sha))

    r = sub.add_parser("run")
    r.add_argument(
        "--suites",
        default="ascii,vision,coins,mirage",
    )
    r.add_argument("--force", action="store_true")
    r.set_defaults(
        fn=lambda a: run_all(
            suites=tuple(x.strip() for x in a.suites.split(",") if x.strip()),
            force=a.force,
        )
    )

    an = sub.add_parser("analyze")
    an.set_defaults(fn=lambda _: analyze_all())

    ex = sub.add_parser("export")
    ex.add_argument("--out", type=Path, required=True)
    ex.add_argument("--data", type=Path, required=True)
    ex.set_defaults(fn=lambda a: export_web(a.out, a.data))

    fx = sub.add_parser("fixture")
    fx.add_argument("path", type=Path)
    fx.set_defaults(fn=lambda a: export_parity_fixture(a.path))


def _add_outputs(sub: argparse._SubParsersAction) -> None:
    pp = sub.add_parser("paper-data")
    pp.set_defaults(fn=lambda a: export_paper())
    pw = sub.add_parser("page-data")
    pw.set_defaults(fn=lambda a: export_page())
    dg = sub.add_parser("diagnostics")
    dg.add_argument("--study", type=Path, default=TARGET)
    dg.add_argument("--update-paper", action="store_true")
    dg.add_argument("--update-page", action="store_true")

    def _run_diag(a: argparse.Namespace) -> None:
        if a.update_paper or not a.update_page:
            export_diagnostics_paper(a.study)
        if a.update_page or not a.update_paper:
            enrich_page_from_study(a.study)

    dg.set_defaults(fn=_run_diag)
    fr = sub.add_parser("followup-raw")
    fr.add_argument("--models", default=",".join(DEFAULT_RAW_MODELS))
    fr.add_argument("--seed", type=int, default=None)
    fr.add_argument("--batch", type=int, default=64)
    fr.set_defaults(
        fn=lambda a: run_raw_text_ablation(
            models=tuple(x.strip() for x in a.models.split(",") if x.strip()),
            seed=a.seed,
            batch=a.batch,
        )
    )
    fc = sub.add_parser("followup-cot")
    fc.add_argument("--model", default="olmo3_think")
    fc.add_argument("--wording", default="w1")
    fc.add_argument("--count", type=int, default=100)
    fc.add_argument("--max-new-tokens", type=int, default=512)
    fc.add_argument("--seed", type=int, default=None)
    fc.set_defaults(
        fn=lambda a: run_think_cot_sample(
            model_key=a.model,
            wording=a.wording,
            count=a.count,
            max_new_tokens=a.max_new_tokens,
            seed=a.seed,
        )
    )
    fs = sub.add_parser("followup-scale")
    fs.add_argument("--base-repo", default=DEFAULT_SCALE_BASE)
    fs.add_argument("--post-repo", default=DEFAULT_SCALE_POST)
    fs.add_argument("--base-revision", default=None)
    fs.add_argument("--post-revision", default=None)
    fs.add_argument("--label", default="Qwen2.5 7B")
    fs.add_argument("--seed", type=int, default=None)
    fs.add_argument("--batch", type=int, default=32)
    fs.set_defaults(
        fn=lambda a: run_scale_check(
            base_repo=a.base_repo,
            post_repo=a.post_repo,
            base_revision=a.base_revision,
            post_revision=a.post_revision,
            label=a.label,
            seed=a.seed,
            batch=a.batch,
        )
    )
    fj = sub.add_parser("format-json")
    fj.add_argument("roots", type=Path, nargs="*", default=[Path("runs")])
    fj.set_defaults(
        fn=lambda a: print(
            f"formatted {sum(len(format_tree(r)) for r in a.roots)} files"
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="ghosts")
    sub = parser.add_subparsers(required=True)
    _add_study(sub)
    _add_ascii(sub)
    _add_vlm(sub)

    pm = sub.add_parser("screen-mirage")
    _add_common(pm, port=8091, parallel=8)
    pm.add_argument("--streams", type=int, default=16)
    pm.add_argument("--length", type=int, default=128)
    pm.set_defaults(
        fn=lambda a: run_mirage_screen(
            a.repo,
            n_streams=a.streams,
            length=a.length,
            seed=a.seed,
            port=a.port,
            parallel=a.parallel,
            out_path=a.out,
        )
    )

    pr = sub.add_parser("screen-randomness")
    pr.add_argument(
        "--models",
        default="qwen_base,qwen_instruct,llama_base,llama_instruct",
    )
    pr.add_argument("--seed", type=int, default=0)
    pr.add_argument("--fair", type=int, default=1000)
    pr.add_argument("--per-k", type=int, default=40)
    pr.add_argument("--rigged", type=int, default=200)
    pr.add_argument("--port", type=int, default=8092)
    pr.add_argument("--parallel", type=int, default=8)
    pr.add_argument("--out", type=Path, default=None)
    pr.set_defaults(
        fn=lambda a: run_randomness_screen(
            models=tuple(x.strip() for x in a.models.split(",") if x.strip()),
            seed=a.seed,
            fair=a.fair,
            per_k=a.per_k,
            rigged=a.rigged,
            port=a.port,
            parallel=a.parallel,
            out_path=a.out,
        )
    )

    cs = sub.add_parser("coins-run")
    cs.add_argument("--seed", type=int, required=True)
    cs.add_argument("--models", default="")
    cs.add_argument("--batch", type=int, default=64)
    cs.set_defaults(
        fn=lambda a: run_study(
            seed=a.seed,
            models=tuple(x.strip() for x in a.models.split(",") if x.strip())
            or None,
            batch=a.batch,
        )
    )
    ca = sub.add_parser("coins-analyze")
    ca.add_argument("--seed", type=int, required=True)
    ca.set_defaults(fn=lambda a: analyze_study(a.seed))
    _add_outputs(sub)

    pg = sub.add_parser("screen-gguf-implicit")
    pg.add_argument(
        "--models",
        default="qwen_base,qwen_instruct,llama_base,llama_instruct",
    )
    pg.add_argument("--seed", type=int, default=0)
    pg.add_argument("--fair", type=int, default=300)
    pg.add_argument("--port", type=int, default=8093)
    pg.add_argument("--parallel", type=int, default=8)
    pg.add_argument("--out", type=Path, default=None)
    pg.set_defaults(
        fn=lambda a: run_gguf_implicit_screen(
            models=tuple(x.strip() for x in a.models.split(",") if x.strip()),
            seed=a.seed,
            fair=a.fair,
            port=a.port,
            parallel=a.parallel,
            out_path=a.out,
        )
    )

    ps = sub.add_parser("screen-stages")
    ps.add_argument(
        "--checkpoints",
        required=True,
        help="comma list of repo:base or repo:chat",
    )
    ps.add_argument("--seed", type=int, default=0)
    ps.add_argument("--fair", type=int, default=1000)
    ps.add_argument("--per-k", type=int, default=40)
    ps.add_argument("--rigged", type=int, default=200)
    ps.add_argument("--batch", type=int, default=64)
    ps.add_argument("--out", type=Path, default=None)
    ps.set_defaults(
        fn=lambda a: run_stage_screen(
            checkpoints=_checkpoints(a.checkpoints),
            seed=a.seed,
            fair=a.fair,
            per_k=a.per_k,
            rigged=a.rigged,
            batch=a.batch,
            out_path=a.out,
        )
    )

    args = parser.parse_args()
    args.fn(args)


def _checkpoints(text: str) -> tuple[tuple[str, bool], ...]:
    out: list[tuple[str, bool]] = []
    for item in text.split(","):
        repo, _, kind = item.strip().rpartition(":")
        if kind not in {"base", "chat"} or not repo:
            raise SystemExit(f"bad checkpoint {item!r}: use repo:base|chat")
        out.append((repo, kind == "chat"))
    return tuple(out)


if __name__ == "__main__":
    main()
