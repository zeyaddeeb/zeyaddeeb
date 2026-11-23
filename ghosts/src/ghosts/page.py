from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.coinstudy import pooled, protocol
from ghosts.diagnostics import diagnostics_from_study
from ghosts.followup import load_followups
from ghosts.jsonfmt import dumps
from ghosts.paper import LABELS, PAIR_LABELS, PILOT, collect
from ghosts.protocol import ROOT

TARGET = (
    ROOT.parent / "www" / "apps" / "www" / "features" / "ghosts" / "study.json"
)
FAMILIES = [
    ("qwen", "Qwen2.5 3B", ["qwen_base", "qwen_instruct"]),
    ("llama", "Llama 3.2 3B", ["llama_base", "llama_instruct"]),
    (
        "olmo2",
        "OLMo 2 1B",
        ["olmo2_base", "olmo2_sft", "olmo2_dpo", "olmo2_instruct"],
    ),
    (
        "olmo3i",
        "OLMo 3 7B Instruct",
        [
            "olmo3_base",
            "olmo3_instruct_sft",
            "olmo3_instruct_dpo",
            "olmo3_instruct",
        ],
    ),
    (
        "olmo3t",
        "OLMo 3 7B Think",
        ["olmo3_base", "olmo3_think_sft", "olmo3_think_dpo", "olmo3_think"],
    ),
]
STAGES = {
    "qwen_base": "Base",
    "qwen_instruct": "Instruct",
    "llama_base": "Base",
    "llama_instruct": "Instruct",
    "olmo2_base": "Base",
    "olmo2_sft": "SFT",
    "olmo2_dpo": "DPO",
    "olmo2_instruct": "RLVR",
    "olmo3_base": "Base",
    "olmo3_instruct_sft": "SFT",
    "olmo3_instruct_dpo": "DPO",
    "olmo3_instruct": "RLVR",
    "olmo3_think_sft": "SFT",
    "olmo3_think_dpo": "DPO",
    "olmo3_think": "RLVR",
}


def quantize(values: np.ndarray) -> dict[str, Any]:
    peak = float(np.max(np.abs(values)))
    scale = peak / 127 if peak > 0 else 1.0
    q = np.clip(np.round(values / scale), -127, 127).astype(np.int8)
    return {
        "scale": round(scale, 8),
        "data": base64.b64encode(q.tobytes()).decode("ascii"),
    }


def dequantize(packed: dict[str, Any]) -> np.ndarray:
    raw = np.frombuffer(base64.b64decode(packed["data"]), dtype=np.int8)
    return raw.astype(np.float64) * packed["scale"]


def _mean(block: dict[str, dict[str, list[float]]], group: str) -> np.ndarray:
    return np.mean([np.array(v[group]) for v in block.values()], axis=0)


def coins_hex(seqs: list[list[str]]) -> str:
    out = []
    for seq in seqs:
        bits = 0
        for x in seq:
            bits = (bits << 1) | (x == "H")
        out.append(f"{bits:04x}")
    return "".join(out)


def _sigmoid(x: float) -> float:
    return float(1 / (1 + np.exp(-x)))


def _r3(x: float) -> float:
    return round(float(x), 3)


def _curve_logit(raw: dict[str, Any], k: np.ndarray) -> list[float]:
    strata = _mean(raw["stated"], "strata")
    center = float(np.mean(_mean(raw["stated"], "fair")))
    return [_r3(strata[k == j].mean() - center) for j in range(16)]


def _pilot() -> dict[str, Any]:
    ascii_ = json.loads(PILOT.read_text())["ascii"]["qwen_instruct"]
    conds, cross = ascii_["conditions"], ascii_["cross"]
    split = {
        probe: [
            _r3(conds[f"detect:{layout}/{probe}"]["split_r"])
            for layout in ("packed", "spaced")
        ]
        for probe in ("face", "zorp")
    }
    return {
        "face": split["face"],
        "zorp": split["zorp"],
        "cross": [
            _r3(cross[f"{layout}_face_vs_zorp"])
            for layout in ("packed", "spaced")
        ],
        "null": _r3(conds["detect:packed/face"]["perm_p95"]),
        "grids": int(conds["detect:packed/face"]["n"]),
    }


def _round_features(prof: dict[str, Any]) -> dict[str, Any]:
    return {
        role: {
            "switches": _r3(vals["switches"]),
            "firstH": _r3(vals["first_h"]),
            "hFrac": _r3(vals["h_frac"]),
            "imbalance": _r3(vals["imbalance"]),
            "maxRun": _r3(vals["max_run"]),
            "lastH": _r3(vals["last_h"]),
        }
        for role, vals in prof["features"].items()
    }


def _checkpoint_diag(prof: dict[str, Any]) -> dict[str, Any]:
    ag = prof["agreements"]
    tl = prof["twin_links"]
    out: dict[str, Any] = {
        "partialFirstH": _r3(ag["partial_first_h"]),
        "partialHt": [_r3(t) for t in prof["partial_ht_ci"]],
        "partialShape": _r3(ag["partial_shape"]),
        "partialHtTwin": _r3(ag["partial_ht_twin"]),
        "statedTwinHt": _r3(tl["stated_twin_ht"]),
        "twinExpectsHt": _r3(tl["twin_expects_ht"]),
        "features": _round_features(prof),
    }
    wf = prof.get("wording_framing")
    if wf:
        out["wordingFraming"] = {
            "raw": {
                w: {f: _r3(v) for f, v in row.items()}
                for w, row in wf["raw"].items()
            },
            "partialHt": {
                w: {f: _r3(v) for f, v in row.items()}
                for w, row in wf["partial_ht"].items()
            },
        }
    return out


def _pair_diag(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "firstH": _r3(d["first_h"]["diff"]),
        "firstHLo": _r3(d["first_h"]["lo"]),
        "firstHHi": _r3(d["first_h"]["hi"]),
        "ht": _r3(d["ht"]["diff"]),
        "htLo": _r3(d["ht"]["lo"]),
        "htHi": _r3(d["ht"]["hi"]),
        "htTwin": _r3(d["ht_twin"]["diff"]),
        "htTwinLo": _r3(d["ht_twin"]["lo"]),
        "htTwinHi": _r3(d["ht_twin"]["hi"]),
    }


def build(data: dict[str, Any], raws: dict[str, Any]) -> dict[str, Any]:
    p = data["protocol"]
    k = np.array(data["stim"]["strata_k"])
    s = data["summaries"]
    x = data["extra"]
    v = data["report"]["verdicts"]
    diag = data["diagnostics"]
    checkpoints = {}
    for key in LABELS:
        raw = raws[key]
        c = s[key]
        checkpoints[key] = {
            "label": LABELS[key],
            "stage": STAGES[key],
            "usable": x[key]["ok_wordings"],
            "agree": [_r3(t) for t in c["stated_vs_implicit"]],
            "partial": _r3(x[key]["readout"]["partial"]),
            "template": _r3(c["stated_template"][0]),
            "implicitTemplate": _r3(c["implicit_template"][0]),
            "twinTemplate": _r3(x[key]["readout"]["twin_template"]),
            "statedTwin": _r3(x[key]["readout"]["stated_twin"]),
            "twinExpects": _r3(x[key]["readout"]["twin_implicit"]),
            "altFair": _r3(c["alternation_fair"]),
            "altLog": _r3(c["alternation_log"]),
            "mass": _r3(c["ab_mass_median"]),
            "curve": [_r3(m) for m in c["stated_curve"]["means"]],
            "curveLogit": _curve_logit(raw, k),
            "upturn": _r3(x[key]["upturn"]["value"]),
            "says": quantize(pooled(raw["stated"], "fair")),
            "expects": quantize(pooled(raw["implicit"], "fair")),
            "twin": quantize(pooled(raw["nonsense"], "fair")),
            "saysRigged": _r3(
                _sigmoid(np.median(_mean(raw["stated"], "fair")))
            ),
            "expectsRigged": _r3(
                _sigmoid(np.median(_mean(raw["implicit"], "fair")))
            ),
            **_checkpoint_diag(diag["checkpoints"][key]),
        }
    pairs = []
    for pair, d in v["h8_pairs"].items():
        part = data["partial_pairs"][pair]
        base, post = pair.split("->")
        pairs.append(
            {
                "label": PAIR_LABELS[pair],
                "base": base,
                "post": post,
                "diff": _r3(d["diff"]),
                "lo": _r3(d["lo"]),
                "hi": round(float(d["hi"]), 4),
                "partial": _r3(part["diff"]),
                "partialLo": _r3(part["lo"]),
                "partialHi": _r3(part["hi"]),
                **_pair_diag(diag["pairs"][pair]),
            }
        )
    payload: dict[str, Any] = {
        "protocol": p.sha[:12],
        "seed": p.eval_seed,
        "sealed": p.raw["seal"]["sealed_at"],
        "coins": coins_hex(data["stim"]["groups"]["fair"]),
        "families": [
            {"id": fid, "label": label, "path": path}
            for fid, label, path in FAMILIES
        ],
        "checkpoints": checkpoints,
        "pairs": pairs,
        "pilot": _pilot(),
        "verdicts": {
            h: bool(v[h])
            for h in ("h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8")
        },
    }
    followups = data.get("followups") or load_followups(p.sha)
    if followups:
        payload["followups"] = followups
    return payload


def enrich_page_from_study(target: Path = TARGET) -> Path:
    p = protocol()
    payload = json.loads(target.read_text())
    diag = diagnostics_from_study(
        target, seed=p.eval_seed + 37, n_boot=p.bootstrap
    )
    for key, ck in payload["checkpoints"].items():
        ck.update(_checkpoint_diag(diag["checkpoints"][key]))
    for pair in payload["pairs"]:
        pair_key = f"{pair['base']}->{pair['post']}"
        pair.update(_pair_diag(diag["pairs"][pair_key]))
    followups = load_followups(p.sha)
    if followups:
        payload["followups"] = followups
    target.write_text(dumps(payload))
    print(f"enriched {target} ({target.stat().st_size:,} bytes)", flush=True)
    return target


def export_page(target: Path = TARGET) -> Path:
    data = collect()
    p = data["protocol"]
    d = ROOT / "runs" / f"coins-{p.sha[:12]}-eval"
    raws = {key: json.loads((d / f"{key}.json").read_text()) for key in LABELS}
    payload = build(data, raws)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(dumps(payload))
    print(f"wrote {target} ({target.stat().st_size:,} bytes)", flush=True)
    return target
