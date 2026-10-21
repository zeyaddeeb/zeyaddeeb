import pytest

from crispr_research import alpha, calibration


def test_the_budget_starts_small_and_never_exceeds_the_target():
    ledger = alpha.Ledger()

    assert 0 < ledger.budget() < alpha.TARGET

    for _ in range(50):
        budget, _ = ledger.spend(1.0)

        assert 0 < budget <= alpha.TARGET


def test_the_budget_shrinks_while_nothing_is_found():
    ledger = alpha.Ledger()
    first = ledger.budget()
    ledger.spend(1.0)
    ledger.spend(1.0)

    assert ledger.budget() < first
    assert ledger.rejected == 0


def test_a_rejection_earns_wealth_back():
    lucky = alpha.Ledger()
    lucky.spend(1e-9)
    after_find = lucky.budget()

    quiet = alpha.Ledger()
    quiet.spend(1.0)

    assert after_find > quiet.budget()
    assert lucky.rejected == 1


def test_a_weak_p_is_not_a_discovery():
    ledger = alpha.Ledger()
    _, rejected = ledger.spend(0.2)

    assert not rejected
    assert ledger.rejected == 0


def test_an_always_on_agent_cannot_farm_discoveries():
    ledger = alpha.Ledger()
    found = sum(ledger.spend(0.04)[1] for _ in range(200))

    assert found <= 2, "a steady drip of p = 0.04 must not keep paying out"


def test_a_perfect_forecaster_is_well_calibrated():
    said = [0.1] * 50 + [0.9] * 50
    happened = [0] * 45 + [1] * 5 + [1] * 45 + [0] * 5
    found = calibration.report(said, happened)

    assert found.enough
    assert found.reliability < 0.005
    assert found.resolution > 0.1
    assert abs(found.z) < 2


def test_always_saying_one_half_has_no_resolution():
    said = [0.5] * 60
    happened = [1, 0] * 30
    found = calibration.report(said, happened)

    assert found.reliability < 0.01
    assert found.resolution < 0.01, "hedging must not look like skill"


def test_a_timid_forecaster_shows_the_other_sign():
    said = [0.55] * 60
    happened = [1] * 54 + [0] * 6
    found = calibration.report(said, happened)

    assert found.z < -2, "a negative Z is the too-cautious direction"


def test_confident_and_wrong_shows_up_as_bad_reliability():
    said = [0.95] * 60
    happened = [0] * 60
    found = calibration.report(said, happened)

    assert found.reliability > 0.8
    assert found.z > 2, "a positive Z is the overconfident direction"


def test_nothing_is_published_below_the_floor():
    found = calibration.report([0.6] * 10, [1] * 10)

    assert not found.enough
    assert found.cards == 10


def test_the_decomposition_adds_up_to_the_brier_score():
    said = [0.2, 0.4, 0.6, 0.8] * 20
    happened = [0, 1, 0, 1] * 20
    found = calibration.report(said, happened)

    assert found.brier == pytest.approx(
        found.reliability - found.resolution + found.uncertainty, abs=1e-9
    )
