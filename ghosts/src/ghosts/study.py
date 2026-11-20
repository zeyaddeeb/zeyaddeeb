from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.llama import (
    LlamaClient,
    LlamaServer,
    ServerSpec,
    extract_alphabet_probs,
    extract_log_odds,
)
from ghosts.metrics import (
    bayesian_dirichlet_probs,
    find_ngram_echoes,
    kl_to_uniform,
)
from ghosts.protocol import ROOT, ModelSpec, Protocol, load
from ghosts.stimuli import (
    binary_patch,
    fair_stream,
    noise_grid,
    patch_to_png_data_url,
    render_ascii,
    rigged_coin_bias,
    rigged_coin_markov,
)

RUNS = ROOT / "runs"
A_TOKS = ("A", " A")
B_TOKS = ("B", " B")


def run_dir(p: Protocol | None = None) -> Path:
    proto = p or load()
    d = RUNS / proto.sha[:12]
    d.mkdir(parents=True, exist_ok=True)
    return d


def wrap_chat(body: str, chat: str, system: str) -> str:
    if chat == "chatml":
        return (
            f"<|im_start|>system\n{system}<|im_end|>\n"
            f"<|im_start|>user\n{body}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
    if chat == "llama3":
        return (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            f"{system}<|eot_id|>"
            "<|start_header_id|>user<|end_header_id|>\n\n"
            f"{body}<|eot_id|>"
            "<|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    return f"{body}\nAnswer: "


def prompt_ascii_detect(
    grid_text: str,
    target: str,
    *,
    swapped: bool,
    chat: str,
) -> str:
    opts = (
        f"A) pure random static\nB) a hidden {target}"
        if swapped
        else f"A) a hidden {target}\nB) pure random static"
    )
    body = (
        f"Inspect this ASCII grid of '.' (dark) and '#' (bright) pixels.\n"
        f"Half of grids are pure random static; half contain a faint "
        f"{target}.\n"
        f"{opts}\n\n"
        f"{grid_text}\n\n"
        f"Reply with a single letter (A or B)."
    )
    return wrap_chat(
        body,
        chat,
        "You are a careful visual psychophysics observer. "
        "Answer with only A or B.",
    )


def prompt_ascii_pair(
    grid_text: str,
    opt_a: str,
    opt_b: str,
    *,
    swapped: bool,
    chat: str,
) -> str:
    first, second = (opt_b, opt_a) if swapped else (opt_a, opt_b)
    body = (
        f"This ASCII grid of '.' (dark) and '#' (bright) pixels contains a "
        f"faint hidden shape.\n"
        f"Which does it look more like?\n"
        f"A) {first}\nB) {second}\n\n"
        f"{grid_text}\n\n"
        f"Reply with a single letter (A or B)."
    )
    return wrap_chat(
        body,
        chat,
        "You are a careful visual psychophysics observer. "
        "Answer with only A or B.",
    )


def prompt_vlm_pair(opt_a: str, opt_b: str, *, swapped: bool) -> str:
    first, second = (opt_b, opt_a) if swapped else (opt_a, opt_b)
    return (
        "This noisy black-and-white grid contains a faint hidden shape.\n"
        "Which does it look more like?\n"
        f"A) {first}\nB) {second}\n"
        "Answer with only the single letter A or B."
    )


def prompt_coin(
    seq_text: str,
    *,
    framing: str,
    swapped: bool,
    chat: str,
) -> str:
    body = coin_body(seq_text, framing=framing, swapped=swapped)
    return wrap_chat(body, chat, "Answer with only A or B.")


def coin_body(seq_text: str, *, framing: str, swapped: bool) -> str:
    if framing == "skeptical":
        lead = (
            "Almost all sequences come from a fair random coin; "
            "only rarely is one rigged or patterned."
        )
    elif framing == "suggestive":
        lead = (
            "Look closely for subtle patterns or bias — many sequences "
            "are secretly rigged or patterned."
        )
    else:
        lead = (
            "Half of sequences come from a fair random coin; "
            "half are rigged or patterned."
        )
    opts = (
        "A) fair random coin flips\nB) a rigged or patterned sequence"
        if swapped
        else "A) a rigged or patterned sequence\nB) fair random coin flips"
    )
    return (
        f"Here are 16 coin flips (H = heads, T = tails):\n{seq_text}\n\n"
        f"{lead}\n{opts}\n"
        f"Reply with a single letter (A or B)."
    )


async def _score_ab_text(
    client: LlamaClient,
    prompts_fwd: list[str],
    prompts_rev: list[str],
) -> tuple[list[float], list[bool]]:
    n = len(prompts_fwd)
    scores = [0.0] * n
    valid = [False] * n

    async def one(i: int) -> tuple[int, float, bool]:
        lp1 = await client.completion_top_logprobs(prompts_fwd[i])
        s1, ok1 = extract_log_odds(lp1, A_TOKS, B_TOKS)
        lp2 = await client.completion_top_logprobs(prompts_rev[i])
        s2, ok2 = extract_log_odds(lp2, B_TOKS, A_TOKS)
        return i, 0.5 * (s1 + s2), ok1 and ok2

    tasks = [asyncio.create_task(one(i)) for i in range(n)]
    for fut in asyncio.as_completed(tasks):
        idx, sc, ok = await fut
        scores[idx] = round(sc, 5)
        valid[idx] = ok
    return scores, valid


async def _score_ab_vlm(
    client: LlamaClient,
    urls: list[str],
    opt_a: str,
    opt_b: str,
    *,
    counterbalance: bool,
) -> tuple[list[float], list[bool]]:
    n = len(urls)
    scores = [0.0] * n
    valid = [False] * n
    system = "You are a visual psychophysics observer. Reply with only A or B."
    pf = prompt_vlm_pair(opt_a, opt_b, swapped=False)
    pr = prompt_vlm_pair(opt_a, opt_b, swapped=True)

    async def one(i: int) -> tuple[int, float, bool]:
        lp1 = await client.chat_image_top_logprobs(urls[i], pf, system=system)
        s1, ok1 = extract_log_odds(lp1, A_TOKS, B_TOKS)
        if not counterbalance:
            return i, s1, ok1
        lp2 = await client.chat_image_top_logprobs(urls[i], pr, system=system)
        s2, ok2 = extract_log_odds(lp2, B_TOKS, A_TOKS)
        return i, 0.5 * (s1 + s2), ok1 and ok2

    tasks = [asyncio.create_task(one(i)) for i in range(n)]
    for fut in asyncio.as_completed(tasks):
        idx, sc, ok = await fut
        scores[idx] = round(sc, 5)
        valid[idx] = ok
    return scores, valid


def run_ascii_suite(
    p: Protocol,
    *,
    port: int = 8089,
    parallel: int = 10,
    force: bool = False,
) -> Path:
    out = run_dir(p) / "ascii.json"
    if out.exists() and not force:
        print(f"skip existing {out}", flush=True)
        return out
    cfg = p.raw["ascii"]
    seed = p.eval_seed
    count = int(cfg["count"])
    size = int(cfg["size"])
    grids = [noise_grid(seed, i, size) for i in range(count)]
    rendered = {
        "packed": [render_ascii(g, spaced=False) for g in grids],
        "spaced": [render_ascii(g, spaced=True) for g in grids],
    }
    t0 = time.monotonic()
    data: dict[str, Any] = {
        "protocol": p.sha,
        "seed": seed,
        "count": count,
        "size": size,
        "models": {},
    }

    for key in cfg["models"]:
        m: ModelSpec = p.models[key]
        m_out: dict[str, Any] = {"detect": {}, "pairs": {}}
        print(f"[ascii] starting {key} ({m.repo})", flush=True)

        async def _model(
            ms: ModelSpec = m, bucket: dict[str, Any] = m_out
        ) -> None:
            client = LlamaClient(
                f"http://127.0.0.1:{port}", concurrency=parallel
            )
            try:
                for enc in cfg["encodings"]:
                    texts = rendered[enc]
                    for target in cfg["targets"]:
                        t1 = time.monotonic()
                        pf = [
                            prompt_ascii_detect(
                                tx, target, swapped=False, chat=ms.chat
                            )
                            for tx in texts
                        ]
                        pr = [
                            prompt_ascii_detect(
                                tx, target, swapped=True, chat=ms.chat
                            )
                            for tx in texts
                        ]
                        sc, val = await _score_ab_text(client, pf, pr)
                        bucket["detect"][f"{enc}/{target}"] = {
                            "scores": sc,
                            "valid_rate": float(np.mean(val)),
                            "seconds": round(time.monotonic() - t1, 2),
                        }
                        print(
                            f"  [ascii] {ms.key} {enc}/{target} "
                            f"mean={np.mean(sc):+.2f}±{np.std(sc):.2f} "
                            f"({time.monotonic() - t1:.1f}s)",
                            flush=True,
                        )
                    for opt_a, opt_b in cfg["pairs"]:
                        t1 = time.monotonic()
                        pf = [
                            prompt_ascii_pair(
                                tx, opt_a, opt_b, swapped=False, chat=ms.chat
                            )
                            for tx in texts
                        ]
                        pr = [
                            prompt_ascii_pair(
                                tx, opt_a, opt_b, swapped=True, chat=ms.chat
                            )
                            for tx in texts
                        ]
                        sc, val = await _score_ab_text(client, pf, pr)
                        pkey = f"{enc}/{opt_a} vs {opt_b}"
                        bucket["pairs"][pkey] = {
                            "scores": sc,
                            "valid_rate": float(np.mean(val)),
                            "seconds": round(time.monotonic() - t1, 2),
                        }
                        print(
                            f"  [ascii] {ms.key} {pkey} "
                            f"mean={np.mean(sc):+.2f}±{np.std(sc):.2f} "
                            f"({time.monotonic() - t1:.1f}s)",
                            flush=True,
                        )
            finally:
                await client.aclose()

        with LlamaServer(ServerSpec(m.repo, port=port, parallel=parallel)):
            asyncio.run(_model())
        data["models"][key] = m_out

    data["total_seconds"] = round(time.monotonic() - t0, 2)
    out.write_text(json.dumps(data))
    print(f"[ascii] wrote {out} in {data['total_seconds']}s", flush=True)
    return out


def run_vision_suite(
    p: Protocol,
    *,
    port: int = 8090,
    parallel: int = 6,
    force: bool = False,
) -> Path:
    out = run_dir(p) / "vision.json"
    if out.exists() and not force:
        print(f"skip existing {out}", flush=True)
        return out
    cfg = p.raw["vision"]
    seed = p.eval_seed
    m = p.models[cfg["model"]]
    t0 = time.monotonic()
    b_cnt = int(cfg["binary_count"])
    b_sz = int(cfg["binary_size"])
    b_sc = int(cfg["binary_scale"])
    p_cnt = int(cfg["polarity_count"])
    s_cnt = int(cfg["spatial_count"])
    s_sz = int(cfg["spatial_size"])
    s_sc = int(cfg["spatial_scale"])
    cb = bool(cfg["counterbalance"])

    b_patches = [binary_patch(seed, i, b_sz) for i in range(b_cnt)]
    b_urls = [
        patch_to_png_data_url(g, scale=b_sc, smooth=False) for g in b_patches
    ]
    inv_urls = [
        patch_to_png_data_url(-g, scale=b_sc, smooth=False)
        for g in b_patches[:p_cnt]
    ]
    s_patches = [binary_patch(seed, i, s_sz) for i in range(s_cnt)]
    s_urls = [
        patch_to_png_data_url(g, scale=s_sc, smooth=False) for g in s_patches
    ]

    data: dict[str, Any] = {
        "protocol": p.sha,
        "seed": seed,
        "model": m.key,
        "binary_count": b_cnt,
        "binary_size": b_sz,
        "spatial_count": s_cnt,
        "spatial_size": s_sz,
        "binary": {},
        "polarity_inverted_x_vs_o": [],
        "spatial": {},
    }

    async def _run() -> None:
        client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
        try:
            for opt_a, opt_b in cfg["binary_pairs"]:
                t1 = time.monotonic()
                sc, val = await _score_ab_vlm(
                    client, b_urls, opt_a, opt_b, counterbalance=cb
                )
                key = f"{opt_a} vs {opt_b}"
                data["binary"][key] = {
                    "scores": sc,
                    "valid_rate": float(np.mean(val)),
                    "seconds": round(time.monotonic() - t1, 2),
                }
                print(
                    f"  [vision] 8x8 {key} "
                    f"mean={np.mean(sc):+.3f}±{np.std(sc):.3f} "
                    f"({time.monotonic() - t1:.1f}s)",
                    flush=True,
                )

            t1 = time.monotonic()
            inv_sc, _ = await _score_ab_vlm(
                client,
                inv_urls,
                cfg["binary_pairs"][0][0],
                cfg["binary_pairs"][0][1],
                counterbalance=cb,
            )
            data["polarity_inverted_x_vs_o"] = inv_sc
            print(
                f"  [vision] polarity inverted ({p_cnt}) "
                f"({time.monotonic() - t1:.1f}s)",
                flush=True,
            )

            for opt_a, opt_b in cfg["spatial_pairs"]:
                t1 = time.monotonic()
                sc, val = await _score_ab_vlm(
                    client, s_urls, opt_a, opt_b, counterbalance=cb
                )
                key = f"{opt_a} vs {opt_b}"
                data["spatial"][key] = {
                    "scores": sc,
                    "valid_rate": float(np.mean(val)),
                    "seconds": round(time.monotonic() - t1, 2),
                }
                print(
                    f"  [vision] 6x6 {key} "
                    f"mean={np.mean(sc):+.3f}±{np.std(sc):.3f} "
                    f"({time.monotonic() - t1:.1f}s)",
                    flush=True,
                )
        finally:
            await client.aclose()

    spec = ServerSpec(
        m.repo, port=port, parallel=parallel, ctx_size=4096, vision=True
    )
    print(f"[vision] starting {m.key} ({m.repo})", flush=True)
    with LlamaServer(spec):
        asyncio.run(_run())

    data["total_seconds"] = round(time.monotonic() - t0, 2)
    out.write_text(json.dumps(data))
    print(f"[vision] wrote {out} in {data['total_seconds']}s", flush=True)
    return out


def run_coins_suite(
    p: Protocol,
    *,
    port: int = 8089,
    parallel: int = 10,
    force: bool = False,
) -> Path:
    out = run_dir(p) / "coins.json"
    if out.exists() and not force:
        print(f"skip existing {out}", flush=True)
        return out
    cfg = p.raw["coins"]
    seed = p.eval_seed
    fair_n = int(cfg["fair_count"])
    length = int(cfg["length"])
    sdt_n = int(cfg["sdt_count"])
    t0 = time.monotonic()

    fair_seqs = [
        " ".join(fair_stream(seed, i, length, ("H", "T")))
        for i in range(fair_n)
    ]
    rigged_sets: dict[str, list[str]] = {}
    for mp in cfg["sdt_markov_p"]:
        rigged_sets[f"markov_{mp:.2f}"] = [
            " ".join(rigged_coin_markov(seed, i, length, float(mp)))
            for i in range(sdt_n)
        ]
    for bp in cfg["sdt_bias_p"]:
        rigged_sets[f"bias_{bp:.2f}"] = [
            " ".join(rigged_coin_bias(seed, i, length, float(bp)))
            for i in range(sdt_n)
        ]

    data: dict[str, Any] = {
        "protocol": p.sha,
        "seed": seed,
        "fair_count": fair_n,
        "sdt_count": sdt_n,
        "length": length,
        "models": {},
    }

    for key in cfg["models"]:
        m = p.models[key]
        m_out: dict[str, Any] = {"fair": {}, "rigged": {}}
        print(f"[coins] starting {key} ({m.repo})", flush=True)

        async def _model(
            ms: ModelSpec = m, bucket: dict[str, Any] = m_out
        ) -> None:
            client = LlamaClient(
                f"http://127.0.0.1:{port}", concurrency=parallel
            )
            try:
                for framing in cfg["framings"]:
                    subset = (
                        fair_seqs
                        if framing == "neutral"
                        else fair_seqs[:sdt_n]
                    )
                    t1 = time.monotonic()
                    pf = [
                        prompt_coin(
                            tx, framing=framing, swapped=False, chat=ms.chat
                        )
                        for tx in subset
                    ]
                    pr = [
                        prompt_coin(
                            tx, framing=framing, swapped=True, chat=ms.chat
                        )
                        for tx in subset
                    ]
                    sc, val = await _score_ab_text(client, pf, pr)
                    bucket["fair"][framing] = {
                        "scores": sc,
                        "valid_rate": float(np.mean(val)),
                        "seconds": round(time.monotonic() - t1, 2),
                    }
                    print(
                        f"  [coins] {ms.key} fair/{framing} "
                        f"mean={np.mean(sc):+.2f}±{np.std(sc):.2f} "
                        f"FA={np.mean(np.array(sc) > 0):.1%} "
                        f"({time.monotonic() - t1:.1f}s)",
                        flush=True,
                    )
                for rname, rseqs in rigged_sets.items():
                    t1 = time.monotonic()
                    pf = [
                        prompt_coin(
                            tx, framing="neutral", swapped=False, chat=ms.chat
                        )
                        for tx in rseqs
                    ]
                    pr = [
                        prompt_coin(
                            tx, framing="neutral", swapped=True, chat=ms.chat
                        )
                        for tx in rseqs
                    ]
                    sc, val = await _score_ab_text(client, pf, pr)
                    bucket["rigged"][rname] = {
                        "scores": sc,
                        "valid_rate": float(np.mean(val)),
                        "seconds": round(time.monotonic() - t1, 2),
                    }
                    print(
                        f"  [coins] {ms.key} rigged/{rname} "
                        f"mean={np.mean(sc):+.2f} "
                        f"hit={np.mean(np.array(sc) > 0):.1%} "
                        f"({time.monotonic() - t1:.1f}s)",
                        flush=True,
                    )
            finally:
                await client.aclose()

        with LlamaServer(ServerSpec(m.repo, port=port, parallel=parallel)):
            asyncio.run(_model())
        data["models"][key] = m_out

    data["total_seconds"] = round(time.monotonic() - t0, 2)
    out.write_text(json.dumps(data))
    print(f"[coins] wrote {out} in {data['total_seconds']}s", flush=True)
    return out


async def _score_mirage_stream(
    client: LlamaClient,
    *,
    seed: int,
    s_idx: int,
    length: int,
    alpha: tuple[str, ...],
    parallel: int,
) -> dict[str, Any]:
    syms = fair_stream(seed, s_idx, length, alphabet=alpha)
    echoes = find_ngram_echoes(syms, n=3)
    imap = {s: j for j, s in enumerate(alpha)}
    slot = s_idx % parallel
    probs = np.empty((length, len(alpha)), dtype=np.float64)
    prefix = "Sequence: "
    for t in range(length):
        lp = await client.completion_top_logprobs(
            prefix, n_probs=32, slot_id=slot
        )
        probs[t] = extract_alphabet_probs(lp, alpha)
        prefix = f"{prefix}{syms[t]} "
    kl = kl_to_uniform(probs)
    max_p = np.max(probs, axis=1)
    echo_p = [
        round(float(probs[t, imap[syms[echoes[t]]]]), 4)
        if echoes[t] is not None
        else None
        for t in range(length)
    ]
    rec: dict[str, Any] = {
        "kl": np.round(kl, 5).tolist(),
        "max_p": np.round(max_p, 4).tolist(),
        "echo_p": echo_p,
    }
    if s_idx < 4:
        rec["probs"] = np.round(probs, 4).tolist()
    return rec


async def _run_mirage_model(
    ms: ModelSpec,
    *,
    port: int,
    parallel: int,
    seed: int,
    n_streams: int,
    length: int,
    warm: int,
    alphabets: list[tuple[str, ...]],
) -> dict[str, Any]:
    bucket: dict[str, Any] = {}
    client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
    try:
        for alpha in alphabets:
            akey = "".join(alpha)
            t1 = time.monotonic()
            streams = await asyncio.gather(
                *(
                    _score_mirage_stream(
                        client,
                        seed=seed,
                        s_idx=i,
                        length=length,
                        alpha=alpha,
                        parallel=parallel,
                    )
                    for i in range(n_streams)
                )
            )
            mean_kl = float(np.mean([s["kl"][warm:] for s in streams]))
            mean_mp = float(np.mean([s["max_p"][warm:] for s in streams]))
            bucket[akey] = {
                "streams": streams,
                "seconds": round(time.monotonic() - t1, 2),
            }
            print(
                f"  [mirage] {ms.key} {akey} "
                f"KL={mean_kl:.3f} maxP={mean_mp:.3f} "
                f"({time.monotonic() - t1:.1f}s)",
                flush=True,
            )
    finally:
        await client.aclose()
    return bucket


def run_mirage_suite(
    p: Protocol,
    *,
    port: int = 8091,
    parallel: int = 8,
    force: bool = False,
) -> Path:
    out = run_dir(p) / "mirage.json"
    if out.exists() and not force:
        print(f"skip existing {out}", flush=True)
        return out
    cfg = p.raw["mirage"]
    seed = p.eval_seed
    n_streams = int(cfg["streams"])
    length = int(cfg["length"])
    warm = int(cfg["warmup"])
    alpha_prior = float(cfg["dirichlet_alpha"])
    t0 = time.monotonic()

    data: dict[str, Any] = {
        "protocol": p.sha,
        "seed": seed,
        "streams": n_streams,
        "length": length,
        "warmup": warm,
        "bayes": {},
        "models": {},
    }

    alphabets = [tuple(a) for a in cfg["alphabets"]]
    for alpha in alphabets:
        akey = "".join(alpha)
        b_streams = []
        for s_idx in range(n_streams):
            syms = fair_stream(seed, s_idx, length, alphabet=alpha)
            b_probs = bayesian_dirichlet_probs(syms, alpha, alpha=alpha_prior)
            b_kl = kl_to_uniform(b_probs)
            b_streams.append(np.round(b_kl, 5).tolist())
        data["bayes"][akey] = b_streams

    for key in cfg["models"]:
        m = p.models[key]
        print(f"[mirage] starting {key} ({m.repo})", flush=True)
        with LlamaServer(ServerSpec(m.repo, port=port, parallel=parallel)):
            data["models"][key] = asyncio.run(
                _run_mirage_model(
                    m,
                    port=port,
                    parallel=parallel,
                    seed=seed,
                    n_streams=n_streams,
                    length=length,
                    warm=warm,
                    alphabets=alphabets,
                )
            )

    data["total_seconds"] = round(time.monotonic() - t0, 2)
    out.write_text(json.dumps(data))
    print(f"[mirage] wrote {out} in {data['total_seconds']}s", flush=True)
    return out


def run_all(
    *,
    suites: tuple[str, ...] = ("ascii", "vision", "coins", "mirage"),
    force: bool = False,
) -> list[Path]:
    p = load()
    runners = {
        "ascii": run_ascii_suite,
        "vision": run_vision_suite,
        "coins": run_coins_suite,
        "mirage": run_mirage_suite,
    }
    return [runners[name](p, force=force) for name in suites]
