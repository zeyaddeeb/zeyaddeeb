from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.stats import norm


@dataclass(frozen=True)
class GhostStats:
    n: int
    split_r: float
    perm_p: float
    perm_p95: float
    score_mean: float
    score_std: float
    valid_rate: float


def zscore(values: np.ndarray) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float64)
    std = float(np.std(arr))
    if std < 1e-12:
        return np.zeros_like(arr)
    return (arr - float(np.mean(arr))) / std


def classification_image(
    stimuli: np.ndarray,
    scores: np.ndarray,
) -> np.ndarray:
    z = zscore(scores)
    return np.tensordot(z, stimuli.astype(np.float64), axes=(0, 0)) / len(z)


def pearson_r(a: np.ndarray, b: np.ndarray) -> float:
    fa = np.asarray(a, dtype=np.float64).ravel()
    fb = np.asarray(b, dtype=np.float64).ravel()
    sa = float(np.std(fa))
    sb = float(np.std(fb))
    if sa < 1e-12 or sb < 1e-12:
        return 0.0
    return float(np.corrcoef(fa, fb)[0, 1])


def split_half_stats(
    stimuli: np.ndarray,
    scores: np.ndarray,
    *,
    permutations: int = 2000,
    seed: int = 0,
    valid_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, GhostStats]:
    if valid_mask is None:
        valid_mask = np.isfinite(scores)
    valid_rate = float(np.mean(valid_mask))
    x = stimuli[valid_mask].astype(np.float64)
    s = np.asarray(scores[valid_mask], dtype=np.float64)
    n = len(s)
    if n < 4:
        empty = np.zeros(stimuli.shape[1:], dtype=np.float64)
        return (
            empty,
            empty,
            empty,
            GhostStats(n, 0.0, 1.0, 0.0, 0.0, 0.0, valid_rate),
        )

    full = classification_image(x, s)
    even_x, odd_x = x[0::2], x[1::2]
    even_s, odd_s = s[0::2], s[1::2]
    m = min(len(even_s), len(odd_s))
    even_x, odd_x = even_x[:m], odd_x[:m]
    even_s, odd_s = even_s[:m], odd_s[:m]

    g_even = classification_image(even_x, even_s)
    g_odd = classification_image(odd_x, odd_s)
    obs_r = pearson_r(g_even, g_odd)

    rng = np.random.default_rng(seed)
    z_even = zscore(even_s)
    z_odd = zscore(odd_s)
    flat_e = even_x.reshape(m, -1)
    flat_o = odd_x.reshape(m, -1)
    null_r = np.empty(permutations, dtype=np.float64)
    for p in range(permutations):
        pe = z_even[rng.permutation(m)]
        po = z_odd[rng.permutation(m)]
        ge = pe @ flat_e
        go = po @ flat_o
        null_r[p] = pearson_r(ge, go)

    p_val = float((1 + np.sum(null_r >= obs_r)) / (permutations + 1))
    p95 = float(np.quantile(null_r, 0.95))
    stats = GhostStats(
        n=n,
        split_r=obs_r,
        perm_p=p_val,
        perm_p95=p95,
        score_mean=float(np.mean(s)),
        score_std=float(np.std(s)),
        valid_rate=valid_rate,
    )
    return full, g_even, g_odd, stats


def sdt_metrics(
    hits: int,
    n_signal: int,
    false_alarms: int,
    n_noise: int,
) -> tuple[float, float, float, float]:
    h_rate = (hits + 0.5) / (n_signal + 1.0)
    fa_rate = (false_alarms + 0.5) / (n_noise + 1.0)
    zh = float(norm.ppf(h_rate))
    zfa = float(norm.ppf(fa_rate))
    d_prime = zh - zfa
    criterion = -0.5 * (zh + zfa)
    return (
        hits / max(n_signal, 1),
        false_alarms / max(n_noise, 1),
        d_prime,
        criterion,
    )


def bayesian_dirichlet_probs(
    symbols: list[str],
    alphabet: tuple[str, ...],
    alpha: float = 1.0,
) -> np.ndarray:
    k = len(alphabet)
    index = {sym: i for i, sym in enumerate(alphabet)}
    counts = np.full(k, alpha, dtype=np.float64)
    probs = np.empty((len(symbols), k), dtype=np.float64)
    for t, sym in enumerate(symbols):
        probs[t] = counts / float(np.sum(counts))
        counts[index[sym]] += 1.0
    return probs


def kl_to_uniform(probs: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(probs, dtype=np.float64), 1e-12, 1.0)
    p = p / np.sum(p, axis=-1, keepdims=True)
    k = p.shape[-1]
    return np.sum(p * (np.log(p) + np.log(k)), axis=-1)


def find_ngram_echoes(symbols: list[str], n: int = 3) -> list[int | None]:
    out: list[int | None] = [None] * len(symbols)
    seen: dict[tuple[str, ...], int] = {}
    for t in range(n, len(symbols)):
        ctx = tuple(symbols[t - n : t])
        if ctx in seen:
            out[t] = seen[ctx]
        seen[ctx] = t
    return out
