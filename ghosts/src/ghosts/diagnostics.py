from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.coinstudy import pooled
from ghosts.stimuli import coin_features

FEATURE_NAMES = (
    "switches",
    "first_h",
    "h_frac",
    "imbalance",
    "max_run",
    "last_h",
)


def decode_packed(packed: dict[str, Any]) -> np.ndarray:
    raw = np.frombuffer(base64.b64decode(packed["data"]), dtype=np.int8)
    return raw.astype(np.float64) * float(packed["scale"])


def coins_from_hex(coins_hex: str, length: int = 16) -> list[list[str]]:
    step = length // 4
    seqs: list[list[str]] = []
    for i in range(0, len(coins_hex), step):
        bits = int(coins_hex[i : i + step], 16)
        seqs.append(
            ["H" if (bits >> j) & 1 else "T" for j in range(length - 1, -1, -1)]
        )
    return seqs


def coin_diagnostic_features(seqs: list[list[str]]) -> dict[str, np.ndarray]:
    base = [coin_features(seq) for seq in seqs]
    return {
        "switches": np.array([f["alts"] for f in base], dtype=np.float64),
        "first_h": np.array(
            [1.0 if seq[0] == "H" else 0.0 for seq in seqs], dtype=np.float64
        ),
        "h_frac": np.array([f["h_frac"] for f in base], dtype=np.float64),
        "imbalance": np.array([f["imb"] for f in base], dtype=np.float64),
        "max_run": np.array([f["max_run"] for f in base], dtype=np.float64),
        "last_h": np.array(
            [1.0 if seq[-1] == "H" else 0.0 for seq in seqs], dtype=np.float64
        ),
    }


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    sa, sb = float(np.std(a)), float(np.std(b))
    if sa < 1e-12 or sb < 1e-12:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def residualize(
    y: np.ndarray, controls: list[np.ndarray] | tuple[np.ndarray, ...]
) -> np.ndarray:
    if not controls:
        return y - float(np.mean(y))
    x = np.column_stack([np.ones(len(y), dtype=np.float64), *controls])
    beta, *_ = np.linalg.lstsq(x, y, rcond=None)
    return y - x @ beta


def multi_partial_r(
    a: np.ndarray,
    b: np.ndarray,
    controls: list[np.ndarray] | tuple[np.ndarray, ...],
) -> float:
    return _corr(residualize(a, controls), residualize(b, controls))


def boot_multi_partial_r(
    a: np.ndarray,
    b: np.ndarray,
    controls: list[np.ndarray] | tuple[np.ndarray, ...],
    rng: np.random.Generator,
    n: int,
) -> tuple[float, float, float]:
    r = multi_partial_r(a, b, controls)
    draws = np.empty(n, dtype=np.float64)
    size = len(a)
    for i in range(n):
        ix = rng.integers(0, size, size)
        draws[i] = multi_partial_r(a[ix], b[ix], [c[ix] for c in controls])
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return r, float(lo), float(hi)


def boot_multi_partial_drop(
    base: tuple[np.ndarray, np.ndarray],
    post: tuple[np.ndarray, np.ndarray],
    base_controls: list[np.ndarray] | tuple[np.ndarray, ...],
    post_controls: list[np.ndarray] | tuple[np.ndarray, ...],
    *,
    rng: np.random.Generator,
    n: int,
) -> dict[str, float]:
    base_a, base_b = base
    post_a, post_b = post
    r_base = multi_partial_r(base_a, base_b, base_controls)
    r_post = multi_partial_r(post_a, post_b, post_controls)
    draws = np.empty(n, dtype=np.float64)
    size = len(base_a)
    for i in range(n):
        ix = rng.integers(0, size, size)
        pb = multi_partial_r(
            base_a[ix], base_b[ix], [c[ix] for c in base_controls]
        )
        pp = multi_partial_r(
            post_a[ix], post_b[ix], [c[ix] for c in post_controls]
        )
        draws[i] = pp - pb
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return {
        "base": r_base,
        "post": r_post,
        "diff": r_post - r_base,
        "lo": float(lo),
        "hi": float(hi),
    }


def feature_profile(
    says: np.ndarray,
    expects: np.ndarray,
    twin: np.ndarray,
    feats: dict[str, np.ndarray],
) -> dict[str, Any]:
    ht = [feats["first_h"], feats["h_frac"]]
    shape = [feats["switches"], feats["imbalance"]]
    return {
        "features": {
            role: {
                name: _corr(vec, feats[name]) for name in FEATURE_NAMES
            }
            for role, vec in (
                ("says", says),
                ("twin", twin),
                ("expects", expects),
            )
        },
        "agreements": {
            "raw": _corr(says, expects),
            "partial_twin": multi_partial_r(says, expects, [twin]),
            "partial_first_h": multi_partial_r(
                says, expects, [feats["first_h"]]
            ),
            "partial_ht": multi_partial_r(says, expects, ht),
            "partial_shape": multi_partial_r(says, expects, shape),
            "partial_ht_twin": multi_partial_r(says, expects, [*ht, twin]),
        },
        "twin_links": {
            "stated_twin_raw": _corr(says, twin),
            "stated_twin_ht": multi_partial_r(says, twin, ht),
            "twin_expects_raw": _corr(twin, expects),
            "twin_expects_ht": multi_partial_r(twin, expects, ht),
        },
    }


def wording_framing_matrix(
    raw: dict[str, Any],
    feats: dict[str, np.ndarray],
) -> dict[str, Any]:
    ht = [feats["first_h"], feats["h_frac"]]
    wordings = list(raw["stated"])
    framings = list(raw["implicit"])
    raw_mat: dict[str, dict[str, float]] = {}
    ht_mat: dict[str, dict[str, float]] = {}
    for w in wordings:
        s = np.array(raw["stated"][w]["fair"], dtype=np.float64)
        raw_mat[w] = {}
        ht_mat[w] = {}
        for f in framings:
            imp = np.array(raw["implicit"][f]["fair"], dtype=np.float64)
            raw_mat[w][f] = _corr(s, imp)
            ht_mat[w][f] = multi_partial_r(s, imp, ht)
    return {
        "wordings": wordings,
        "framings": framings,
        "raw": raw_mat,
        "partial_ht": ht_mat,
    }


def diagnostics_from_raws(
    raws: dict[str, dict[str, Any]],
    fair_seqs: list[list[str]],
    pairs: list[tuple[str, str]],
    *,
    seed: int = 231,
    n_boot: int = 5000,
) -> dict[str, Any]:
    feats = coin_diagnostic_features(fair_seqs)
    rng = np.random.default_rng(seed)
    triplets = {
        key: (
            pooled(raw["stated"], "fair"),
            pooled(raw["implicit"], "fair"),
            pooled(raw["nonsense"], "fair"),
        )
        for key, raw in raws.items()
    }
    ht = [feats["first_h"], feats["h_frac"]]
    checkpoints = {}
    for key, (says, expects, twin) in triplets.items():
        prof = feature_profile(says, expects, twin, feats)
        prof["partial_ht_ci"] = list(
            boot_multi_partial_r(says, expects, ht, rng, n_boot)
        )
        prof["wording_framing"] = wording_framing_matrix(raws[key], feats)
        checkpoints[key] = prof
    pair_drops = {}
    for base, post in pairs:
        bs, bi, bt = triplets[base]
        ps, pi, pt = triplets[post]
        pair_drops[f"{base}->{post}"] = {
            "first_h": boot_multi_partial_drop(
                (bs, bi),
                (ps, pi),
                [feats["first_h"]],
                [feats["first_h"]],
                rng=rng,
                n=n_boot,
            ),
            "ht": boot_multi_partial_drop(
                (bs, bi), (ps, pi), ht, ht, rng=rng, n=n_boot
            ),
            "ht_twin": boot_multi_partial_drop(
                (bs, bi),
                (ps, pi),
                [*ht, bt],
                [*ht, pt],
                rng=rng,
                n=n_boot,
            ),
        }
    return {
        "checkpoints": checkpoints,
        "pairs": pair_drops,
    }


def diagnostics_from_study(
    study_path: Path,
    *,
    seed: int = 231,
    n_boot: int = 5000,
) -> dict[str, Any]:
    study = json.loads(study_path.read_text())
    seqs = coins_from_hex(study["coins"])
    feats = coin_diagnostic_features(seqs)
    rng = np.random.default_rng(seed)
    triplets = {
        key: (
            decode_packed(c["says"]),
            decode_packed(c["expects"]),
            decode_packed(c["twin"]),
        )
        for key, c in study["checkpoints"].items()
    }
    ht = [feats["first_h"], feats["h_frac"]]
    checkpoints = {}
    for key, (says, expects, twin) in triplets.items():
        prof = feature_profile(says, expects, twin, feats)
        prof["partial_ht_ci"] = list(
            boot_multi_partial_r(says, expects, ht, rng, n_boot)
        )
        checkpoints[key] = prof
    pair_drops = {}
    for pair in study["pairs"]:
        base, post = pair["base"], pair["post"]
        bs, bi, bt = triplets[base]
        ps, pi, pt = triplets[post]
        pair_drops[f"{base}->{post}"] = {
            "first_h": boot_multi_partial_drop(
                (bs, bi),
                (ps, pi),
                [feats["first_h"]],
                [feats["first_h"]],
                rng=rng,
                n=n_boot,
            ),
            "ht": boot_multi_partial_drop(
                (bs, bi), (ps, pi), ht, ht, rng=rng, n=n_boot
            ),
            "ht_twin": boot_multi_partial_drop(
                (bs, bi),
                (ps, pi),
                [*ht, bt],
                [*ht, pt],
                rng=rng,
                n=n_boot,
            ),
        }
    return {
        "checkpoints": checkpoints,
        "pairs": pair_drops,
    }
