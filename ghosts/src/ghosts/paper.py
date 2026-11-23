from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.coinstudy import pooled, protocol, run_dir
from ghosts.diagnostics import diagnostics_from_raws, diagnostics_from_study
from ghosts.followup import load_followups
from ghosts.protocol import ROOT
from ghosts.randomness import auc
from ghosts.stimuli import coin_features

PAPER = ROOT / "paper"
PILOT = ROOT / "runs" / "e00413254584.report.json"
MIDDLE = (9, 10)
LABELS = {
    "qwen_base": "Qwen2.5 3B base",
    "qwen_instruct": "Qwen2.5 3B Instruct",
    "llama_base": "Llama 3.2 3B base",
    "llama_instruct": "Llama 3.2 3B Instruct",
    "olmo2_base": "OLMo 2 1B base",
    "olmo2_sft": "OLMo 2 1B SFT",
    "olmo2_dpo": "OLMo 2 1B DPO",
    "olmo2_instruct": "OLMo 2 1B Instruct",
    "olmo3_base": "OLMo 3 7B base",
    "olmo3_instruct_sft": "OLMo 3 7B Instruct SFT",
    "olmo3_instruct_dpo": "OLMo 3 7B Instruct DPO",
    "olmo3_instruct": "OLMo 3 7B Instruct",
    "olmo3_think_sft": "OLMo 3 7B Think SFT",
    "olmo3_think_dpo": "OLMo 3 7B Think DPO",
    "olmo3_think": "OLMo 3 7B Think",
}
PAIR_LABELS = {
    "qwen_base->qwen_instruct": "Qwen2.5 3B",
    "llama_base->llama_instruct": "Llama 3.2 3B",
    "olmo2_base->olmo2_instruct": "OLMo 2 1B",
    "olmo3_base->olmo3_instruct": "OLMo 3 7B Instruct",
    "olmo3_base->olmo3_think": "OLMo 3 7B Think",
}
STAGE_PANELS = {
    "qwen": ["qwen_base", "qwen_instruct"],
    "llama": ["llama_base", "llama_instruct"],
    "olmo2": ["olmo2_base", "olmo2_sft", "olmo2_dpo", "olmo2_instruct"],
    "olmo3i": [
        "olmo3_base",
        "olmo3_instruct_sft",
        "olmo3_instruct_dpo",
        "olmo3_instruct",
    ],
    "olmo3t": [
        "olmo3_base",
        "olmo3_think_sft",
        "olmo3_think_dpo",
        "olmo3_think",
    ],
}
FAMILY_BREAKS = {"llama_base", "olmo2_base", "olmo3_base", "olmo3_think_sft"}
RIGGED = ("streaky_0.80", "alternating_0.20", "heads_0.85")


def signed(x: float, digits: int = 2) -> str:
    text = f"{x:+.{digits}f}"
    if float(text) == 0:
        return f"{0:.{digits}f}"
    if text.startswith("-"):
        return f"$-${text[1:]}"
    return f"$+${text[1:]}"


def plain(x: float, digits: int = 2) -> str:
    text = f"{x:.{digits}f}"
    if float(text) == 0:
        return f"{0:.{digits}f}"
    if text.startswith("-"):
        return f"$-${text[1:]}"
    return text


def _r(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.corrcoef(a, b)[0, 1])


def partial_r(s: np.ndarray, imp: np.ndarray, z: np.ndarray) -> float:
    r_si, r_sz, r_zi = _r(s, imp), _r(s, z), _r(z, imp)
    return (r_si - r_sz * r_zi) / float(np.sqrt((1 - r_sz**2) * (1 - r_zi**2)))


def _fair_triplet(
    raw: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return (
        pooled(raw["stated"], "fair"),
        pooled(raw["implicit"], "fair"),
        pooled(raw["nonsense"], "fair"),
    )


def readout(raw: dict[str, Any], alts: np.ndarray) -> dict[str, float]:
    s, imp, z = _fair_triplet(raw)
    return {
        "stated_twin": _r(s, z),
        "twin_implicit": _r(z, imp),
        "twin_template": _r(z, alts),
        "partial": partial_r(s, imp, z),
    }


def partial_drop(
    base: dict[str, Any],
    post: dict[str, Any],
    rng: np.random.Generator,
    n: int,
) -> dict[str, float]:
    bs, bi, bz = _fair_triplet(base)
    ps, pi, pz = _fair_triplet(post)
    draws = np.empty(n)
    for i in range(n):
        ix = rng.integers(0, len(bs), len(bs))
        draws[i] = partial_r(ps[ix], pi[ix], pz[ix]) - partial_r(
            bs[ix], bi[ix], bz[ix]
        )
    lo, hi = np.percentile(draws, [2.5, 97.5])
    r_base, r_post = partial_r(bs, bi, bz), partial_r(ps, pi, pz)
    return {
        "base": r_base,
        "post": r_post,
        "diff": r_post - r_base,
        "lo": float(lo),
        "hi": float(hi),
    }


def interval(lo: float, hi: float, digits: int = 2) -> str:
    return f"[{signed(lo, digits)}, {signed(hi, digits)}]"


def upturn(
    raw: dict[str, Any],
    k: np.ndarray,
    rng: np.random.Generator,
    n: int,
) -> dict[str, float]:
    scores = pooled(raw["stated"], "strata")
    middle = scores[np.isin(k, MIDDLE)]
    end = scores[k == k.max()]
    means = np.array([scores[k == j].mean() for j in np.unique(k)])
    draws = np.empty(n)
    for i in range(n):
        m = middle[rng.integers(0, len(middle), len(middle))]
        e = end[rng.integers(0, len(end), len(end))]
        draws[i] = e.mean() - m.mean()
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return {
        "value": float(end.mean() - middle.mean()),
        "lo": float(lo),
        "hi": float(hi),
        "lowest_rate": float(np.unique(k)[int(np.argmin(means))] / k.max()),
    }


def sensitivity(raw: dict[str, Any]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for name in RIGGED:
        group = f"rigged:{name}"
        stated = [
            auc(np.array(v[group]), np.array(v["fair"]))
            for v in raw["stated"].values()
        ]
        implicit = [
            auc(np.array(v[group]), np.array(v["fair"]))
            for v in raw["implicit"].values()
        ]
        out[name] = {
            "stated": float(np.mean(stated)),
            "implicit": float(np.mean(implicit)),
        }
    return out


def _write_csv(path: Path, header: list[str], rows: list[list[Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


def _load() -> tuple[Any, dict[str, Any], dict[str, Any], dict[str, Any]]:
    p = protocol()
    d = run_dir(p, p.eval_seed)
    report = json.loads((d / "report.json").read_text())
    if report["protocol"] != p.sha:
        raise SystemExit("report.json was not produced by this protocol")
    stim = json.loads((d / "stimuli.json").read_text())
    raws = {
        key: json.loads((d / f"{key}.json").read_text()) for key in p.models
    }
    return p, report, stim, raws


def collect() -> dict[str, Any]:
    p, report, stim, raws = _load()
    k = np.array(stim["strata_k"])
    alts = np.array([coin_features(s)["alts"] for s in stim["groups"]["fair"]])
    rng = np.random.default_rng(p.eval_seed + 31)
    summaries = report["checkpoints"]
    extra = {
        key: {
            "upturn": upturn(raws[key], k, rng, p.bootstrap),
            "sensitivity": sensitivity(raws[key]),
            "readout": readout(raws[key], alts),
            "ok_wordings": sum(
                w["ok"] for w in summaries[key]["per_wording"].values()
            ),
        }
        for key in p.models
    }
    partial_pairs = {
        f"{base}->{post}": partial_drop(
            raws[base], raws[post], rng, p.bootstrap
        )
        for base, post in p.raw["paths"]["h8_pairs"]
    }
    h8_pairs = [tuple(pair) for pair in p.raw["paths"]["h8_pairs"]]
    diag = diagnostics_from_raws(
        raws,
        stim["groups"]["fair"],
        h8_pairs,
        seed=p.eval_seed + 37,
        n_boot=p.bootstrap,
    )
    return {
        "protocol": p,
        "report": report,
        "summaries": summaries,
        "extra": extra,
        "partial_pairs": partial_pairs,
        "diagnostics": diag,
        "followups": load_followups(p.sha),
        "stim": stim,
    }


def _stats(data: dict[str, Any]) -> dict[str, str]:
    p = data["protocol"]
    s = data["summaries"]
    x = data["extra"]
    v = data["report"]["verdicts"]
    out: dict[str, str] = {
        "sha": p.sha,
        "sha12": p.sha[:12],
        "sealed": p.raw["seal"]["sealed_at"],
        "seed_eval": str(p.eval_seed),
        "boot": f"{p.bootstrap:,}".replace(",", "{,}"),
        "n_fair": str(p.raw["stimuli"]["fair_count"]),
        "n_per_k": str(p.raw["stimuli"]["strata_per_k"]),
        "n_strata": str(len(data["stim"]["strata_k"])),
        "n_rigged": str(p.raw["stimuli"]["rigged_count"]),
        "n_models": str(len(p.models)),
        "h4/eligible": str(v["h4_counts"]["eligible"]),
        "h4/held": str(v["h4_counts"]["held"]),
        "h4/post": str(v["h4_counts"]["post_trained"]),
    }
    for key in p.models:
        c = s[key]
        u = x[key]["upturn"]
        out |= {
            f"{key}/template": signed(c["stated_template"][0]),
            f"{key}/template_ci": interval(*c["stated_template"][1:]),
            f"{key}/implicit_template": signed(c["implicit_template"][0]),
            f"{key}/agree": signed(c["stated_vs_implicit"][0]),
            f"{key}/agree_ci": interval(*c["stated_vs_implicit"][1:]),
            f"{key}/agree_hi": signed(c["stated_vs_implicit"][2], 3),
            f"{key}/alt_fair": plain(c["alternation_fair"], 3),
            f"{key}/alt_log": plain(c["alternation_log"], 3),
            f"{key}/coin": signed(c["coin_specific"], 3),
            f"{key}/fair_excess": signed(c["alternation_fair"] - 0.5, 3),
            f"{key}/log_excess": signed(c["alternation_log"] - 0.5, 3),
            f"{key}/mass": plain(c["ab_mass_median"]),
            f"{key}/vertex": plain(c["stated_curve"]["vertex"]),
            f"{key}/curv_lo": plain(c["stated_curve"]["curvature_lo"], 1),
            f"{key}/ok": str(x[key]["ok_wordings"]),
            f"{key}/upturn": signed(u["value"]),
            f"{key}/upturn_ci": interval(u["lo"], u["hi"]),
            f"{key}/lowest": plain(u["lowest_rate"]),
            f"{key}/end": f"{c['stated_curve']['means'][-1]:.4f}",
            f"{key}/stated_twin": signed(x[key]["readout"]["stated_twin"]),
            f"{key}/twin_implicit": signed(x[key]["readout"]["twin_implicit"]),
            f"{key}/twin_template": signed(x[key]["readout"]["twin_template"]),
            f"{key}/partial": signed(x[key]["readout"]["partial"]),
        }
        for w, pw in c["per_wording"].items():
            out[f"{key}/slope_{w}"] = signed(pw["slope_stated"])
            out[f"{key}/twin_{w}"] = signed(pw["slope_nonsense"])
        for name, sv in x[key]["sensitivity"].items():
            tag = name.split("_")[0]
            out[f"{key}/auc_stated_{tag}"] = plain(sv["stated"])
            out[f"{key}/auc_implicit_{tag}"] = plain(sv["implicit"])
    for pair, d in v["h8_pairs"].items():
        tag = pair.split("->")[1]
        out |= {
            f"h8/{tag}/base": signed(d["r_base"]),
            f"h8/{tag}/post": signed(d["r_post"]),
            f"h8/{tag}/diff": signed(d["diff"], 3),
            f"h8/{tag}/ci": interval(d["lo"], d["hi"], 3),
            f"h8/{tag}/hi": signed(d["hi"], 3),
        }
    for pair, d in data["partial_pairs"].items():
        tag = pair.split("->")[1]
        out |= {
            f"partial/{tag}/base": signed(d["base"]),
            f"partial/{tag}/post": signed(d["post"]),
            f"partial/{tag}/diff": signed(d["diff"]),
            f"partial/{tag}/ci": interval(d["lo"], d["hi"]),
        }
    out["partial/drops"] = str(
        sum(d["hi"] < 0 for d in data["partial_pairs"].values())
    )
    for path in ("olmo3_instruct", "olmo3_think"):
        base, _, dpo, final = p.raw["paths"][path]
        rise = s[final]["alternation_log"] - s[base]["alternation_log"]
        by_dpo = s[dpo]["alternation_log"] - s[base]["alternation_log"]
        out[f"h6/{path}/rise"] = signed(rise, 3)
        out[f"h6/{path}/dpo"] = signed(by_dpo, 3)
    olmo2 = p.raw["paths"]["olmo2"]
    out["h6/olmo2/rise"] = signed(
        s[olmo2[-1]]["alternation_log"] - s[olmo2[0]]["alternation_log"], 3
    )
    drops = [abs(d["diff"]) for d in v["h8_pairs"].values()]
    out["h8/drop_min"] = plain(min(drops))
    out["h8/drop_max"] = plain(max(drops))
    out["h8/margin"] = plain(
        min(-d["hi"] for d in v["h8_pairs"].values() if d["hi"] < 0), 3
    )
    out["h5/margin"] = plain(
        0.30 - s["qwen_instruct"]["stated_vs_implicit"][2], 3
    )
    out["olmo2/max_slope"] = plain(
        max(
            abs(w["slope_stated"])
            for key in p.raw["paths"]["olmo2"]
            for w in s[key]["per_wording"].values()
        )
    )
    out["mass/chat_min"] = plain(
        min(
            s[key]["ab_mass_median"]
            for key, m in p.models.items()
            if m.chat == "template"
        )
    )
    pilot = json.loads(PILOT.read_text())
    conds = pilot["ascii"]["qwen_instruct"]["conditions"]
    cross = pilot["ascii"]["qwen_instruct"]["cross"]
    for layout in ("packed", "spaced"):
        for probe in ("face", "zorp", "letter X"):
            tag = probe.split()[-1]
            c = conds[f"detect:{layout}/{probe}"]
            out[f"pilot/{layout}/{tag}/split"] = plain(c["split_r"])
            out[f"pilot/{layout}/{tag}/null"] = plain(c["perm_p95"])
        out[f"pilot/{layout}/cross"] = plain(cross[f"{layout}_face_vs_zorp"])
    return out


def _checkpoint_rows(data: dict[str, Any]) -> list[str]:
    s, x = data["summaries"], data["extra"]
    rows = []
    for key, label in LABELS.items():
        c = s[key]
        if key in FAMILY_BREAKS:
            rows.append(r"\midrule")
        rows.append(
            " & ".join(
                [
                    label,
                    f"{x[key]['ok_wordings']}/3",
                    signed(c["stated_template"][0]),
                    f"{signed(c['stated_vs_implicit'][0])} "
                    f"{interval(*c['stated_vs_implicit'][1:])}",
                    plain(c["alternation_fair"], 3),
                    plain(c["alternation_log"], 3),
                    signed(c["coin_specific"], 3),
                    plain(c["ab_mass_median"]),
                ]
            )
            + r" \\"
        )
    return rows


def _sensitivity_rows(data: dict[str, Any]) -> list[str]:
    x = data["extra"]
    rows = []
    for key, label in LABELS.items():
        if key in FAMILY_BREAKS:
            rows.append(r"\midrule")
        sv = x[key]["sensitivity"]
        cells = [label]
        for name in RIGGED:
            cells += [plain(sv[name]["stated"]), plain(sv[name]["implicit"])]
        rows.append(" & ".join(cells) + r" \\")
    return rows


def _readout_rows(data: dict[str, Any]) -> list[str]:
    s, x = data["summaries"], data["extra"]
    rows = []
    for key, label in LABELS.items():
        if key in FAMILY_BREAKS:
            rows.append(r"\midrule")
        ro = x[key]["readout"]
        cells = [
            label,
            signed(s[key]["stated_template"][0]),
            signed(ro["twin_template"]),
            signed(ro["stated_twin"]),
            signed(s[key]["stated_vs_implicit"][0]),
            signed(ro["twin_implicit"]),
            signed(ro["partial"]),
        ]
        rows.append(" & ".join(cells) + r" \\")
    return rows


def _model_rows(data: dict[str, Any]) -> list[str]:
    p = data["protocol"]
    mode = {"none": "raw text", "template": "chat", "think": "chat, thought"}
    rows = []
    for key, label in LABELS.items():
        if key in FAMILY_BREAKS:
            rows.append(r"\midrule")
        m = p.models[key]
        repo = m.repo.replace("_", r"\_")
        rows.append(
            f"{label} & \\texttt{{{repo}}} & "
            f"\\texttt{{{(m.revision or '')[:12]}}} & {mode[m.chat]} \\\\"
        )
    return rows


def _slope_rows(data: dict[str, Any]) -> list[str]:
    s, x = data["summaries"], data["extra"]
    rows = []
    for key, label in LABELS.items():
        if key in FAMILY_BREAKS:
            rows.append(r"\midrule")
        cells = [label]
        for pw in s[key]["per_wording"].values():
            mark = r"$^{*}$" if pw["ok"] else ""
            cells += [
                signed(pw["slope_stated"]) + mark,
                signed(pw["slope_nonsense"]),
            ]
        cells.append(f"{x[key]['ok_wordings']}/3")
        rows.append(" & ".join(cells) + r" \\")
    return rows


def _verdict_rows(data: dict[str, Any]) -> list[str]:
    s, x = data["summaries"], data["extra"]
    v = data["report"]["verdicts"]
    p = data["protocol"]
    qi, li = s["qwen_instruct"], s["llama_instruct"]
    rises = []
    for path in ("olmo3_instruct", "olmo3_think"):
        base, _, _, final = p.raw["paths"][path]
        rises.append(
            signed(s[final]["alternation_log"] - s[base]["alternation_log"], 3)
        )
    drops = sum(d["hi"] < 0 for d in v["h8_pairs"].values())
    rows = [
        (
            "H1",
            "Qwen Instruct gives a usable stated judgment",
            f"usable in {x['qwen_instruct']['ok_wordings']} of 3 wordings",
            "usable in $\\geq 2$ of 3",
            v["h1"],
        ),
        (
            "H2",
            "Qwen Instruct says streaky coins are rigged",
            f"$r$ = {signed(qi['stated_template'][0])} "
            f"{interval(*qi['stated_template'][1:])}",
            "$r \\leq -0.25$, upper $< -0.15$",
            v["h2"],
        ),
        (
            "H3",
            "Neither 3B base model is usable",
            f"Qwen {x['qwen_base']['ok_wordings']}/3, "
            f"Llama {x['llama_base']['ok_wordings']}/3 wordings",
            "neither usable",
            v["h3"],
        ),
        (
            "H4",
            "Extra switching is mostly generic repetition avoidance",
            f"{v['h4_counts']['held']} of {v['h4_counts']['eligible']} "
            "eligible checkpoints",
            "$\\geq 80\\%$ of $\\geq 5$ eligible",
            v["h4"],
        ),
        (
            "H5",
            "Post-trained stated scores do not track expectations",
            f"upper bounds {signed(qi['stated_vs_implicit'][2], 3)}, "
            f"{signed(li['stated_vs_implicit'][2], 3)}; Llama "
            f"$r$ = {signed(li['stated_vs_implicit'][0])}",
            "both upper $< 0.30$; Llama $r \\leq -0.15$, upper $< 0$",
            v["h5"],
        ),
        (
            "H6",
            "OLMo 3 gains repetition avoidance by DPO",
            f"rise {rises[0]} (Instruct), {rises[1]} (Think)",
            "rise $\\geq 0.05$ on both paths",
            v["h6"],
        ),
        (
            "H7",
            "Qwen Instruct's stated curve is human-like",
            f"vertex {plain(qi['stated_curve']['vertex'])}, curvature "
            f"lower bound {plain(qi['stated_curve']['curvature_lo'], 1)}",
            "vertex in [0.55, 0.70], curvature $> 0$",
            v["h7"],
        ),
        (
            "H8",
            "Post-training weakens say--expect agreement",
            f"{drops} of {len(v['h8_pairs'])} pairs",
            "CI below 0 in $\\geq 4$ of 5",
            v["h8"],
        ),
    ]
    return [
        " & ".join(
            [h, claim, measured, bar, "pass" if ok else r"\textbf{fail}"]
        )
        + r" \\"
        for h, claim, measured, bar, ok in rows
    ]


def _diag_stats(diag: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, prof in diag["checkpoints"].items():
        feats = prof["features"]
        ag = prof["agreements"]
        tl = prof["twin_links"]
        ci = prof["partial_ht_ci"]
        out |= {
            f"diag/{key}/says_first_h": signed(feats["says"]["first_h"]),
            f"diag/{key}/twin_first_h": signed(feats["twin"]["first_h"]),
            f"diag/{key}/exp_first_h": signed(feats["expects"]["first_h"]),
            f"diag/{key}/says_h_frac": signed(feats["says"]["h_frac"]),
            f"diag/{key}/twin_h_frac": signed(feats["twin"]["h_frac"]),
            f"diag/{key}/exp_h_frac": signed(feats["expects"]["h_frac"]),
            f"diag/{key}/says_imb": signed(feats["says"]["imbalance"]),
            f"diag/{key}/exp_imb": signed(feats["expects"]["imbalance"]),
            f"diag/{key}/partial_first_h": signed(ag["partial_first_h"]),
            f"diag/{key}/partial_ht": signed(ag["partial_ht"]),
            f"diag/{key}/partial_ht_ci": interval(ci[1], ci[2]),
            f"diag/{key}/partial_shape": signed(ag["partial_shape"]),
            f"diag/{key}/partial_ht_twin": signed(ag["partial_ht_twin"]),
            f"diag/{key}/stated_twin_ht": signed(tl["stated_twin_ht"]),
            f"diag/{key}/twin_expects_ht": signed(tl["twin_expects_ht"]),
        }
        wf = prof.get("wording_framing")
        if wf:
            for w in wf["wordings"]:
                for f in wf["framings"]:
                    out[f"wf/{key}/{w}_{f}"] = signed(wf["raw"][w][f])
                    out[f"wf_ht/{key}/{w}_{f}"] = signed(
                        wf["partial_ht"][w][f]
                    )
    for pair, kinds in diag["pairs"].items():
        tag = pair.split("->")[1]
        for kind, d in kinds.items():
            out |= {
                f"diag/{kind}/{tag}/base": signed(d["base"]),
                f"diag/{kind}/{tag}/post": signed(d["post"]),
                f"diag/{kind}/{tag}/diff": signed(d["diff"]),
                f"diag/{kind}/{tag}/ci": interval(d["lo"], d["hi"]),
            }
    out["diag/ht/drops"] = str(
        sum(d["ht"]["hi"] < 0 for d in diag["pairs"].values())
    )
    out["diag/first_h/drops"] = str(
        sum(d["first_h"]["hi"] < 0 for d in diag["pairs"].values())
    )
    return out


def _feature_rows(diag: dict[str, Any]) -> list[str]:
    rows = []
    for key, label in LABELS.items():
        if key in FAMILY_BREAKS:
            rows.append(r"\midrule")
        prof = diag["checkpoints"][key]
        f = prof["features"]
        ag = prof["agreements"]
        rows.append(
            " & ".join(
                [
                    label,
                    signed(f["says"]["first_h"]),
                    signed(f["twin"]["first_h"]),
                    signed(f["expects"]["first_h"]),
                    signed(f["says"]["h_frac"]),
                    signed(f["expects"]["imbalance"]),
                    signed(ag["partial_first_h"]),
                    signed(ag["partial_ht"]),
                ]
            )
            + r" \\"
        )
    return rows


def _symmetry_rows(diag: dict[str, Any]) -> list[str]:
    rows = []
    for pair, label in PAIR_LABELS.items():
        d_f = diag["pairs"][pair]["first_h"]
        d_ht = diag["pairs"][pair]["ht"]
        d_all = diag["pairs"][pair]["ht_twin"]
        rows.append(
            " & ".join(
                [
                    label,
                    f"{signed(d_f['diff'])} {interval(d_f['lo'], d_f['hi'])}",
                    f"{signed(d_ht['base'])} $\\to$ {signed(d_ht['post'])}",
                    f"{signed(d_ht['diff'])} "
                    f"{interval(d_ht['lo'], d_ht['hi'])}",
                    f"{signed(d_all['diff'])} "
                    f"{interval(d_all['lo'], d_all['hi'])}",
                ]
            )
            + r" \\"
        )
    return rows


def _wording_framing_rows(diag: dict[str, Any]) -> list[str]:
    rows = []
    for key in (
        "qwen_instruct",
        "olmo3_base",
        "olmo3_instruct",
        "olmo3_think",
    ):
        prof = diag["checkpoints"].get(key)
        if not prof or "wording_framing" not in prof:
            continue
        wf = prof["wording_framing"]
        rows.append(
            " & ".join(
                [
                    LABELS[key],
                    signed(wf["raw"]["w1"]["f1"]),
                    signed(wf["raw"]["w2"]["f2"]),
                    signed(wf["raw"]["w3"]["f3"]),
                    signed(wf["partial_ht"]["w1"]["f1"]),
                    signed(wf["partial_ht"]["w2"]["f2"]),
                    signed(wf["partial_ht"]["w3"]["f3"]),
                ]
            )
            + r" \\"
        )
    return rows


def write_diagnostics_artifacts(diag: dict[str, Any], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    dstats = _diag_stats(diag)
    (out / "numbers-diag.tex").write_text(
        "".join(f"\\statdef{{{k}}}{{{val}}}\n" for k, val in dstats.items())
    )
    (out / "features.tex").write_text("\n".join(_feature_rows(diag)))
    (out / "symmetry.tex").write_text("\n".join(_symmetry_rows(diag)))
    wf_rows = _wording_framing_rows(diag)
    if wf_rows:
        (out / "wording_framing.tex").write_text("\n".join(wf_rows))
    _write_csv(
        out / "symmetry.csv",
        ["idx", "label", "base", "post", "diff", "lo", "hi"],
        [
            [
                i,
                PAIR_LABELS[pair],
                d["ht"]["base"],
                d["ht"]["post"],
                d["ht"]["diff"],
                d["ht"]["lo"],
                d["ht"]["hi"],
            ]
            for i, (pair, d) in enumerate(reversed(diag["pairs"].items()))
        ],
    )


def export_diagnostics_paper(study_path: Path) -> Path:
    p = protocol()
    diag = diagnostics_from_study(
        study_path, seed=p.eval_seed + 37, n_boot=p.bootstrap
    )
    out = PAPER / "generated"
    write_diagnostics_artifacts(diag, out)
    print(f"wrote diagnostic paper tables to {out}", flush=True)
    return out


def export_paper() -> Path:
    data = collect()
    s = data["summaries"]
    v = data["report"]["verdicts"]
    out = PAPER / "generated"
    out.mkdir(parents=True, exist_ok=True)
    stats = _stats(data)
    (out / "numbers.tex").write_text(
        "".join(f"\\statdef{{{k}}}{{{val}}}\n" for k, val in stats.items())
    )
    write_diagnostics_artifacts(data["diagnostics"], out)
    (out / "checkpoints.tex").write_text("\n".join(_checkpoint_rows(data)))
    (out / "sensitivity.tex").write_text("\n".join(_sensitivity_rows(data)))
    (out / "verdicts.tex").write_text("\n".join(_verdict_rows(data)))
    (out / "slopes.tex").write_text("\n".join(_slope_rows(data)))
    (out / "readout.tex").write_text("\n".join(_readout_rows(data)))
    (out / "models.tex").write_text("\n".join(_model_rows(data)))
    _write_csv(
        out / "partial.csv",
        ["idx", "base", "post", "diff", "lo", "hi"],
        [
            [i, d["base"], d["post"], d["diff"], d["lo"], d["hi"]]
            for i, d in enumerate(reversed(data["partial_pairs"].values()))
        ],
    )
    rates = np.arange(16) / 15
    curve_keys = list(LABELS)
    _write_csv(
        out / "curves.csv",
        ["rate", *(key.replace("_", "") for key in curve_keys)],
        [
            [round(float(r), 4)]
            + [
                round(s[key]["stated_curve"]["means"][j], 4)
                for key in curve_keys
            ]
            for j, r in enumerate(rates)
        ],
    )
    _write_csv(
        out / "pairs.csv",
        ["idx", "label", "base", "post", "diff", "lo", "hi"],
        [
            [
                i,
                PAIR_LABELS[pair],
                d["r_base"],
                d["r_post"],
                d["diff"],
                d["lo"],
                d["hi"],
            ]
            for i, (pair, d) in enumerate(reversed(v["h8_pairs"].items()))
        ],
    )
    for panel, keys in STAGE_PANELS.items():
        _write_csv(
            out / f"stages-{panel}.csv",
            ["idx", "fair", "log"],
            [
                [i, s[key]["alternation_fair"], s[key]["alternation_log"]]
                for i, key in enumerate(keys)
            ],
        )
    print(f"wrote {out}", flush=True)
    return out
