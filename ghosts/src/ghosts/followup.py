from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch

from ghosts.coinstudy import (
    pooled,
    protocol,
    score_checkpoint,
    stated_body,
    stimulus_groups,
    summarize_checkpoint,
)
from ghosts.diagnostics import (
    coin_diagnostic_features,
    feature_profile,
    multi_partial_r,
    wording_framing_matrix,
)
from ghosts.jsonfmt import dumps
from ghosts.lm import LocalLM
from ghosts.protocol import ROOT, ModelSpec

DEFAULT_RAW_MODELS = ("qwen_instruct", "olmo3_instruct", "olmo3_think")
DEFAULT_SCALE_BASE = "Qwen/Qwen2.5-7B"
DEFAULT_SCALE_POST = "Qwen/Qwen2.5-7B-Instruct"
ANSWER_RE = re.compile(r"\b([AB])\b")


def followup_dir(sha: str | None = None) -> Path:
    tag = (sha or protocol().sha)[:12]
    d = ROOT / "runs" / f"followup-{tag}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_followups(sha: str | None = None) -> dict[str, Any]:
    root = ROOT / "runs" / f"followup-{(sha or protocol().sha)[:12]}"
    out: dict[str, Any] = {}
    for name in ("raw_text", "cot", "scale"):
        summary = root / f"{name}.summary.json"
        if summary.exists():
            out[name] = json.loads(summary.read_text())
    return out


def parse_choice(text: str) -> str | None:
    cleaned = text.strip()
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>", 1)[1].strip()
    if cleaned in {"A", "B"}:
        return cleaned
    first_line = cleaned.splitlines()[0].strip() if cleaned else ""
    if first_line in {"A", "B", "A)", "B)", "A.", "B."}:
        return first_line[0]
    matches = ANSWER_RE.findall(cleaned)
    return matches[-1] if matches else None


def run_raw_text_ablation(
    *,
    models: tuple[str, ...] = DEFAULT_RAW_MODELS,
    seed: int | None = None,
    batch: int = 64,
) -> Path:
    p = protocol()
    use_seed = p.eval_seed if seed is None else seed
    stim = stimulus_groups(p, use_seed)
    feats = coin_diagnostic_features(stim["groups"]["fair"])
    out_dir = followup_dir(p.sha) / "raw_text"
    out_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "kind": "raw_text_ablation",
        "post_hoc": True,
        "protocol": p.sha,
        "seed": use_seed,
        "checkpoints": {},
    }
    rng = np.random.default_rng(use_seed + 41)

    for key in models:
        spec: ModelSpec = p.models[key]
        target = out_dir / f"{key}.json"
        if target.exists():
            scored = json.loads(target.read_text())
        else:
            t0 = time.monotonic()
            lm = LocalLM(
                spec.repo,
                revision=spec.revision,
                chat=False,
                batch=batch,
                answer_prefix="",
            )
            try:
                scored = score_checkpoint(lm, p, stim["groups"])
            finally:
                lm.close()
            scored["seconds"] = round(time.monotonic() - t0, 1)
            scored["protocol"] = p.sha
            scored["seed"] = use_seed
            scored["chat_override"] = "none"
            target.write_text(dumps(scored))
            print(f"wrote {target} in {scored['seconds']}s", flush=True)

        ck = summarize_checkpoint(scored, stim, rng, p.bootstrap)
        says = pooled(scored["stated"], "fair")
        expects = pooled(scored["implicit"], "fair")
        twin = pooled(scored["nonsense"], "fair")
        prof = feature_profile(says, expects, twin, feats)
        summary["checkpoints"][key] = {
            "usable": sum(w["ok"] for w in ck["per_wording"].values()),
            "per_wording": ck["per_wording"],
            "stated_template": ck["stated_template"],
            "implicit_template": ck["implicit_template"],
            "stated_vs_implicit": ck["stated_vs_implicit"],
            "ab_mass_median": ck["ab_mass_median"],
            "diagnostics": prof,
            "wording_framing": wording_framing_matrix(scored, feats),
        }

    summary_path = followup_dir(p.sha) / "raw_text.summary.json"
    summary_path.write_text(dumps(summary))
    print(f"wrote {summary_path}", flush=True)
    return summary_path


@torch.inference_mode()
def _generate_one(
    lm: LocalLM,
    body: str,
    *,
    max_new_tokens: int,
) -> str:
    prompt = lm.tok.apply_chat_template(
        [
            {
                "role": "system",
                "content": (
                    "Think briefly if needed, then end your reply with a "
                    "single letter: A or B."
                ),
            },
            {"role": "user", "content": body},
        ],
        add_generation_prompt=True,
        tokenize=False,
    )
    enc = lm.tok(prompt, return_tensors="pt", add_special_tokens=False).to(
        lm.device
    )
    out = lm.model.generate(
        **enc,
        do_sample=False,
        max_new_tokens=max_new_tokens,
        pad_token_id=lm.tok.pad_token_id,
    )
    gen = out[0, enc["input_ids"].shape[1] :]
    return lm.tok.decode(gen, skip_special_tokens=False)


def run_think_cot_sample(
    *,
    model_key: str = "olmo3_think",
    wording: str = "w1",
    count: int = 100,
    max_new_tokens: int = 512,
    seed: int | None = None,
) -> Path:
    p = protocol()
    use_seed = p.eval_seed if seed is None else seed
    stim = stimulus_groups(p, use_seed)
    fair = stim["groups"]["fair"][:count]
    feats = coin_diagnostic_features(fair)
    w = p.raw["wordings"]["stated"][wording]
    spec: ModelSpec = p.models[model_key]

    lm = LocalLM(
        spec.repo,
        revision=spec.revision,
        chat=True,
        batch=16,
        answer_prefix="",
    )
    records: list[dict[str, Any]] = []
    t0 = time.monotonic()
    try:
        for i, seq in enumerate(fair):
            text = " ".join(seq)
            fwd = _generate_one(
                lm,
                stated_body(w, text, swapped=False),
                max_new_tokens=max_new_tokens,
            )
            rev = _generate_one(
                lm,
                stated_body(w, text, swapped=True),
                max_new_tokens=max_new_tokens,
            )
            cf, cr = parse_choice(fwd), parse_choice(rev)
            score = None
            if cf is not None and cr is not None:
                vf = 1.0 if cf == "A" else -1.0
                vr = 1.0 if cr == "B" else -1.0
                score = 0.5 * (vf + vr)
            records.append(
                {
                    "index": i,
                    "fwd_choice": cf,
                    "rev_choice": cr,
                    "score": score,
                    "fwd_chars": len(fwd),
                    "rev_chars": len(rev),
                    "fwd_closed": "</think>" in fwd,
                    "rev_closed": "</think>" in rev,
                }
            )
            if (i + 1) % 10 == 0:
                print(f"  [cot {model_key}] {i + 1}/{len(fair)}", flush=True)
    finally:
        lm.close()

    valid_ix = [i for i, r in enumerate(records) if r["score"] is not None]
    scores = np.array(
        [records[i]["score"] for i in valid_ix], dtype=np.float64
    )
    sw = feats["switches"][valid_ix]
    ht = [feats["first_h"][valid_ix], feats["h_frac"][valid_ix]]
    template = (
        float(np.corrcoef(scores, sw)[0, 1]) if len(valid_ix) > 2 else 0.0
    )
    template_ht = multi_partial_r(scores, sw, ht) if len(valid_ix) > 4 else 0.0

    out_dir = followup_dir(p.sha) / "cot"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{model_key}-{wording}.json").write_text(
        dumps({"records": records})
    )
    summary = {
        "kind": "think_cot_sample",
        "post_hoc": True,
        "protocol": p.sha,
        "seed": use_seed,
        "model": model_key,
        "wording": wording,
        "count": len(fair),
        "max_new_tokens": max_new_tokens,
        "parsed_both": len(valid_ix),
        "parse_rate": round(len(valid_ix) / max(len(fair), 1), 4),
        "closed_rate": round(
            float(
                np.mean([r["fwd_closed"] and r["rev_closed"] for r in records])
            ),
            4,
        ),
        "median_chars": int(
            np.median(
                [0.5 * (r["fwd_chars"] + r["rev_chars"]) for r in records]
            )
        ),
        "mean_score": round(float(np.mean(scores)), 4) if len(scores) else 0.0,
        "template_switches": round(template, 4),
        "template_switches_ht": round(template_ht, 4),
        "seconds": round(time.monotonic() - t0, 1),
    }
    summary_path = followup_dir(p.sha) / "cot.summary.json"
    summary_path.write_text(dumps(summary))
    print(f"wrote {summary_path}", flush=True)
    return summary_path


def run_scale_check(
    *,
    base_repo: str = DEFAULT_SCALE_BASE,
    post_repo: str = DEFAULT_SCALE_POST,
    base_revision: str | None = None,
    post_revision: str | None = None,
    label: str = "Qwen2.5 7B",
    seed: int | None = None,
    batch: int = 32,
) -> Path:
    p = protocol()
    use_seed = p.eval_seed if seed is None else seed
    stim = stimulus_groups(p, use_seed)
    feats = coin_diagnostic_features(stim["groups"]["fair"])
    out_dir = followup_dir(p.sha) / "scale"
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(use_seed + 53)

    specs = (
        ("base", base_repo, base_revision, False),
        ("post", post_repo, post_revision, True),
    )
    raws: dict[str, dict[str, Any]] = {}
    checkpoints: dict[str, Any] = {}
    for role, repo, rev, chat in specs:
        target = out_dir / f"{role}.json"
        if target.exists():
            scored = json.loads(target.read_text())
        else:
            t0 = time.monotonic()
            lm = LocalLM(repo, revision=rev, chat=chat, batch=batch)
            try:
                scored = score_checkpoint(lm, p, stim["groups"])
            finally:
                lm.close()
            scored["seconds"] = round(time.monotonic() - t0, 1)
            scored["repo"] = repo
            scored["revision"] = rev
            scored["protocol"] = p.sha
            scored["seed"] = use_seed
            target.write_text(dumps(scored))
            print(f"wrote {target} in {scored['seconds']}s", flush=True)
        raws[role] = scored
        ck = summarize_checkpoint(scored, stim, rng, p.bootstrap)
        says = pooled(scored["stated"], "fair")
        expects = pooled(scored["implicit"], "fair")
        twin = pooled(scored["nonsense"], "fair")
        checkpoints[role] = {
            "repo": repo,
            "revision": rev,
            "usable": sum(w["ok"] for w in ck["per_wording"].values()),
            "stated_template": ck["stated_template"],
            "implicit_template": ck["implicit_template"],
            "stated_vs_implicit": ck["stated_vs_implicit"],
            "alternation_fair": ck["alternation_fair"],
            "alternation_log": ck["alternation_log"],
            "coin_specific": ck["coin_specific"],
            "ab_mass_median": ck["ab_mass_median"],
            "diagnostics": feature_profile(says, expects, twin, feats),
            "wording_framing": wording_framing_matrix(scored, feats),
        }

    summary = {
        "kind": "scale_check",
        "post_hoc": True,
        "protocol": p.sha,
        "seed": use_seed,
        "label": label,
        "checkpoints": checkpoints,
    }
    summary_path = followup_dir(p.sha) / "scale.summary.json"
    summary_path.write_text(dumps(summary))
    print(f"wrote {summary_path}", flush=True)
    return summary_path
