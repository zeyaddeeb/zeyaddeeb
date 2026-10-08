from dataclasses import replace

import numpy as np

from bedside.model import interaction
from bedside.model.data import Pieces, _split, estimable

CUTS = [0, 30, 90, 180, 365, 100000]
SETTINGS = {"draws": 300, "chains": 2, "target_accept": 0.9}


def simulated(effect: float, seed: int = 5) -> Pieces:
    rng = np.random.default_rng(seed)
    size = 3000
    course_class = rng.integers(0, 3, size)
    marked = (rng.random(size) < 0.3).astype(int)
    log_rate = np.log([1 / 200, 1 / 90, 1 / 400])[course_class]
    log_rate = log_rate + 0.3 * marked + effect * marked * (course_class == 1)
    time = rng.exponential(1 / np.exp(log_rate))
    censor = rng.uniform(100, 1500, size)
    event = (time <= censor).astype(int)
    time = np.maximum(np.minimum(time, censor), 1.0)
    rows, interval, exposure, events = _split(time, event, CUTS)

    return Pieces(
        classes=["a", "b", "c"],
        course_class=course_class[rows],
        interval=interval,
        exposure=exposure,
        event=events,
        marked=marked[rows],
        prior=np.zeros(len(rows)),
        burden=np.zeros(len(rows)),
        counts={},
    )


def test_split_conserves_time_and_events():
    time = np.array([10.0, 100.0, 500.0])
    event = np.array([1, 0, 1])
    rows, _, exposure, events = _split(time, event, CUTS)

    totals = np.bincount(rows, weights=exposure)

    assert np.allclose(totals, time)
    assert events.sum() == 2


def test_recovers_a_planted_interaction():
    trace = interaction.sample(
        interaction.build(simulated(-0.8), adjust_burden=False), SETTINGS, 3
    )
    effect = interaction.contrast(interaction.interaction_draws(trace), 1)

    assert (effect < 0).mean() > 0.95
    assert abs(np.median(effect) + 0.8) < 0.35


def test_no_planted_interaction_stays_quiet():
    trace = interaction.sample(
        interaction.build(simulated(0.0), adjust_burden=False), SETTINGS, 3
    )
    draws = interaction.interaction_draws(trace)

    for index in range(len(draws)):
        effect = interaction.contrast(draws, index)

        assert 0.025 < (effect > 0).mean() < 0.975


def test_estimable_drops_thin_classes_and_reindexes():
    pieces = replace(
        simulated(0.0),
        counts={"a": (900, 100), "b": (10, 900), "c": (40, 30)},
    )
    kept = estimable(pieces, 15)

    assert kept.classes == ["a", "c"]
    assert set(kept.course_class.tolist()) == {0, 1}
    assert len(kept.event) == (pieces.course_class != 1).sum()
