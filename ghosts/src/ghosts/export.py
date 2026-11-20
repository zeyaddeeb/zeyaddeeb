from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.protocol import load
from ghosts.stimuli import binary_patch, fair_stream, noise_grid
from ghosts.study import RUNS, run_dir


def _quantize_i16(values: list[float]) -> dict[str, Any]:
    arr = np.asarray(values, dtype=np.float64)
    scale = float(np.max(np.abs(arr)))
    if scale < 1e-9:
        return {"scale": 1.0, "q": [0] * len(arr)}
    q = np.clip(np.round(arr / scale * 32000.0), -32000, 32000).astype(int)
    return {"scale": round(scale, 6), "q": q.tolist()}


def _top_bottom_indices(
    values: list[float], k: int = 8
) -> dict[str, list[int]]:
    arr = np.asarray(values, dtype=np.float64)
    order = np.argsort(arr)
    return {
        "top": order[-k:][::-1].tolist(),
        "bottom": order[:k].tolist(),
    }


def export_web(out_dir: Path, data_ts: Path) -> None:
    p = load()
    d = run_dir(p)
    report = json.loads((RUNS / f"{p.sha[:12]}.report.json").read_text())
    ascii_raw = json.loads((d / "ascii.json").read_text())
    vision_raw = json.loads((d / "vision.json").read_text())
    coins_raw = json.loads((d / "coins.json").read_text())
    mirage_raw = json.loads((d / "mirage.json").read_text())

    out_dir.mkdir(parents=True, exist_ok=True)

    darkroom_payload: dict[str, Any] = {
        "protocol": p.sha[:12],
        "seed": p.eval_seed,
        "ascii": {
            "count": ascii_raw["count"],
            "size": ascii_raw["size"],
            "series": {},
        },
        "vision_binary": {
            "count": vision_raw["binary_count"],
            "size": vision_raw["binary_size"],
            "series": {},
        },
        "vision_spatial": {
            "count": vision_raw["spatial_count"],
            "size": vision_raw["spatial_size"],
            "series": {},
        },
        "coins": {
            "count": coins_raw["fair_count"],
            "length": coins_raw["length"],
            "series": {},
        },
        "mirage": {
            "length": mirage_raw["length"],
            "warmup": mirage_raw["warmup"],
            "bayes": {k: v[:4] for k, v in mirage_raw["bayes"].items()},
            "models": {},
        },
    }

    for mkey in ("qwen_instruct", "llama_instruct"):
        md = ascii_raw["models"][mkey]
        for section in ("detect", "pairs"):
            for ckey, entry in md[section].items():
                key = f"{mkey}:{section}:{ckey}"
                darkroom_payload["ascii"]["series"][key] = {
                    **_quantize_i16(entry["scores"]),
                    "extrema": _top_bottom_indices(entry["scores"]),
                }

    for k, entry in vision_raw["binary"].items():
        darkroom_payload["vision_binary"]["series"][k] = {
            **_quantize_i16(entry["scores"]),
            "extrema": _top_bottom_indices(entry["scores"]),
        }

    for k, entry in vision_raw["spatial"].items():
        darkroom_payload["vision_spatial"]["series"][k] = {
            **_quantize_i16(entry["scores"]),
            "extrema": _top_bottom_indices(entry["scores"]),
        }

    for mkey, md in coins_raw["models"].items():
        sc = md["fair"]["neutral"]["scores"]
        darkroom_payload["coins"]["series"][mkey] = {
            **_quantize_i16(sc),
            "extrema": _top_bottom_indices(sc, k=12),
        }

    for mkey, md in mirage_raw["models"].items():
        darkroom_payload["mirage"]["models"][mkey] = {
            akey: aentry["streams"][:4] for akey, aentry in md.items()
        }

    payload_path = out_dir / "study-payload.json"
    payload_path.write_text(
        json.dumps(darkroom_payload, separators=(",", ":"))
    )

    compact_report = {
        "protocol": report["protocol"][:12],
        "seed": report["seed"],
        "verdicts": report["verdicts"],
        "ascii": {
            m: {
                "cross": v["cross"],
                "conditions": {
                    ck: {
                        k: cv
                        for k, cv in cdata.items()
                        if k not in ("ghost", "ghost_even", "ghost_odd")
                    }
                    for ck, cdata in v["conditions"].items()
                },
            }
            for m, v in report["ascii"].items()
        },
        "vision": {
            "binary_consistency": report["vision"]["binary_consistency"],
            "binary": {
                k: {
                    fk: fv
                    for fk, fv in v.items()
                    if fk not in ("ghost", "ghost_even", "ghost_odd")
                }
                for k, v in report["vision"]["binary"].items()
            },
            "spatial": {
                k: {
                    fk: fv
                    for fk, fv in v.items()
                    if fk not in ("ghost", "ghost_even", "ghost_odd")
                }
                for k, v in report["vision"]["spatial"].items()
            },
        },
        "coins": report["coins"],
        "mirage": report["mirage"],
    }

    data_ts.parent.mkdir(parents=True, exist_ok=True)
    ts_text = (
        "export const STUDY = "
        + json.dumps(compact_report, indent="\t")
        + " as const;\n"
    )
    data_ts.write_text(ts_text)
    print(f"wrote {payload_path} ({payload_path.stat().st_size} bytes)")
    print(f"wrote {data_ts}")


def export_parity_fixture(path: Path) -> None:
    seed = 100
    fixture = {
        "seed": seed,
        "ascii9_0": noise_grid(seed, 0, 9).astype(int).tolist(),
        "ascii9_17": noise_grid(seed, 17, 9).astype(int).tolist(),
        "bin8_0": binary_patch(seed, 0, 8).astype(int).tolist(),
        "bin6_5": binary_patch(seed, 5, 6).astype(int).tolist(),
        "coins16_0": fair_stream(seed, 0, 16, ("H", "T")),
        "coins16_9": fair_stream(seed, 9, 16, ("H", "T")),
        "abcd32_0": fair_stream(seed, 0, 32, ("A", "B", "C", "D")),
        "wkmz32_2": fair_stream(seed, 2, 32, ("W", "K", "M", "Z")),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fixture, indent=2) + "\n")
    print(f"wrote {path}")
