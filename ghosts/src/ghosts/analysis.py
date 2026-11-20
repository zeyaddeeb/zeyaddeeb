from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from ghosts.metrics import (
    pearson_r,
    sdt_metrics,
    split_half_stats,
)
from ghosts.protocol import Protocol, load
from ghosts.stimuli import (
    binary_patch,
    coin_features,
    fair_stream,
    noise_grid,
)
from ghosts.study import RUNS, run_dir


def _boot_ci(
    values: np.ndarray,
    *,
    n_boot: int,
    seed: int,
) -> tuple[float, float, float]:
    rng = np.random.default_rng(seed)
    n = len(values)
    idx = rng.integers(0, n, size=(n_boot, n))
    means = np.mean(values[idx], axis=1)
    return (
        float(np.mean(values)),
        float(np.quantile(means, 0.025)),
        float(np.quantile(means, 0.975)),
    )


def _boot_corr_ci(
    a: np.ndarray,
    b: np.ndarray,
    *,
    n_boot: int,
    seed: int,
) -> tuple[float, float, float]:
    rng = np.random.default_rng(seed)
    n = len(a)
    obs = pearson_r(a, b)
    out = np.empty(n_boot, dtype=np.float64)
    for i in range(n_boot):
        idx = rng.integers(0, n, size=n)
        out[i] = pearson_r(a[idx], b[idx])
    return (
        obs,
        float(np.quantile(out, 0.025)),
        float(np.quantile(out, 0.975)),
    )


def _boot_corr_diff_ci(
    s1: np.ndarray,
    s2: np.ndarray,
    feat: np.ndarray,
    *,
    n_boot: int,
    seed: int,
) -> tuple[float, float, float]:
    rng = np.random.default_rng(seed)
    n = len(feat)
    obs = pearson_r(s1, feat) - pearson_r(s2, feat)
    out = np.empty(n_boot, dtype=np.float64)
    for i in range(n_boot):
        idx = rng.integers(0, n, size=n)
        f = feat[idx]
        out[i] = pearson_r(s1[idx], f) - pearson_r(s2[idx], f)
    return (
        obs,
        float(np.quantile(out, 0.025)),
        float(np.quantile(out, 0.975)),
    )


def analyze_ascii(raw: dict[str, Any], p: Protocol) -> dict[str, Any]:
    seed = int(raw["seed"])
    count = int(raw["count"])
    size = int(raw["size"])
    stim = np.stack([noise_grid(seed, i, size) for i in range(count)])
    out: dict[str, Any] = {}
    for mkey, mdata in raw["models"].items():
        ghosts: dict[str, np.ndarray] = {}
        stats: dict[str, Any] = {}
        for section in ("detect", "pairs"):
            for ckey, entry in mdata[section].items():
                sc = np.array(entry["scores"], dtype=np.float64)
                full, even, odd, st = split_half_stats(
                    stim, sc, permutations=p.permutations, seed=seed
                )
                ghosts[f"{section}:{ckey}"] = full
                stats[f"{section}:{ckey}"] = {
                    **asdict(st),
                    "ghost": np.round(full, 4).tolist(),
                    "ghost_even": np.round(even, 4).tolist(),
                    "ghost_odd": np.round(odd, 4).tolist(),
                    "corner_00": round(float(full[0, 0]), 4),
                    "corner_01": round(float(full[0, 1]), 4),
                }
        cross = {
            "packed_face_vs_zorp": round(
                pearson_r(
                    ghosts["detect:packed/face"], ghosts["detect:packed/zorp"]
                ),
                4,
            ),
            "spaced_face_vs_zorp": round(
                pearson_r(
                    ghosts["detect:spaced/face"], ghosts["detect:spaced/zorp"]
                ),
                4,
            ),
            "packed_face_vs_x": round(
                pearson_r(
                    ghosts["detect:packed/face"],
                    ghosts["detect:packed/letter X"],
                ),
                4,
            ),
            "packed_vs_spaced_face": round(
                pearson_r(
                    ghosts["detect:packed/face"], ghosts["detect:spaced/face"]
                ),
                4,
            ),
        }
        out[mkey] = {"conditions": stats, "cross": cross}
    return out


def analyze_vision(raw: dict[str, Any], p: Protocol) -> dict[str, Any]:
    seed = int(raw["seed"])
    b_cnt = int(raw["binary_count"])
    b_sz = int(raw["binary_size"])
    s_cnt = int(raw["spatial_count"])
    s_sz = int(raw["spatial_size"])
    b_stim = np.stack([binary_patch(seed, i, b_sz) for i in range(b_cnt)])
    s_stim = np.stack([binary_patch(seed, i, s_sz) for i in range(s_cnt)])

    b_scores: dict[str, np.ndarray] = {}
    b_stats: dict[str, Any] = {}
    for k, entry in raw["binary"].items():
        sc = np.array(entry["scores"], dtype=np.float64)
        b_scores[k] = sc
        full, even, odd, st = split_half_stats(
            b_stim, sc, permutations=p.permutations, seed=seed
        )
        b_stats[k] = {
            **asdict(st),
            "ghost": np.round(full, 4).tolist(),
            "ghost_even": np.round(even, 4).tolist(),
            "ghost_odd": np.round(odd, 4).tolist(),
        }

    k_xo = "the letter X vs the letter O"
    k_fx = "a human face vs the letter X"
    k_fo = "a human face vs the letter O"
    k_zb = "a zorp vs a blarg"

    r_xo_fx, lo_xo_fx, hi_xo_fx = _boot_corr_ci(
        b_scores[k_xo], b_scores[k_fx], n_boot=p.bootstrap, seed=seed + 1
    )
    r_xo_zb, lo_xo_zb, hi_xo_zb = _boot_corr_ci(
        b_scores[k_xo], b_scores[k_zb], n_boot=p.bootstrap, seed=seed + 2
    )
    r_fx_zb, _, _ = _boot_corr_ci(
        b_scores[k_fx], b_scores[k_zb], n_boot=p.bootstrap, seed=seed + 3
    )
    r_fo_zb, _, _ = _boot_corr_ci(
        b_scores[k_fo], b_scores[k_zb], n_boot=p.bootstrap, seed=seed + 4
    )
    std_ratio = float(
        np.std(b_scores[k_xo]) / max(float(np.std(b_scores[k_zb])), 1e-9)
    )

    inv = np.array(raw["polarity_inverted_x_vs_o"], dtype=np.float64)
    pol_r, pol_lo, pol_hi = _boot_corr_ci(
        b_scores[k_xo][: len(inv)], inv, n_boot=p.bootstrap, seed=seed + 5
    )

    s_stats: dict[str, Any] = {}
    for k, entry in raw["spatial"].items():
        sc = np.array(entry["scores"], dtype=np.float64)
        full, even, odd, st = split_half_stats(
            s_stim, sc, permutations=p.permutations, seed=seed + 10
        )
        s_stats[k] = {
            **asdict(st),
            "ghost": np.round(full, 4).tolist(),
            "ghost_even": np.round(even, 4).tolist(),
            "ghost_odd": np.round(odd, 4).tolist(),
        }

    return {
        "binary": b_stats,
        "binary_consistency": {
            "corr_xo_fx": round(r_xo_fx, 4),
            "corr_xo_fx_ci": [round(lo_xo_fx, 4), round(hi_xo_fx, 4)],
            "corr_xo_zb": round(r_xo_zb, 4),
            "corr_xo_zb_ci": [round(lo_xo_zb, 4), round(hi_xo_zb, 4)],
            "corr_fx_zb": round(r_fx_zb, 4),
            "corr_fo_zb": round(r_fo_zb, 4),
            "std_ratio_xo_vs_zb": round(std_ratio, 3),
            "polarity_r": round(pol_r, 4),
            "polarity_ci": [round(pol_lo, 4), round(pol_hi, 4)],
        },
        "spatial": s_stats,
    }


def analyze_coins(raw: dict[str, Any], p: Protocol) -> dict[str, Any]:
    seed = int(raw["seed"])
    fair_n = int(raw["fair_count"])
    sdt_n = int(raw["sdt_count"])
    length = int(raw["length"])
    seqs = [fair_stream(seed, i, length, ("H", "T")) for i in range(fair_n)]
    feats = [coin_features(s) for s in seqs]
    feat_arrays = {
        k: np.array([f[k] for f in feats], dtype=np.float64) for k in feats[0]
    }

    models_out: dict[str, Any] = {}
    neutral_scores: dict[str, np.ndarray] = {}
    for mkey, mdata in raw["models"].items():
        fair_out: dict[str, Any] = {}
        for framing, entry in mdata["fair"].items():
            sc = np.array(entry["scores"], dtype=np.float64)
            fa_ind = (sc > 0).astype(np.float64)
            fa_mean, fa_lo, fa_hi = _boot_ci(
                fa_ind, n_boot=p.bootstrap, seed=seed + 20
            )
            fair_out[framing] = {
                "n": len(sc),
                "mean": round(float(np.mean(sc)), 4),
                "std": round(float(np.std(sc)), 4),
                "fa_rate": round(fa_mean, 4),
                "fa_ci": [round(fa_lo, 4), round(fa_hi, 4)],
                "valid_rate": entry["valid_rate"],
            }
            if framing == "neutral":
                neutral_scores[mkey] = sc

        sc_n = neutral_scores[mkey]
        corr_out: dict[str, Any] = {}
        for fname, farr in feat_arrays.items():
            r, lo, hi = _boot_corr_ci(
                sc_n, farr, n_boot=p.bootstrap, seed=seed + 30
            )
            corr_out[fname] = {
                "r": round(r, 4),
                "ci": [round(lo, 4), round(hi, 4)],
            }

        sdt_out: dict[str, Any] = {}
        fa_sdt = int(np.sum(sc_n[:sdt_n] > 0))
        for rname, rentry in mdata["rigged"].items():
            rsc = np.array(rentry["scores"], dtype=np.float64)
            hits = int(np.sum(rsc > 0))
            hr, far, dp, crit = sdt_metrics(hits, len(rsc), fa_sdt, sdt_n)
            sdt_out[rname] = {
                "hit_rate": round(hr, 4),
                "fa_rate": round(far, 4),
                "d_prime": round(dp, 4),
                "criterion_c": round(crit, 4),
                "mean_score": round(float(np.mean(rsc)), 4),
            }

        all_rigged = np.concatenate(
            [
                np.array(e["scores"], dtype=np.float64)
                for e in mdata["rigged"].values()
            ]
        )
        pooled_hits = int(np.sum(all_rigged > 0))
        hr, far, dp, crit = sdt_metrics(
            pooled_hits, len(all_rigged), int(np.sum(sc_n > 0)), len(sc_n)
        )
        sdt_out["pooled"] = {
            "hit_rate": round(hr, 4),
            "fa_rate": round(far, 4),
            "d_prime": round(dp, 4),
            "criterion_c": round(crit, 4),
        }

        models_out[mkey] = {
            "fair": fair_out,
            "feature_corrs": corr_out,
            "sdt": sdt_out,
        }

    q_fa_diff = (neutral_scores["qwen_instruct"] > 0).astype(np.float64) - (
        neutral_scores["qwen_base"] > 0
    ).astype(np.float64)
    l_fa_diff = (neutral_scores["llama_instruct"] > 0).astype(np.float64) - (
        neutral_scores["llama_base"] > 0
    ).astype(np.float64)
    qd_m, qd_lo, qd_hi = _boot_ci(
        q_fa_diff, n_boot=p.bootstrap, seed=seed + 40
    )
    ld_m, ld_lo, ld_hi = _boot_ci(
        l_fa_diff, n_boot=p.bootstrap, seed=seed + 41
    )
    alt_diff, alt_lo, alt_hi = _boot_corr_diff_ci(
        neutral_scores["qwen_instruct"],
        neutral_scores["llama_instruct"],
        feat_arrays["alts"],
        n_boot=p.bootstrap,
        seed=seed + 42,
    )

    return {
        "models": models_out,
        "comparisons": {
            "qwen_fa_diff": round(qd_m, 4),
            "qwen_fa_diff_ci": [round(qd_lo, 4), round(qd_hi, 4)],
            "llama_fa_diff": round(ld_m, 4),
            "llama_fa_diff_ci": [round(ld_lo, 4), round(ld_hi, 4)],
            "alt_corr_qwen_minus_llama": round(alt_diff, 4),
            "alt_corr_diff_ci": [round(alt_lo, 4), round(alt_hi, 4)],
        },
    }


def analyze_mirage(raw: dict[str, Any], p: Protocol) -> dict[str, Any]:
    seed = int(raw["seed"])
    warm = int(raw["warmup"])
    bayes_means: dict[str, float] = {}
    for akey, streams in raw["bayes"].items():
        per_s = np.array(
            [np.mean(s[warm:]) for s in streams], dtype=np.float64
        )
        bayes_means[akey] = round(float(np.mean(per_s)), 5)

    models_out: dict[str, Any] = {}
    stream_kls: dict[tuple[str, str], np.ndarray] = {}
    for mkey, mdata in raw["models"].items():
        models_out[mkey] = {}
        for akey, aentry in mdata.items():
            streams = aentry["streams"]
            per_s = np.array(
                [np.mean(s["kl"][warm:]) for s in streams], dtype=np.float64
            )
            stream_kls[(mkey, akey)] = per_s
            kl_m, kl_lo, kl_hi = _boot_ci(
                per_s, n_boot=p.bootstrap, seed=seed + 50
            )
            mp_s = np.array(
                [np.mean(s["max_p"][warm:]) for s in streams], dtype=np.float64
            )
            echo_kl: list[float] = []
            non_echo_kl: list[float] = []
            echo_p: list[float] = []
            for s in streams:
                for t in range(warm, len(s["kl"])):
                    if s["echo_p"][t] is not None:
                        echo_kl.append(s["kl"][t])
                        echo_p.append(s["echo_p"][t])
                    else:
                        non_echo_kl.append(s["kl"][t])
            models_out[mkey][akey] = {
                "mean_kl": round(kl_m, 4),
                "kl_ci": [round(kl_lo, 4), round(kl_hi, 4)],
                "ratio_to_bayes": round(
                    kl_m / max(bayes_means[akey], 1e-9), 2
                ),
                "mean_max_p": round(float(np.mean(mp_s)), 4),
                "mean_kl_echo": round(float(np.mean(echo_kl)), 4)
                if echo_kl
                else 0.0,
                "mean_kl_non_echo": round(float(np.mean(non_echo_kl)), 4)
                if non_echo_kl
                else 0.0,
                "mean_echo_p": round(float(np.mean(echo_p)), 4)
                if echo_p
                else 0.0,
            }

    q_diff = (
        stream_kls[("qwen_instruct", "ABCD")]
        - stream_kls[("qwen_base", "ABCD")]
    )
    l_diff = (
        stream_kls[("llama_instruct", "ABCD")]
        - stream_kls[("llama_base", "ABCD")]
    )
    qd, qd_lo, qd_hi = _boot_ci(q_diff, n_boot=p.bootstrap, seed=seed + 60)
    ld, ld_lo, ld_hi = _boot_ci(l_diff, n_boot=p.bootstrap, seed=seed + 61)
    qw_diff = (
        stream_kls[("qwen_instruct", "WKMZ")]
        - stream_kls[("qwen_base", "WKMZ")]
    )
    lw_diff = (
        stream_kls[("llama_instruct", "WKMZ")]
        - stream_kls[("llama_base", "WKMZ")]
    )
    qwd, qwd_lo, qwd_hi = _boot_ci(qw_diff, n_boot=p.bootstrap, seed=seed + 62)
    lwd, lwd_lo, lwd_hi = _boot_ci(lw_diff, n_boot=p.bootstrap, seed=seed + 63)

    return {
        "bayes_mean_kl": bayes_means,
        "models": models_out,
        "comparisons": {
            "qwen_abcd_diff": round(qd, 4),
            "qwen_abcd_diff_ci": [round(qd_lo, 4), round(qd_hi, 4)],
            "llama_abcd_diff": round(ld, 4),
            "llama_abcd_diff_ci": [round(ld_lo, 4), round(ld_hi, 4)],
            "qwen_wkmz_diff": round(qwd, 4),
            "qwen_wkmz_diff_ci": [round(qwd_lo, 4), round(qwd_hi, 4)],
            "llama_wkmz_diff": round(lwd, 4),
            "llama_wkmz_diff_ci": [round(lwd_lo, 4), round(lwd_hi, 4)],
        },
    }


def score_hypotheses(
    ascii_res: dict[str, Any],
    vision_res: dict[str, Any],
    coins_res: dict[str, Any],
    mirage_res: dict[str, Any],
) -> dict[str, Any]:
    qi = ascii_res["qwen_instruct"]
    h1 = (
        qi["cross"]["packed_face_vs_zorp"] >= 0.80
        and qi["cross"]["spaced_face_vs_zorp"] >= 0.80
        and qi["conditions"]["detect:packed/face"]["split_r"] >= 0.40
        and qi["conditions"]["detect:spaced/face"]["split_r"] >= 0.40
    )

    vc = vision_res["binary_consistency"]
    h2 = (
        vc["corr_xo_fx"] <= -0.75
        and vc["corr_xo_fx_ci"][1] <= -0.70
        and vc["std_ratio_xo_vs_zb"] >= 4.0
        and abs(vc["corr_xo_zb"]) <= 0.15
    )

    k_lr = (
        "a bright white vertical bar on the left half vs "
        "a bright white vertical bar on the right half"
    )
    k_szb = (
        "a bright white zorp on a dark background vs "
        "a bright white blarg on a dark background"
    )
    sp_lr = vision_res["spatial"][k_lr]
    sp_zb = vision_res["spatial"][k_szb]
    h3 = (
        sp_lr["split_r"] >= 0.40
        and sp_lr["perm_p"] <= 0.005
        and sp_lr["split_r"] > sp_zb["split_r"]
    )

    cc = coins_res["comparisons"]
    h4 = (
        cc["qwen_fa_diff"] >= 0.50
        and cc["qwen_fa_diff_ci"][0] > 0.0
        and cc["llama_fa_diff"] >= 0.50
        and cc["llama_fa_diff_ci"][0] > 0.0
    )

    q_alt = coins_res["models"]["qwen_instruct"]["feature_corrs"]["alts"]["r"]
    l_alt = coins_res["models"]["llama_instruct"]["feature_corrs"]["alts"]["r"]
    h5 = q_alt <= -0.30 and l_alt >= 0.25 and cc["alt_corr_diff_ci"][1] < 0.0

    b_abcd = mirage_res["bayes_mean_kl"]["ABCD"]
    all_5x = all(
        mirage_res["models"][m]["ABCD"]["mean_kl"] >= 5.0 * b_abcd
        for m in ("qwen_base", "qwen_instruct", "llama_base", "llama_instruct")
    )
    mc = mirage_res["comparisons"]
    h6 = (
        all_5x
        and mc["qwen_abcd_diff_ci"][0] > 0.0
        and mc["llama_abcd_diff_ci"][0] > 0.0
    )

    return {
        "pass": {
            "h1": bool(h1),
            "h2": bool(h2),
            "h3": bool(h3),
            "h4": bool(h4),
            "h5": bool(h5),
            "h6": bool(h6),
        },
        "summary": {
            "h1_packed_face_zorp": qi["cross"]["packed_face_vs_zorp"],
            "h1_spaced_face_zorp": qi["cross"]["spaced_face_vs_zorp"],
            "h1_packed_face_r": qi["conditions"]["detect:packed/face"][
                "split_r"
            ],
            "h1_spaced_face_r": qi["conditions"]["detect:spaced/face"][
                "split_r"
            ],
            "h2_corr_xo_fx": vc["corr_xo_fx"],
            "h2_corr_xo_fx_ci": vc["corr_xo_fx_ci"],
            "h2_std_ratio": vc["std_ratio_xo_vs_zb"],
            "h2_corr_xo_zb": vc["corr_xo_zb"],
            "h3_lr_split_r": round(sp_lr["split_r"], 4),
            "h3_lr_perm_p": round(sp_lr["perm_p"], 4),
            "h3_zb_split_r": round(sp_zb["split_r"], 4),
            "h4_qwen_fa_diff": cc["qwen_fa_diff"],
            "h4_llama_fa_diff": cc["llama_fa_diff"],
            "h5_qwen_alt_r": q_alt,
            "h5_llama_alt_r": l_alt,
            "h5_diff_ci": cc["alt_corr_diff_ci"],
            "h6_bayes_abcd": b_abcd,
            "h6_qwen_abcd_diff": mc["qwen_abcd_diff"],
            "h6_llama_abcd_diff": mc["llama_abcd_diff"],
        },
    }


def analyze_all(p: Protocol | None = None) -> Path:
    proto = p or load()
    d = run_dir(proto)
    ascii_raw = json.loads((d / "ascii.json").read_text())
    vision_raw = json.loads((d / "vision.json").read_text())
    coins_raw = json.loads((d / "coins.json").read_text())
    mirage_raw = json.loads((d / "mirage.json").read_text())

    ascii_res = analyze_ascii(ascii_raw, proto)
    vision_res = analyze_vision(vision_raw, proto)
    coins_res = analyze_coins(coins_raw, proto)
    mirage_res = analyze_mirage(mirage_raw, proto)
    verdicts = score_hypotheses(ascii_res, vision_res, coins_res, mirage_res)

    report = {
        "protocol": proto.sha,
        "seed": proto.eval_seed,
        "verdicts": verdicts,
        "ascii": ascii_res,
        "vision": vision_res,
        "coins": coins_res,
        "mirage": mirage_res,
    }
    out = RUNS / f"{proto.sha[:12]}.report.json"
    out.write_text(json.dumps(report, indent=1))
    print(json.dumps(verdicts, indent=2), flush=True)
    print(out, flush=True)
    return out
