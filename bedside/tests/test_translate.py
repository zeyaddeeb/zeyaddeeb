import numpy as np

from bedside import translate
from bedside.model import interaction

SETTINGS = {"draws": 400, "chains": 2, "target_accept": 0.95}


def test_verdicts_follow_the_bench_direction():
    assert translate._verdict(0.99, 0.97, confident=True) == "held up"
    assert translate._verdict(0.99, 0.02, confident=True) == "reversed"
    assert translate._verdict(0.01, 0.01, confident=True) == "held up"
    assert translate._verdict(0.01, 0.99, confident=True) == "reversed"
    assert translate._verdict(0.99, 0.70, confident=True) == "unresolved"
    assert translate._verdict(0.70, 0.99, confident=False) == "no call"


def test_label_genes_stay_out_of_the_headline():
    assert translate._primary("altered:TP53")
    assert not translate._primary("altered:EGFR")
    assert not translate._primary("egfr_activating")


def synthetic(slope: float, seed: int = 7) -> list[translate.Pair]:
    rng = np.random.default_rng(seed)
    found = []

    for i in range(120):
        truth = rng.normal(0, 0.6)
        patient = slope * truth + rng.normal(0, 0.1)
        found.append(
            translate.Pair(
                cancer="x",
                biomarker=f"altered:G{i}",
                drug_class=["a", "b", "c"][i % 3],
                bench_mean=truth + rng.normal(0, 0.2),
                bench_sd=0.2,
                bench_sensitizes=0.5,
                bench_confident=False,
                support="pan",
                lines=0,
                patient_mean=patient + rng.normal(0, 0.15),
                patient_sd=0.15,
                patient_benefit=0.5,
                marked=50,
                unmarked=500,
                verdict="no call",
                primary=True,
            )
        )

    return found


def g0_draws(slope: float) -> np.ndarray:
    model, _ = translate.build(synthetic(slope))
    trace = interaction.sample(model, SETTINGS, 3)

    return trace.posterior["g0"].values.ravel()


def test_recovers_a_planted_translation_slope():
    draws = g0_draws(0.5)

    assert (draws > 0).mean() > 0.95
    assert abs(np.median(draws) - 0.5) < 0.2


def test_no_planted_slope_stays_near_zero():
    draws = g0_draws(0.0)

    assert 0.025 < (draws > 0).mean() < 0.975
