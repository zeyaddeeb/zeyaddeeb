from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict
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
    pearson_r,
    split_half_stats,
)
from ghosts.stimuli import (
    ascii_heatmap,
    fair_stream,
    noise_grid,
    noise_multiscale,
    noise_patch,
    patch_to_png_data_url,
    render_ascii,
)

A_TOKS = ("A", " A")
B_TOKS = ("B", " B")


def ascii_prompt_ab(
    grid_text: str,
    target: str,
    *,
    swapped: bool = False,
    instruct: bool = True,
) -> str:
    if swapped:
        opts = f"A) pure random static\nB) a hidden {target}"
    else:
        opts = f"A) a hidden {target}\nB) pure random static"
    body = (
        f"Inspect this ASCII grid of '.' (dark) and '#' (bright) pixels.\n"
        f"Half of grids are pure random static; half contain a faint "
        f"{target}.\n"
        f"{opts}\n\n"
        f"{grid_text}\n\n"
        f"Reply with a single letter (A or B)."
    )
    if instruct:
        return (
            "<|im_start|>system\n"
            "You are a careful visual psychophysics observer. "
            "Answer with only A or B.<|im_end|>\n"
            f"<|im_start|>user\n{body}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
    return f"{body}\nAnswer: "


def vlm_prompt_ab(target: str, *, swapped: bool = False) -> str:
    if swapped:
        opts = f"A) pure random static\nB) a faint {target}"
    else:
        opts = f"A) a faint {target}\nB) pure random static"
    return (
        f"Look closely at this noisy grayscale image. "
        f"Half of images are pure random static and half contain a faint "
        f"{target}.\n"
        f"Which is this?\n{opts}\n"
        f"Answer with only the single letter A or B."
    )


async def score_ascii_batch(
    client: LlamaClient,
    *,
    seed: int,
    count: int,
    size: int,
    target: str,
    spaced: bool,
    instruct: bool,
    counterbalance: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    stimuli = np.stack([noise_grid(seed, i, size) for i in range(count)])
    scores = np.empty(count, dtype=np.float64)
    valid = np.empty(count, dtype=bool)

    async def one(i: int) -> tuple[int, float, bool]:
        text = render_ascii(stimuli[i], spaced=spaced)
        p1 = ascii_prompt_ab(text, target, swapped=False, instruct=instruct)
        lp1 = await client.completion_top_logprobs(p1)
        s1, ok1 = extract_log_odds(lp1, A_TOKS, B_TOKS)
        if not counterbalance:
            return i, s1, ok1
        p2 = ascii_prompt_ab(text, target, swapped=True, instruct=instruct)
        lp2 = await client.completion_top_logprobs(p2)
        s2, ok2 = extract_log_odds(lp2, B_TOKS, A_TOKS)
        return i, 0.5 * (s1 + s2), ok1 and ok2

    tasks = [asyncio.create_task(one(i)) for i in range(count)]
    for fut in asyncio.as_completed(tasks):
        idx, sc, ok = await fut
        scores[idx] = sc
        valid[idx] = ok
    return stimuli, scores, valid


async def score_vlm_batch(
    client: LlamaClient,
    *,
    seed: int,
    count: int,
    size: int,
    scale: int,
    target: str,
    counterbalance: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    stimuli = np.stack([noise_patch(seed, i, size) for i in range(count)])
    scores = np.empty(count, dtype=np.float64)
    valid = np.empty(count, dtype=bool)
    system = "You are a visual psychophysics observer. Reply with only A or B."
    prompt_fwd = vlm_prompt_ab(target, swapped=False)
    prompt_rev = vlm_prompt_ab(target, swapped=True)

    async def one(i: int) -> tuple[int, float, bool]:
        url = patch_to_png_data_url(stimuli[i], scale=scale)
        lp1 = await client.chat_image_top_logprobs(
            url, prompt_fwd, system=system
        )
        s1, ok1 = extract_log_odds(lp1, A_TOKS, B_TOKS)
        if not counterbalance:
            return i, s1, ok1
        lp2 = await client.chat_image_top_logprobs(
            url, prompt_rev, system=system
        )
        s2, ok2 = extract_log_odds(lp2, B_TOKS, A_TOKS)
        return i, 0.5 * (s1 + s2), ok1 and ok2

    tasks = [asyncio.create_task(one(i)) for i in range(count)]
    for fut in asyncio.as_completed(tasks):
        idx, sc, ok = await fut
        scores[idx] = sc
        valid[idx] = ok
    return stimuli, scores, valid


async def score_mirage_streams(
    client: LlamaClient,
    *,
    seed: int,
    n_streams: int,
    length: int,
    alphabet: tuple[str, ...],
) -> dict[str, Any]:
    echo_kls: list[float] = []
    non_echo_kls: list[float] = []
    bayes_kls: list[float] = []
    all_kls: list[float] = []

    async def one_stream(
        s_idx: int,
    ) -> tuple[list[float], list[float], list[int | None]]:
        syms = fair_stream(seed, s_idx, length, alphabet=alphabet)
        bayes = kl_to_uniform(bayesian_dirichlet_probs(syms, alphabet))
        echoes = find_ngram_echoes(syms, n=3)
        slot = s_idx % 8
        llm_probs = np.empty((length, len(alphabet)), dtype=np.float64)
        prefix = "Sequence: "
        for t in range(length):
            lp = await client.completion_top_logprobs(
                prefix, n_probs=32, slot_id=slot
            )
            llm_probs[t] = extract_alphabet_probs(lp, alphabet)
            prefix = f"{prefix}{syms[t]} "
        llm_kl = kl_to_uniform(llm_probs)
        return llm_kl.tolist(), bayes.tolist(), echoes

    results = await asyncio.gather(*(one_stream(i) for i in range(n_streams)))
    for llm_kl, b_kl, echoes in results:
        for t in range(16, length):
            all_kls.append(llm_kl[t])
            bayes_kls.append(b_kl[t])
            if echoes[t] is not None:
                echo_kls.append(llm_kl[t])
            else:
                non_echo_kls.append(llm_kl[t])

    return {
        "n_streams": n_streams,
        "length": length,
        "alphabet": list(alphabet),
        "mean_kl_all": float(np.mean(all_kls)),
        "mean_kl_bayes": float(np.mean(bayes_kls)),
        "mean_kl_echo": float(np.mean(echo_kls)) if echo_kls else 0.0,
        "mean_kl_non_echo": float(np.mean(non_echo_kls))
        if non_echo_kls
        else 0.0,
        "n_echo_positions": len(echo_kls),
        "n_non_echo_positions": len(non_echo_kls),
    }


def run_ascii_screen(
    hf_repo: str,
    *,
    instruct: bool,
    count: int = 400,
    size: int = 9,
    targets: tuple[str, ...] = ("face", "letter X", "zorp"),
    seed: int = 0,
    port: int = 8089,
    parallel: int = 8,
    out_path: Path | None = None,
) -> dict[str, Any]:
    spec = ServerSpec(hf_repo=hf_repo, port=port, parallel=parallel)
    t0 = time.monotonic()
    conditions: dict[str, Any] = {}
    summary: dict[str, Any] = {
        "hf_repo": hf_repo,
        "instruct": instruct,
        "count": count,
        "size": size,
        "seed": seed,
        "conditions": conditions,
    }
    ghosts_by_key: dict[str, np.ndarray] = {}

    async def _run() -> None:
        client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
        try:
            for spaced in (False, True):
                enc = "spaced" if spaced else "packed"
                for target in targets:
                    key = f"{enc}/{target}"
                    t1 = time.monotonic()
                    stim, sc, val = await score_ascii_batch(
                        client,
                        seed=seed,
                        count=count,
                        size=size,
                        target=target,
                        spaced=spaced,
                        instruct=instruct,
                    )
                    full, _, _, st = split_half_stats(
                        stim, sc, permutations=1000, seed=seed, valid_mask=val
                    )
                    dt = time.monotonic() - t1
                    ghosts_by_key[key] = full
                    conditions[key] = {
                        **asdict(st),
                        "seconds": round(dt, 2),
                        "ghost": np.round(full, 4).tolist(),
                    }
                    print(
                        f"\n=== {hf_repo} [{key}] "
                        f"r={st.split_r:+.3f} (p={st.perm_p:.4f}, "
                        f"p95={st.perm_p95:+.3f}) "
                        f"valid={st.valid_rate:.2%} "
                        f"mean={st.score_mean:+.2f}±{st.score_std:.2f} "
                        f"({dt:.1f}s) ===",
                        flush=True,
                    )
                    print(ascii_heatmap(full), flush=True)
        finally:
            await client.aclose()

    with LlamaServer(spec):
        asyncio.run(_run())

    cross: dict[str, float] = {}
    keys = list(ghosts_by_key)
    for i, k1 in enumerate(keys):
        for k2 in keys[i + 1 :]:
            cross[f"{k1} vs {k2}"] = round(
                pearson_r(ghosts_by_key[k1], ghosts_by_key[k2]), 4
            )
    summary["cross_r"] = cross
    summary["total_seconds"] = round(time.monotonic() - t0, 2)
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, indent=2))
    return summary


def run_vlm_screen(
    hf_repo: str,
    *,
    count: int = 400,
    size: int = 12,
    scale: int = 10,
    targets: tuple[str, ...] = ("human face", "letter X", "zorp"),
    seed: int = 0,
    port: int = 8090,
    parallel: int = 4,
    out_path: Path | None = None,
) -> dict[str, Any]:
    spec = ServerSpec(
        hf_repo=hf_repo,
        port=port,
        parallel=parallel,
        ctx_size=4096,
        vision=True,
    )
    t0 = time.monotonic()
    conditions: dict[str, Any] = {}
    summary: dict[str, Any] = {
        "hf_repo": hf_repo,
        "count": count,
        "size": size,
        "scale": scale,
        "seed": seed,
        "conditions": conditions,
    }
    ghosts_by_key: dict[str, np.ndarray] = {}

    async def _run() -> None:
        client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
        try:
            for target in targets:
                t1 = time.monotonic()
                stim, sc, val = await score_vlm_batch(
                    client,
                    seed=seed,
                    count=count,
                    size=size,
                    scale=scale,
                    target=target,
                    counterbalance=False,
                )
                full, _, _, st = split_half_stats(
                    stim, sc, permutations=1000, seed=seed, valid_mask=val
                )
                dt = time.monotonic() - t1
                ghosts_by_key[target] = full
                conditions[target] = {
                    **asdict(st),
                    "seconds": round(dt, 2),
                    "ghost": np.round(full, 4).tolist(),
                }
                print(
                    f"\n=== VLM {hf_repo} [{target}] "
                    f"r={st.split_r:+.3f} (p={st.perm_p:.4f}, "
                    f"p95={st.perm_p95:+.3f}) "
                    f"valid={st.valid_rate:.2%} "
                    f"mean={st.score_mean:+.2f}±{st.score_std:.2f} "
                    f"({dt:.1f}s) ===",
                    flush=True,
                )
                print(ascii_heatmap(full), flush=True)
        finally:
            await client.aclose()

    with LlamaServer(spec):
        asyncio.run(_run())

    cross: dict[str, float] = {}
    keys = list(ghosts_by_key)
    for i, k1 in enumerate(keys):
        for k2 in keys[i + 1 :]:
            cross[f"{k1} vs {k2}"] = round(
                pearson_r(ghosts_by_key[k1], ghosts_by_key[k2]), 4
            )
    summary["cross_r"] = cross
    summary["total_seconds"] = round(time.monotonic() - t0, 2)
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, indent=2))
    return summary


def vlm_prompt_pair(
    opt_a: str,
    opt_b: str,
    *,
    swapped: bool = False,
) -> str:
    first, second = (opt_b, opt_a) if swapped else (opt_a, opt_b)
    return (
        f"This noisy grayscale cloud image contains a faint hidden shape.\n"
        f"Which does it look more like?\n"
        f"A) {first}\n"
        f"B) {second}\n"
        f"Answer with only the single letter A or B."
    )


def ascii_prompt_pair(
    grid_text: str,
    opt_a: str,
    opt_b: str,
    *,
    swapped: bool = False,
    instruct: bool = True,
) -> str:
    first, second = (opt_b, opt_a) if swapped else (opt_a, opt_b)
    body = (
        f"This ASCII grid of '.' (dark) and '#' (bright) pixels contains a "
        f"faint hidden shape.\n"
        f"Which does it look more like?\n"
        f"A) {first}\n"
        f"B) {second}\n\n"
        f"{grid_text}\n\n"
        f"Reply with a single letter (A or B)."
    )
    if instruct:
        return (
            "<|im_start|>system\n"
            "You are a careful visual psychophysics observer. "
            "Answer with only A or B.<|im_end|>\n"
            f"<|im_start|>user\n{body}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
    return f"{body}\nAnswer: "


async def score_vlm_pair(
    client: LlamaClient,
    *,
    seed: int,
    count: int,
    size: int,
    scale: int,
    opt_a: str,
    opt_b: str,
    counterbalance: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    stimuli = np.stack([noise_multiscale(seed, i, size) for i in range(count)])
    scores = np.empty(count, dtype=np.float64)
    valid = np.empty(count, dtype=bool)
    system = "You are a visual psychophysics observer. Reply with only A or B."
    p_fwd = vlm_prompt_pair(opt_a, opt_b, swapped=False)
    p_rev = vlm_prompt_pair(opt_a, opt_b, swapped=True)

    async def one(i: int) -> tuple[int, float, bool]:
        url = patch_to_png_data_url(stimuli[i], scale=scale, smooth=True)
        lp1 = await client.chat_image_top_logprobs(url, p_fwd, system=system)
        s1, ok1 = extract_log_odds(lp1, A_TOKS, B_TOKS)
        if not counterbalance:
            return i, s1, ok1
        lp2 = await client.chat_image_top_logprobs(url, p_rev, system=system)
        s2, ok2 = extract_log_odds(lp2, B_TOKS, A_TOKS)
        return i, 0.5 * (s1 + s2), ok1 and ok2

    tasks = [asyncio.create_task(one(i)) for i in range(count)]
    for fut in asyncio.as_completed(tasks):
        idx, sc, ok = await fut
        scores[idx] = sc
        valid[idx] = ok
    return stimuli, scores, valid


async def score_ascii_pair(
    client: LlamaClient,
    *,
    seed: int,
    count: int,
    size: int,
    opt_a: str,
    opt_b: str,
    spaced: bool,
    instruct: bool,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    stimuli = np.stack([noise_grid(seed, i, size) for i in range(count)])
    scores = np.empty(count, dtype=np.float64)
    valid = np.empty(count, dtype=bool)

    async def one(i: int) -> tuple[int, float, bool]:
        text = render_ascii(stimuli[i], spaced=spaced)
        p1 = ascii_prompt_pair(
            text, opt_a, opt_b, swapped=False, instruct=instruct
        )
        lp1 = await client.completion_top_logprobs(p1)
        s1, ok1 = extract_log_odds(lp1, A_TOKS, B_TOKS)
        p2 = ascii_prompt_pair(
            text, opt_a, opt_b, swapped=True, instruct=instruct
        )
        lp2 = await client.completion_top_logprobs(p2)
        s2, ok2 = extract_log_odds(lp2, B_TOKS, A_TOKS)
        return i, 0.5 * (s1 + s2), ok1 and ok2

    tasks = [asyncio.create_task(one(i)) for i in range(count)]
    for fut in asyncio.as_completed(tasks):
        idx, sc, ok = await fut
        scores[idx] = sc
        valid[idx] = ok
    return stimuli, scores, valid


def run_vlm_2afc_screen(
    hf_repo: str,
    *,
    count: int = 600,
    size: int = 32,
    scale: int = 7,
    pairs: tuple[tuple[str, str], ...] = (
        ("a human face", "a horizontal bar"),
        ("the letter X", "the letter O"),
        ("a zorp", "a blarg"),
    ),
    seed: int = 0,
    port: int = 8090,
    parallel: int = 4,
    out_path: Path | None = None,
) -> dict[str, Any]:
    spec = ServerSpec(
        hf_repo=hf_repo,
        port=port,
        parallel=parallel,
        ctx_size=4096,
        vision=True,
    )
    t0 = time.monotonic()
    conditions: dict[str, Any] = {}
    summary: dict[str, Any] = {
        "hf_repo": hf_repo,
        "count": count,
        "size": size,
        "scale": scale,
        "seed": seed,
        "conditions": conditions,
    }
    ghosts_by_key: dict[str, np.ndarray] = {}

    async def _run() -> None:
        client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
        try:
            for opt_a, opt_b in pairs:
                key = f"{opt_a} vs {opt_b}"
                t1 = time.monotonic()
                stim, sc, val = await score_vlm_pair(
                    client,
                    seed=seed,
                    count=count,
                    size=size,
                    scale=scale,
                    opt_a=opt_a,
                    opt_b=opt_b,
                    counterbalance=False,
                )
                full, _, _, st = split_half_stats(
                    stim, sc, permutations=1000, seed=seed, valid_mask=val
                )
                dt = time.monotonic() - t1
                ghosts_by_key[key] = full
                down = full.reshape(16, 2, 16, 2).mean(axis=(1, 3))
                conditions[key] = {
                    **asdict(st),
                    "seconds": round(dt, 2),
                    "ghost": np.round(full, 4).tolist(),
                }
                print(
                    f"\n=== VLM 2AFC [{key}] "
                    f"r={st.split_r:+.3f} (p={st.perm_p:.4f}, "
                    f"p95={st.perm_p95:+.3f}) "
                    f"valid={st.valid_rate:.2%} "
                    f"mean={st.score_mean:+.2f}±{st.score_std:.2f} "
                    f"({dt:.1f}s) ===",
                    flush=True,
                )
                print(ascii_heatmap(down), flush=True)
        finally:
            await client.aclose()

    with LlamaServer(spec):
        asyncio.run(_run())

    cross: dict[str, float] = {}
    keys = list(ghosts_by_key)
    for i, k1 in enumerate(keys):
        for k2 in keys[i + 1 :]:
            cross[f"{k1} | {k2}"] = round(
                pearson_r(ghosts_by_key[k1], ghosts_by_key[k2]), 4
            )
    summary["cross_r"] = cross
    summary["total_seconds"] = round(time.monotonic() - t0, 2)
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, indent=2))
    return summary


def run_ascii_2afc_screen(
    hf_repo: str,
    *,
    instruct: bool,
    count: int = 400,
    size: int = 9,
    pairs: tuple[tuple[str, str], ...] = (
        ("a smiley face", "the letter X"),
        ("a vertical stripe", "a horizontal stripe"),
        ("a zorp", "a blarg"),
    ),
    seed: int = 0,
    port: int = 8089,
    parallel: int = 8,
    out_path: Path | None = None,
) -> dict[str, Any]:
    spec = ServerSpec(hf_repo=hf_repo, port=port, parallel=parallel)
    t0 = time.monotonic()
    conditions: dict[str, Any] = {}
    summary: dict[str, Any] = {
        "hf_repo": hf_repo,
        "instruct": instruct,
        "count": count,
        "size": size,
        "seed": seed,
        "conditions": conditions,
    }
    ghosts_by_key: dict[str, np.ndarray] = {}

    async def _run() -> None:
        client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
        try:
            for spaced in (False, True):
                enc = "spaced" if spaced else "packed"
                for opt_a, opt_b in pairs:
                    key = f"{enc}/{opt_a} vs {opt_b}"
                    t1 = time.monotonic()
                    stim, sc, val = await score_ascii_pair(
                        client,
                        seed=seed,
                        count=count,
                        size=size,
                        opt_a=opt_a,
                        opt_b=opt_b,
                        spaced=spaced,
                        instruct=instruct,
                    )
                    full, _, _, st = split_half_stats(
                        stim, sc, permutations=1000, seed=seed, valid_mask=val
                    )
                    dt = time.monotonic() - t1
                    ghosts_by_key[key] = full
                    conditions[key] = {
                        **asdict(st),
                        "seconds": round(dt, 2),
                        "ghost": np.round(full, 4).tolist(),
                    }
                    print(
                        f"\n=== ASCII 2AFC [{key}] "
                        f"r={st.split_r:+.3f} (p={st.perm_p:.4f}, "
                        f"p95={st.perm_p95:+.3f}) "
                        f"valid={st.valid_rate:.2%} "
                        f"mean={st.score_mean:+.2f}±{st.score_std:.2f} "
                        f"({dt:.1f}s) ===",
                        flush=True,
                    )
                    print(ascii_heatmap(full), flush=True)
        finally:
            await client.aclose()

    with LlamaServer(spec):
        asyncio.run(_run())

    cross: dict[str, float] = {}
    keys = list(ghosts_by_key)
    for i, k1 in enumerate(keys):
        for k2 in keys[i + 1 :]:
            cross[f"{k1} | {k2}"] = round(
                pearson_r(ghosts_by_key[k1], ghosts_by_key[k2]), 4
            )
    summary["cross_r"] = cross
    summary["total_seconds"] = round(time.monotonic() - t0, 2)
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, indent=2))
    return summary


def run_mirage_screen(
    hf_repo: str,
    *,
    n_streams: int = 16,
    length: int = 128,
    seed: int = 0,
    port: int = 8091,
    parallel: int = 8,
    out_path: Path | None = None,
) -> dict[str, Any]:
    spec = ServerSpec(hf_repo=hf_repo, port=port, parallel=parallel)
    t0 = time.monotonic()

    async def _run() -> dict[str, Any]:
        client = LlamaClient(f"http://127.0.0.1:{port}", concurrency=parallel)
        try:
            coins = await score_mirage_streams(
                client,
                seed=seed,
                n_streams=n_streams,
                length=length,
                alphabet=("H", "T"),
            )
            quad = await score_mirage_streams(
                client,
                seed=seed,
                n_streams=n_streams,
                length=length,
                alphabet=("A", "B", "C", "D"),
            )
            return {"hf_repo": hf_repo, "coins": coins, "quad": quad}
        finally:
            await client.aclose()

    with LlamaServer(spec):
        result = asyncio.run(_run())

    result["total_seconds"] = round(time.monotonic() - t0, 2)
    print(json.dumps(result, indent=2), flush=True)
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, indent=2))
    return result
