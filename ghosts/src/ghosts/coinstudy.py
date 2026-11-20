from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.lm import LocalLM
from ghosts.protocol import ROOT, ModelSpec, Protocol, load
from ghosts.randomness import build_sets
from ghosts.stimuli import coin_features

PROTOCOL = ROOT / "randomness.toml"
REPLY = "Reply with a single letter (A or B)."


def protocol() -> Protocol:
    return load(PROTOCOL)


def stated_body(w: dict[str, str], seq: str, *, swapped: bool) -> str:
    first, second = (
        (w["fair"], w["rigged"]) if swapped else (w["rigged"], w["fair"])
    )
    return (
        f"{w['lead']}\n{seq}\n\n{w['question']}\n"
        f"A) {first}\nB) {second}\n{REPLY}"
    )


def nonsense_body(
    lead: str,
    n: dict[str, str],
    seq: str,
    *,
    swapped: bool,
) -> str:
    first, second = (
        (n["second"], n["first"]) if swapped else (n["first"], n["second"])
    )
    return (
        f"{lead}\n{seq}\n\n{n['question']}\nA) {first}\nB) {second}\n{REPLY}"
    )


def stimulus_groups(p: Protocol, seed: int) -> dict[str, Any]:
    s = p.raw["stimuli"]
    sets = build_sets(
        seed,
        fair=int(s["fair_count"]),
        per_k=int(s["strata_per_k"]),
        rigged=int(s["rigged_count"]),
    )
    groups = {"fair": sets["fair"], "strata": sets["strata"]}
    for name, seqs in sets["rigged"].items():
        groups[f"rigged:{name}"] = seqs
    return {"groups": groups, "strata_k": sets["strata_k"]}


def score_checkpoint(
    lm: LocalLM,
    p: Protocol,
    groups: dict[str, list[list[str]]],
) -> dict[str, Any]:
    words = p.raw["wordings"]
    out: dict[str, Any] = {
        "stated": {},
        "nonsense": {},
        "implicit": {},
        "alternation": {},
        "ab_mass": {},
    }
    for name, seqs in groups.items():
        texts = [" ".join(s) for s in seqs]
        twin = not name.startswith("rigged:")
        for wid, w in words["stated"].items():
            n = words["nonsense"][wid]
            rows = []
            for t in texts:
                row = [
                    stated_body(w, t, swapped=False),
                    stated_body(w, t, swapped=True),
                ]
                if twin:
                    row += [
                        nonsense_body(w["lead"], n, t, swapped=False),
                        nonsense_body(w["lead"], n, t, swapped=True),
                    ]
                rows.append(row)
            odds, mass = lm.variant_log_odds(rows)
            out["stated"].setdefault(wid, {})[name] = (
                (0.5 * (odds[:, 0] - odds[:, 1])).round(6).tolist()
            )
            out["ab_mass"].setdefault(wid, {})[name] = (
                np.exp(mass[:, :2]).mean(axis=1).round(6).tolist()
            )
            if twin:
                out["nonsense"].setdefault(wid, {})[name] = (
                    (0.5 * (odds[:, 2] - odds[:, 3])).round(6).tolist()
                )
        for fid, f in words["implicit"].items():
            fair, alt = lm.sequence_logprobs(f"{f['fair']}\n", seqs)
            rigged, _ = lm.sequence_logprobs(f"{f['rigged']}\n", seqs)
            out["implicit"].setdefault(fid, {})[name] = (
                (rigged - fair).round(6).tolist()
            )
            out["alternation"].setdefault(f"fair:{fid}", {})[name] = alt.round(
                6
            ).tolist()
        for lid, text in words["log"].items():
            _, alt = lm.sequence_logprobs(f"{text}\n", seqs)
            out["alternation"].setdefault(f"log:{lid}", {})[name] = alt.round(
                6
            ).tolist()
        print(f"  [{lm.repo}] {name} n={len(seqs)}", flush=True)
    return out


def run_dir(p: Protocol, seed: int) -> Path:
    tag = "eval" if seed == p.eval_seed else f"calibration-{seed}"
    d = ROOT / "runs" / f"coins-{p.sha[:12]}-{tag}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_study(
    *,
    seed: int,
    models: tuple[str, ...] | None,
    batch: int,
) -> Path:
    p = protocol()
    if seed == p.eval_seed and p.raw["meta"]["status"].startswith("DRAFT"):
        raise SystemExit("seal randomness.toml before the evaluation seed")
    stim = stimulus_groups(p, seed)
    out = run_dir(p, seed)
    (out / "stimuli.json").write_text(json.dumps(stim))
    keys = models or tuple(p.models)
    for key in keys:
        target = out / f"{key}.json"
        if target.exists():
            print(f"skip existing {target.name}", flush=True)
            continue
        spec: ModelSpec = p.models[key]
        t0 = time.monotonic()
        lm = LocalLM(
            spec.repo,
            revision=spec.revision,
            chat=spec.chat in {"template", "think"},
            batch=batch,
            answer_prefix=(
                p.raw["runtime"]["think_close"] if spec.chat == "think" else ""
            ),
        )
        try:
            scored = score_checkpoint(lm, p, stim["groups"])
        finally:
            lm.close()
        scored["seconds"] = round(time.monotonic() - t0, 1)
        scored["protocol"] = p.sha
        scored["seed"] = seed
        target.write_text(json.dumps(scored))
        print(f"wrote {target} in {scored['seconds']}s", flush=True)
    return out


def _z(values: np.ndarray) -> np.ndarray:
    sd = float(np.std(values))
    if sd < 1e-12:
        return np.zeros_like(values)
    return (values - float(np.mean(values))) / sd


def pooled(block: dict[str, dict[str, list[float]]], group: str) -> np.ndarray:
    return np.mean(
        [_z(np.array(v[group], dtype=np.float64)) for v in block.values()],
        axis=0,
    )


def slope(scores: np.ndarray, k: np.ndarray) -> float:
    keep = (k >= 1) & (k <= 14)
    return float(np.polyfit(k[keep] / 15.0, scores[keep], 1)[0])


def boot_r(
    a: np.ndarray,
    b: np.ndarray,
    rng: np.random.Generator,
    n: int,
) -> tuple[float, float, float]:
    r = float(np.corrcoef(a, b)[0, 1])
    draws = []
    for _ in range(n):
        ix = rng.integers(0, len(a), len(a))
        draws.append(np.corrcoef(a[ix], b[ix])[0, 1])
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return r, float(lo), float(hi)


def curve_shape(
    scores: np.ndarray,
    k: np.ndarray,
    rng: np.random.Generator,
    n: int,
) -> dict[str, Any]:
    x = k / 15.0
    c2, c1, _ = np.polyfit(x, scores, 2)
    draws = []
    for _ in range(n):
        ix = rng.integers(0, len(x), len(x))
        draws.append(np.polyfit(x[ix], scores[ix], 2)[0])
    lo = float(np.percentile(draws, 2.5))
    vertex = float(-c1 / (2 * c2)) if abs(c2) > 1e-12 else None
    human = bool(lo > 0 and vertex is not None and 0.55 <= vertex <= 0.70)
    means = [float(np.mean(scores[k == j])) for j in range(16)]
    return {
        "curvature": float(c2),
        "curvature_lo": lo,
        "vertex": vertex,
        "human_like": human,
        "means": means,
    }


def summarize_checkpoint(
    raw: dict[str, Any],
    stim: dict[str, Any],
    rng: np.random.Generator,
    n_boot: int,
) -> dict[str, Any]:
    k = np.array(stim["strata_k"], dtype=np.float64)
    fair_alts = np.array(
        [coin_features(s)["alts"] for s in stim["groups"]["fair"]]
    )
    per_wording = {}
    usable_votes = 0
    for wid in raw["stated"]:
        s = np.array(raw["stated"][wid]["strata"])
        z = np.array(raw["nonsense"][wid]["strata"])
        ss, zs = slope(s, k), slope(z, k)
        ok = abs(ss) >= 0.10 and abs(ss) >= 2 * abs(zs)
        usable_votes += ok
        per_wording[wid] = {"slope_stated": ss, "slope_nonsense": zs, "ok": ok}
    stated_fair = pooled(raw["stated"], "fair")
    implicit_fair = pooled(raw["implicit"], "fair")
    stated_strata = pooled(raw["stated"], "strata")
    fair_alt = np.mean(
        [
            np.mean(v["fair"])
            for key, v in raw["alternation"].items()
            if key.startswith("fair:")
        ]
    )
    log_alt = np.mean(
        [
            np.mean(v["fair"])
            for key, v in raw["alternation"].items()
            if key.startswith("log:")
        ]
    )
    return {
        "per_wording": per_wording,
        "usable": usable_votes >= 2,
        "stated_template": boot_r(stated_fair, fair_alts, rng, n_boot),
        "implicit_template": boot_r(implicit_fair, fair_alts, rng, n_boot),
        "stated_vs_implicit": boot_r(stated_fair, implicit_fair, rng, n_boot),
        "stated_curve": curve_shape(stated_strata, k, rng, n_boot),
        "alternation_fair": float(fair_alt),
        "alternation_log": float(log_alt),
        "coin_specific": float(fair_alt - log_alt),
        "ab_mass_median": float(
            np.median(
                np.concatenate(
                    [v["fair"] for v in raw.get("ab_mass", {}).values()]
                    or [[np.nan]]
                )
            )
        ),
    }


def agreement_drop(
    base: dict[str, Any],
    post: dict[str, Any],
    rng: np.random.Generator,
    n: int,
) -> dict[str, float]:
    bs, bi = pooled(base["stated"], "fair"), pooled(base["implicit"], "fair")
    ps, pi = pooled(post["stated"], "fair"), pooled(post["implicit"], "fair")
    r_base = float(np.corrcoef(bs, bi)[0, 1])
    r_post = float(np.corrcoef(ps, pi)[0, 1])
    draws = []
    for _ in range(n):
        ix = rng.integers(0, len(bs), len(bs))
        draws.append(
            np.corrcoef(ps[ix], pi[ix])[0, 1]
            - np.corrcoef(bs[ix], bi[ix])[0, 1]
        )
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return {
        "r_base": r_base,
        "r_post": r_post,
        "diff": r_post - r_base,
        "lo": float(lo),
        "hi": float(hi),
    }


def verdicts(
    p: Protocol,
    summaries: dict[str, dict[str, Any]],
    raws: dict[str, dict[str, Any]],
    rng: np.random.Generator,
) -> dict[str, Any]:
    n = p.bootstrap
    have = set(summaries)
    out: dict[str, Any] = {}

    def need(*keys: str) -> bool:
        return all(key in have for key in keys)

    if need("qwen_instruct"):
        q = summaries["qwen_instruct"]
        out["h1"] = bool(q["usable"])
        out["h2"] = bool(
            q["stated_template"][0] <= -0.25
            and q["stated_template"][2] < -0.15
        )
        out["h7"] = bool(q["stated_curve"]["human_like"])
    if need("qwen_instruct", "llama_instruct"):
        q, ll = summaries["qwen_instruct"], summaries["llama_instruct"]
        out["h5"] = bool(
            q["stated_vs_implicit"][2] < 0.30
            and ll["stated_vs_implicit"][2] < 0.30
            and ll["stated_vs_implicit"][0] <= -0.15
            and ll["stated_vs_implicit"][2] < 0
        )
    if need("qwen_base", "llama_base"):
        out["h3"] = not (
            summaries["qwen_base"]["usable"]
            or summaries["llama_base"]["usable"]
        )
    post = [key for key, m in p.models.items() if m.instruct and key in have]
    eligible = [
        key for key in post if summaries[key]["alternation_fair"] - 0.5 >= 0.02
    ]
    held = [
        key
        for key in eligible
        if summaries[key]["alternation_log"] - 0.5
        >= 0.5 * (summaries[key]["alternation_fair"] - 0.5)
    ]
    out["h4_counts"] = {
        "post_trained": len(post),
        "eligible": len(eligible),
        "held": len(held),
    }
    if len(post) == sum(m.instruct for m in p.models.values()):
        out["h4"] = len(eligible) >= 5 and len(held) >= 0.8 * len(eligible)
    paths = p.raw["paths"]
    if need(*paths["olmo3_instruct"], *paths["olmo3_think"]):
        ok = True
        for path in ("olmo3_instruct", "olmo3_think"):
            base, _, dpo, final = paths[path]
            rise = (
                summaries[final]["alternation_log"]
                - summaries[base]["alternation_log"]
            )
            by_dpo = (
                summaries[dpo]["alternation_log"]
                - summaries[base]["alternation_log"]
            )
            ok = ok and rise >= 0.05 and by_dpo >= 0.75 * rise
        out["h6"] = ok
    drops = {}
    for base, post_key in paths["h8_pairs"]:
        if not need(base, post_key):
            continue
        drops[f"{base}->{post_key}"] = agreement_drop(
            raws[base], raws[post_key], rng, n
        )
    out["h8_pairs"] = drops
    if len(drops) == len(paths["h8_pairs"]):
        out["h8"] = sum(d["hi"] < 0 for d in drops.values()) >= 4
    return out


def analyze_study(seed: int) -> Path:
    p = protocol()
    d = run_dir(p, seed)
    stim = json.loads((d / "stimuli.json").read_text())
    rng = np.random.default_rng(p.eval_seed + 17)
    raws: dict[str, dict[str, Any]] = {}
    summaries: dict[str, dict[str, Any]] = {}
    for key in p.models:
        path = d / f"{key}.json"
        if not path.exists():
            continue
        raws[key] = json.loads(path.read_text())
        summaries[key] = summarize_checkpoint(
            raws[key], stim, rng, p.bootstrap
        )
    report = {
        "protocol": p.sha,
        "seed": seed,
        "checkpoints": summaries,
        "verdicts": verdicts(p, summaries, raws, rng),
    }
    target = d / "report.json"
    target.write_text(json.dumps(report, indent=1))
    print(json.dumps(report["verdicts"], indent=1), flush=True)
    print(f"wrote {target}", flush=True)
    return target
