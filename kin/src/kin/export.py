import json
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import save_file

from kin.data import digits
from kin.fit import classify, epochs, imitate_inputs
from kin.net import Net, clone, fresh, pruned
from kin.protocol import load, seeds
from kin.study import records, seed_path
from kin.suspects import (
    _clothes,
    _imitate_both,
    lie,
    parent,
    references,
    trained,
)

SHOWN = 1000
CAST = (
    "parent",
    "lie",
    "sister",
    "lookalike",
    "stranger",
    "pruned",
    "more",
    "copycat",
    "outsider",
    "ref-0",
    "ref-1",
    "ref-2",
)


def _more(base: Net, seed: int) -> Net:
    train = digits(True)
    return classify(clone(base), train.x, train.y, epochs(60000, 1), seed + 11)


def cast(seed: int) -> dict[str, Net]:
    p = load()
    base = parent(seed)
    imit = imitate_inputs(
        fresh(seed + 600, p.layers),
        base,
        digits(True).x,
        epochs(60000, p.digits_epochs[-1]),
        seed + 50,
    )
    out = {
        "parent": base,
        "lie": lie(base, seed),
        "sister": _clothes(base, 1000, seed),
        "lookalike": imit,
        "stranger": trained(seed + 800),
        "pruned": pruned(base, 0.6),
        "more": _more(base, seed),
        "copycat": _imitate_both(base, seed + 700),
        "outsider": trained(seed + 801),
    }
    for j, r in enumerate(references(seed)):
        out[f"ref-{j}"] = r
    return out


def _key(record: dict) -> np.ndarray:
    by = {r["name"]: r for r in record["suspects"]}
    lies = {r["name"]: r for r in record["inherit"]}
    return np.array(
        [
            lies["clothes-1000"]["lie_after"],
            lies["digits-20"]["lie_after"],
            lies["same-0"]["lie_after"],
            by["noise-0.1"]["primary"],
            by["more"]["primary"],
            by["digits-20"]["primary"],
            by["same-0"]["primary"],
        ]
    )


def typical(recs: list[dict]) -> int:
    keep = set(seeds(load().evaluation))
    pool = [r for r in recs if r["seed"] in keep]
    keys = np.stack([_key(r) for r in pool])
    med = np.median(keys, 0)
    spread = keys.std(0) + 1e-9
    dist = (((keys - med) / spread) ** 2).sum(1)
    return pool[int(dist.argmin())]["seed"]


def quantized(net: Net) -> dict[str, torch.Tensor]:
    out = {}
    for k, raw in net.state_dict().items():
        v = raw.detach().float()
        if v.dim() == 2:
            scale = v.abs().amax(1).clamp_min(1e-12) / 127
            q = (v / scale[:, None]).round().clamp(-127, 127)
            out[k] = q.to(torch.int8).contiguous()
            out[f"{k}.scale"] = scale.contiguous()
        else:
            out[k] = v.contiguous()
    return out


def save_models(models: dict[str, Net], out: Path, seed: int) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for name in CAST:
        state = quantized(models[name])
        path = out / f"{name}.safetensors"
        save_file(state, str(path), {"seed": str(seed), "name": name})
        sizes[name] = path.stat().st_size
    return sizes


def save_digits(out: Path) -> dict:
    test = digits(False)
    raw = ((test.x[:SHOWN] + 1) / 2 * 255).round().clamp(0, 255)
    pixels = raw.to(torch.uint8).numpy().tobytes()
    labels = test.y[:SHOWN].to(torch.uint8).numpy().tobytes()
    (out / "digits.bin").write_bytes(pixels + labels)
    return {"count": SHOWN, "bytes": len(pixels) + len(labels)}


def export(out: Path, data: Path) -> None:
    recs = records()
    seed = typical(recs)
    shown = json.loads(seed_path(seed).read_text())
    torch.set_num_threads(1)
    models = cast(seed)
    sizes = save_models(models, out, seed)
    digit_file = save_digits(out)
    report = json.loads(
        (
            seed_path(0).parent.parent / f"{load().sha[:12]}.report.json"
        ).read_text()
    )
    payload = {
        "protocol": load().sha,
        "seed": seed,
        "files": sizes,
        "digits": digit_file,
        "shown": {
            "suspects": shown["suspects"],
            "inherit": shown["inherit"],
            "parentAccuracy": shown["parent_accuracy"],
        },
        "verdicts": report["verdicts"],
        "kinds": report["kinds"],
        "inherit": report["inherit"],
        "calls": report["calls"],
        "exploratory": report["exploratory"],
        "evaluationSeeds": len(seeds(load().evaluation)),
    }
    data.write_text(
        'import type { Study } from "./study";\n\nexport const STUDY: Study = '
        + json.dumps(payload, separators=(",", ":"))
        + ";\n"
    )
