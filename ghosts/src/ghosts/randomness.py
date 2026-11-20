from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu

from ghosts.llama import LlamaClient, LlamaServer, ServerSpec
from ghosts.lm import CONTEXTS, LocalLM, flip_piece
from ghosts.metrics import pearson_r
from ghosts.protocol import ROOT, ModelSpec, load
from ghosts.rng import SplitMix64, seed_for
from ghosts.stimuli import (
    coin_features,
    fair_stream,
    rigged_coin_bias,
    rigged_coin_markov,
)
from ghosts.study import _score_ab_text, coin_body, wrap_chat

SALT_STRATA = 0x57A7A
LENGTH = 16
RIGGED = (
    ("streaky_0.80", "markov", 0.80),
    ("alternating_0.20", "markov", 0.20),
    ("heads_0.85", "bias", 0.85),
)
QUESTIONS = ("rigged", "nonsense")


def strata_stream(
    seed: int,
    k: int,
    index: int,
    length: int = LENGTH,
) -> list[str]:
    rng = SplitMix64(seed_for(seed, index, SALT_STRATA + 977 * (k + 1)))
    slots = list(range(length - 1))
    for i in range(k):
        j = i + rng.next_int(length - 1 - i)
        slots[i], slots[j] = slots[j], slots[i]
    flips = set(slots[:k])
    cur = rng.next_bit()
    out = ["H" if cur else "T"]
    for t in range(length - 1):
        if t in flips:
            cur = 1 - cur
        out.append("H" if cur else "T")
    return out


def nonsense_body(seq_text: str, *, swapped: bool) -> str:
    opts = (
        "A) a blarg sequence\nB) a zorp sequence"
        if swapped
        else "A) a zorp sequence\nB) a blarg sequence"
    )
    return (
        f"Here are 16 coin flips (H = heads, T = tails):\n{seq_text}\n\n"
        "Half of sequences are zorps; half are blargs.\n"
        f"{opts}\n"
        "Reply with a single letter (A or B)."
    )


def prompt_body(question: str, seq_text: str, *, swapped: bool) -> str:
    if question == "rigged":
        return coin_body(seq_text, framing="neutral", swapped=swapped)
    return nonsense_body(seq_text, swapped=swapped)


def prompt_for(
    question: str,
    seq_text: str,
    *,
    swapped: bool,
    chat: str,
) -> str:
    body = prompt_body(question, seq_text, swapped=swapped)
    return wrap_chat(body, chat, "Answer with only A or B.")


def build_sets(
    seed: int,
    *,
    fair: int,
    per_k: int,
    rigged: int,
) -> dict[str, Any]:
    fair_seqs = [fair_stream(seed, i, LENGTH) for i in range(fair)]
    strata_seqs: list[list[str]] = []
    strata_k: list[int] = []
    for k in range(LENGTH):
        for i in range(per_k):
            strata_seqs.append(strata_stream(seed, k, i))
            strata_k.append(k)
    rigged_seqs: dict[str, list[list[str]]] = {}
    for name, kind, value in RIGGED:
        make = rigged_coin_markov if kind == "markov" else rigged_coin_bias
        rigged_seqs[name] = [
            make(seed + 1, i, LENGTH, value) for i in range(rigged)
        ]
    return {
        "fair": fair_seqs,
        "strata": strata_seqs,
        "strata_k": strata_k,
        "rigged": rigged_seqs,
    }


async def score_model(
    client: LlamaClient,
    model: ModelSpec,
    sets: dict[str, Any],
) -> dict[str, Any]:
    groups: dict[str, list[list[str]]] = {
        "fair": sets["fair"],
        "strata": sets["strata"],
        **{f"rigged:{k}": v for k, v in sets["rigged"].items()},
    }
    out: dict[str, Any] = {}
    for question in QUESTIONS:
        out[question] = {}
        for name, seqs in groups.items():
            texts = [" ".join(s) for s in seqs]
            fwd = [
                prompt_for(question, t, swapped=False, chat=model.chat)
                for t in texts
            ]
            rev = [
                prompt_for(question, t, swapped=True, chat=model.chat)
                for t in texts
            ]
            scores, valid = await _score_ab_text(client, fwd, rev)
            out[question][name] = {
                "scores": scores,
                "valid_rate": float(np.mean(valid)),
            }
            print(
                f"  [{model.key}] {question}/{name} n={len(seqs)} "
                f"mean={np.mean(scores):+.3f} sd={np.std(scores):.3f} "
                f"valid={np.mean(valid):.3f}",
                flush=True,
            )
    return out


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    stat = mannwhitneyu(pos, neg, alternative="two-sided").statistic
    return float(stat) / (len(pos) * len(neg))


def curve_vertex(k: np.ndarray, score: np.ndarray) -> float | None:
    p = k / (LENGTH - 1)
    c2, c1, _ = np.polyfit(p, score, 2)
    if abs(c2) < 1e-9:
        return None
    return float(-c1 / (2 * c2))


def summarize(
    sets: dict[str, Any],
    scored: dict[str, Any],
    questions: tuple[str, ...] = QUESTIONS,
) -> dict[str, Any]:
    fair_feats = [coin_features(s) for s in sets["fair"]]
    alts = np.array([f["alts"] for f in fair_feats])
    run = np.array([f["max_run"] for f in fair_feats])
    heads = np.array([f["h_frac"] for f in fair_feats])
    k = np.array(sets["strata_k"], dtype=np.float64)
    result: dict[str, Any] = {}
    for question in questions:
        q = scored[question]
        fair = np.array(q["fair"]["scores"])
        strata = np.array(q["strata"]["scores"])
        means = [float(np.mean(strata[k == j])) for j in range(LENGTH)]
        entry: dict[str, Any] = {
            "fair_mean": float(np.mean(fair)),
            "fair_sd": float(np.std(fair)),
            "fair_says_first": float(np.mean(fair > 0)),
            "r_alts": pearson_r(fair, alts),
            "r_max_run": pearson_r(fair, run),
            "r_heads": pearson_r(fair, heads),
            "strata_r_k": pearson_r(strata, k),
            "strata_r_dev": pearson_r(strata, np.abs(k - 7.5)),
            "curve": means,
            "curve_span_in_fair_sd": float(
                (max(means) - min(means)) / max(np.std(fair), 1e-9)
            ),
            "least_first_k": int(np.argmin(means)),
            "vertex_alt_rate": curve_vertex(k, strata),
            "auc": {},
        }
        for name, _, _ in RIGGED:
            rig = np.array(q[f"rigged:{name}"]["scores"])
            entry["auc"][name] = auc(rig, fair)
        result[question] = entry
    rq = np.array(scored["rigged"]["fair"]["scores"])
    nq = np.array(scored["nonsense"]["fair"]["scores"])
    result["r_rigged_nonsense_fair"] = pearson_r(rq, nq)
    for name, values in scored.get("alternation", {}).items():
        result[f"alternation_{name}"] = float(np.mean(values["fair"]))
    return result


def score_local(lm: LocalLM, sets: dict[str, Any]) -> dict[str, Any]:
    groups: dict[str, list[list[str]]] = {
        "fair": sets["fair"],
        "strata": sets["strata"],
        **{f"rigged:{k}": v for k, v in sets["rigged"].items()},
    }
    out: dict[str, Any] = {q: {} for q in (*QUESTIONS, "implicit")}
    out["alternation"] = {}
    for name, seqs in groups.items():
        texts = [" ".join(s) for s in seqs]
        for question in QUESTIONS:
            fwd = [prompt_body(question, t, swapped=False) for t in texts]
            rev = [prompt_body(question, t, swapped=True) for t in texts]
            scores = lm.counterbalanced(fwd, rev)
            out[question][name] = {"scores": scores.round(5).tolist()}
        implicit = lm.implicit(seqs)
        out["implicit"][name] = {"scores": implicit["llr"].round(5).tolist()}
        alternation = {
            key.removeprefix("alternation_"): value
            for key, value in implicit.items()
            if key.startswith("alternation_")
        }
        for context, values in alternation.items():
            out["alternation"].setdefault(context, {})[name] = values.round(
                5
            ).tolist()
        print(
            f"  [{lm.repo}] {name} n={len(seqs)} "
            + " ".join(
                f"{q}={np.mean(out[q][name]['scores']):+.3f}"
                f"/{np.std(out[q][name]['scores']):.3f}"
                for q in (*QUESTIONS, "implicit")
            )
            + " alt "
            + " ".join(
                f"{c}={np.mean(v):.3f}" for c, v in alternation.items()
            ),
            flush=True,
        )
    return out


def run_stage_screen(
    *,
    checkpoints: tuple[tuple[str, bool], ...],
    seed: int,
    fair: int,
    per_k: int,
    rigged: int,
    batch: int,
    out_path: Path | None,
) -> dict[str, Any]:
    if seed == load().eval_seed:
        raise ValueError("screens must not touch the evaluation seed")
    sets = build_sets(seed, fair=fair, per_k=per_k, rigged=rigged)
    report: dict[str, Any] = {
        "seed": seed,
        "counts": {"fair": fair, "per_k": per_k, "rigged": rigged},
        "models": {},
    }
    t0 = time.monotonic()
    for repo, chat in checkpoints:
        lm = LocalLM(repo, chat=chat, batch=batch)
        try:
            scored = score_local(lm, sets)
        finally:
            lm.close()
        summary = summarize(sets, scored, (*QUESTIONS, "implicit"))
        report["models"][repo] = {
            "chat": chat,
            "raw": scored,
            "summary": summary,
        }
        print(json.dumps(summary, indent=1), flush=True)
    report["total_seconds"] = round(time.monotonic() - t0, 1)
    target = out_path or (
        ROOT / "runs" / "screens" / f"stages-seed{seed}.json"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=1))
    print(f"wrote {target}", flush=True)
    return report


async def gguf_alternation(
    client: LlamaClient,
    seqs: list[list[str]],
    context: str,
    scheme: str,
) -> dict[str, Any]:
    floor = -20.0

    async def one(seq: list[str]) -> tuple[float, float, int]:
        prefix = context
        total = 0.0
        alts: list[float] = []
        missing = 0
        for t, outcome in enumerate(seq):
            top = await client.completion_top_logprobs(prefix)
            lookup = {e["token"]: float(e["logprob"]) for e in top}
            heads = flip_piece(scheme, t, "H")
            tails = flip_piece(scheme, t, "T")
            missing += (heads not in lookup) + (tails not in lookup)
            lh = lookup.get(heads, floor)
            lt = lookup.get(tails, floor)
            total += lh if outcome == "H" else lt
            if t > 0:
                ph = float(np.exp(lh))
                pt = float(np.exp(lt))
                alts.append((pt if seq[t - 1] == "H" else ph) / (ph + pt))
            prefix += flip_piece(scheme, t, outcome)
        return total, float(np.mean(alts)), missing

    rows = await asyncio.gather(*(one(s) for s in seqs))
    return {
        "logprob": [round(r[0], 5) for r in rows],
        "alternation": [round(r[1], 5) for r in rows],
        "missing_rate": sum(r[2] for r in rows) / (2 * LENGTH * len(rows)),
    }


def run_gguf_implicit_screen(
    *,
    models: tuple[str, ...],
    seed: int,
    fair: int,
    port: int,
    parallel: int,
    out_path: Path | None,
) -> dict[str, Any]:
    p = load()
    if seed == p.eval_seed:
        raise ValueError("screens must not touch the evaluation seed")
    seqs = [fair_stream(seed, i, LENGTH) for i in range(fair)]
    alts = np.array([coin_features(s)["alts"] for s in seqs])
    report: dict[str, Any] = {"seed": seed, "fair": fair, "models": {}}
    t0 = time.monotonic()
    for key in models:
        model = p.models[key]
        spec = ServerSpec(hf_repo=model.repo, port=port, parallel=parallel)

        async def _run() -> dict[str, Any]:
            client = LlamaClient(
                f"http://127.0.0.1:{port}", concurrency=parallel
            )
            try:
                return {
                    name: await gguf_alternation(client, seqs, ctx, scheme)
                    for name, (ctx, scheme) in CONTEXTS.items()
                }
            finally:
                await client.aclose()

        with LlamaServer(spec):
            raw = asyncio.run(_run())
        llr = np.array(raw["rigged"]["logprob"]) - np.array(
            raw["fair"]["logprob"]
        )
        summary = {
            "alternation": {
                name: float(np.mean(v["alternation"]))
                for name, v in raw.items()
            },
            "missing_rate": {
                name: v["missing_rate"] for name, v in raw.items()
            },
            "llr_r_alts": pearson_r(llr, alts),
            "llr_sd": float(np.std(llr)),
        }
        report["models"][key] = {"raw": raw, "summary": summary}
        print(key, json.dumps(summary), flush=True)
    report["total_seconds"] = round(time.monotonic() - t0, 1)
    target = out_path or (
        ROOT / "runs" / "screens" / f"gguf-implicit-seed{seed}.json"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=1))
    print(f"wrote {target}", flush=True)
    return report


def run_randomness_screen(
    *,
    models: tuple[str, ...],
    seed: int,
    fair: int,
    per_k: int,
    rigged: int,
    port: int,
    parallel: int,
    out_path: Path | None,
) -> dict[str, Any]:
    p = load()
    if seed == p.eval_seed:
        raise ValueError("screens must not touch the evaluation seed")
    sets = build_sets(seed, fair=fair, per_k=per_k, rigged=rigged)
    report: dict[str, Any] = {
        "seed": seed,
        "counts": {"fair": fair, "per_k": per_k, "rigged": rigged},
        "models": {},
    }
    t0 = time.monotonic()
    for key in models:
        model = p.models[key]
        spec = ServerSpec(hf_repo=model.repo, port=port, parallel=parallel)

        async def _run(m: ModelSpec = model) -> dict[str, Any]:
            client = LlamaClient(
                f"http://127.0.0.1:{port}", concurrency=parallel
            )
            try:
                return await score_model(client, m, sets)
            finally:
                await client.aclose()

        with LlamaServer(spec):
            scored = asyncio.run(_run())
        report["models"][key] = {
            "raw": scored,
            "summary": summarize(sets, scored),
        }
        print(
            json.dumps(report["models"][key]["summary"], indent=1),
            flush=True,
        )
    report["total_seconds"] = round(time.monotonic() - t0, 1)
    target = out_path or (
        ROOT / "runs" / "screens" / f"randomness-seed{seed}.json"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=1))
    print(f"wrote {target}", flush=True)
    return report
