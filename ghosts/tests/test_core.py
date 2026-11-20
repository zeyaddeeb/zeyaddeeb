from __future__ import annotations

import itertools

import numpy as np

from ghosts.llama import extract_alphabet_probs, extract_log_odds
from ghosts.metrics import (
    bayesian_dirichlet_probs,
    classification_image,
    find_ngram_echoes,
    kl_to_uniform,
    pearson_r,
    sdt_metrics,
    split_half_stats,
)
from ghosts.randomness import strata_stream
from ghosts.rng import SplitMix64, seed_for
from ghosts.stimuli import (
    embed_ascii,
    fair_stream,
    noise_grid,
    noise_patch,
    patch_to_png_data_url,
    render_ascii,
    template_2d,
)


def test_splitmix64_determinism_and_balance() -> None:
    a = SplitMix64(seed_for(0, 42))
    b = SplitMix64(seed_for(0, 42))
    assert [a.next_u64() for _ in range(10)] == [
        b.next_u64() for _ in range(10)
    ]
    bits = SplitMix64(123).bits(4000)
    assert abs(float(np.mean(bits))) < 0.05


def test_stimuli_shapes_and_png() -> None:
    g = noise_grid(0, 5, size=9)
    assert g.shape == (9, 9)
    assert set(np.unique(g).tolist()) == {-1.0, 1.0}
    packed = render_ascii(g, spaced=False)
    spaced = render_ascii(g, spaced=True)
    assert len(packed.splitlines()) == 9
    assert len(packed.splitlines()[0]) == 9
    assert len(spaced.splitlines()[0]) == 17

    tpl = template_2d("x", 9)
    full = embed_ascii(0, 5, tpl, snr=1.0)
    assert np.array_equal(full, tpl)

    patch = noise_patch(0, 1, size=12)
    url = patch_to_png_data_url(patch, scale=4)
    assert url.startswith("data:image/png;base64,")


def test_reverse_correlation_recovers_template() -> None:
    tpl = template_2d("x", 9)
    stim = np.stack([noise_grid(7, i, 9) for i in range(600)])
    rng = np.random.default_rng(0)
    scores = np.tensordot(stim, tpl, axes=([1, 2], [0, 1])) + rng.normal(
        0, 2.0, size=600
    )
    full, _, _, st = split_half_stats(stim, scores, permutations=200, seed=1)
    assert pearson_r(full, tpl) > 0.85
    assert st.split_r > 0.70
    assert st.perm_p < 0.01

    rand_scores = rng.normal(0, 1, size=600)
    _, _, _, null_st = split_half_stats(
        stim, rand_scores, permutations=200, seed=2
    )
    assert abs(null_st.split_r) < 0.35


def test_log_odds_and_sdt_and_mirage() -> None:
    top = [
        {"token": "A", "logprob": -0.2},
        {"token": " B", "logprob": -2.2},
    ]
    lo, ok = extract_log_odds(top, ("A", " A"), ("B", " B"))
    assert ok
    assert abs(lo - 2.0) < 1e-6

    probs = extract_alphabet_probs(
        [{"token": "H", "logprob": -0.5}, {"token": "T", "logprob": -0.5}],
        ("H", "T"),
    )
    assert abs(probs[0] - 0.5) < 1e-6

    _, _, dp, c = sdt_metrics(90, 100, 10, 100)
    assert dp > 2.0
    assert abs(c) < 0.05

    stream = fair_stream(0, 0, 64, ("A", "B", "C", "D"))
    b = bayesian_dirichlet_probs(stream, ("A", "B", "C", "D"))
    kl = kl_to_uniform(b)
    assert kl[0] == 0.0
    assert float(np.mean(kl)) < 0.08

    echoes = find_ngram_echoes(["A", "B", "C", "D", "A", "B", "C", "A"], n=3)
    assert echoes[7] == 3
    assert classification_image(np.ones((4, 2, 2)), np.arange(4)).shape == (
        2,
        2,
    )


def test_strata_stream_has_exact_alternations() -> None:
    for k in range(16):
        for i in range(5):
            seq = strata_stream(0, k, i)
            assert len(seq) == 16
            flips = sum(a != b for a, b in itertools.pairwise(seq))
            assert flips == k
    assert strata_stream(0, 7, 3) == strata_stream(0, 7, 3)
    assert strata_stream(0, 7, 3) != strata_stream(0, 7, 4)
