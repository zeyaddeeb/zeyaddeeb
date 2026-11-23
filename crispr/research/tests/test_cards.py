import json

import pytest

from crispr_research import cards, referee
from crispr_research.kernels import gate, reach


def whole() -> dict:
    return {
        "kernel": "reach",
        "question": "Does cisplatin reach the centre of a 2 mm nodule?",
        "probe": {
            "diffusivity": 2.5e-10,
            "ic50": 6.2e-3,
            "concentration": 0.8,
            "dwell": 1800.0,
            "radius": 0.002,
        },
        "field": "core_mm",
        "op": "<",
        "value": 0.1,
        "chance": 0.2,
        "low": 1.0,
        "high": 1.9,
    }


def test_a_whole_card_compiles_and_seals_the_same_way_twice():
    card = cards.compile_card(whole())

    assert card.kernel == "reach"
    assert cards.seal(card) == cards.seal(cards.compile_card(whole()))


def test_a_changed_threshold_changes_the_seal():
    one = cards.compile_card(whole())
    other = cards.compile_card(whole() | {"value": 0.2})

    assert cards.seal(one) != cards.seal(other)


def test_an_unknown_field_is_refused_and_the_fields_are_named():
    raw = whole() | {"field": "cured"}

    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(raw)

    assert "no field cured" in str(refusal.value)
    assert "depth_mm" in str(refusal.value)


def test_every_named_referee_is_built():
    assert sorted(cards.BUILT) == sorted(cards.KERNELS)


def test_each_referee_declares_its_fields_and_probe():
    for kernel in cards.BUILT:
        assert cards.FIELDS[kernel]
        assert cards.PROBES[kernel]


def test_an_unknown_referee_lists_the_referees():
    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(whole() | {"kernel": "vibes"})

    assert "no vibes referee" in str(refusal.value)


def test_a_missing_probe_input_is_named():
    raw = whole()
    del raw["probe"]["dwell"]

    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(raw)

    assert "missing dwell" in str(refusal.value)


def test_an_extra_probe_input_is_refused():
    raw = whole()
    raw["probe"]["temperature"] = 43.0

    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(raw)

    assert "does not take temperature" in str(refusal.value)


def test_a_probability_outside_zero_to_one_is_refused():
    with pytest.raises(cards.Refused):
        cards.compile_card(whole() | {"chance": 1.4})


def test_a_backwards_interval_is_refused():
    with pytest.raises(cards.Refused):
        cards.compile_card(whole() | {"low": 2.0, "high": 1.0})


def test_a_stated_certainty_is_clamped_so_one_card_cannot_dominate():
    card = cards.compile_card(whole() | {"chance": 1.0})

    assert card.chance == cards.CEILING


def test_a_card_is_graded_against_the_reading_it_named():
    card = cards.compile_card(whole())
    fields = reach.probe(card.probe, gate.sink())
    verdict = referee.grade(card, fields)

    assert verdict.field == "core_mm"
    assert verdict.observed > 1.0
    assert not verdict.held


def test_skill_is_zero_when_the_reference_said_the_same_thing():
    card = cards.compile_card(whole())
    verdict = referee.Verdict("core_mm", "<", 0.1, 1.5, False)

    assert referee.skill(card, verdict, card.chance) == 0.0


def test_skill_is_positive_only_when_it_beats_the_reference():
    card = cards.compile_card(whole() | {"chance": 0.9})
    held = referee.Verdict("core_mm", "<", 0.1, 0.05, True)

    assert referee.skill(card, held, 0.5) > 0.0
    assert referee.skill(card, held, 0.95) < 0.0


def test_being_confidently_wrong_costs_more_than_being_unsure():
    sure = cards.compile_card(whole() | {"chance": 0.99})
    unsure = cards.compile_card(whole() | {"chance": 0.6})
    broken = referee.Verdict("core_mm", "<", 0.1, 1.5, False)

    assert referee.skill(sure, broken, 0.5) < referee.skill(
        unsure, broken, 0.5
    )


def test_a_missed_interval_scores_worse_than_a_covered_one():
    card = cards.compile_card(whole())

    assert referee.covered(card, 1.5)
    assert referee.interval(card, 1.5) < referee.interval(card, 4.0)


def test_the_sealed_statement_is_written_from_the_probe_not_the_question():
    raw = whole() | {"question": "Does an antibody at IC50 1.4e-6 get in?"}
    card = cards.compile_card(raw)
    stated = cards.describe(json.loads(cards.canonical(card)))

    assert stated.claim == "untouched core < 0.1 mm"
    assert stated.unit == "mm"
    assert stated.context == (
        "D 2.5e-10 m²/s · IC50 0.0062 mol/m³ · bath 0.8 mol/m³ · 30 min · "
        "2 mm nodule"
    )
    assert "1.4e-6" not in stated.context


def test_a_bet_on_a_settling_field_reads_as_yes_or_no():
    yes = cards.describe(
        {
            "kernel": "later",
            "field": "completed",
            "op": ">",
            "value": 0.0,
            "probe": {"trial": "NCT07411599"},
        }
    )
    never = cards.describe(
        {
            "kernel": "later",
            "field": "stopped",
            "op": ">",
            "value": 1.0,
            "probe": {"trial": "NCT07411599"},
        }
    )

    assert (yes.context, yes.claim) == ("NCT07411599", "completed: yes")
    assert never.claim == "stopped: never"


def test_a_bath_at_or_below_its_ic50_is_refused_before_sealing():
    raw = whole()
    raw["probe"]["concentration"] = 1e-3

    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(raw)

    assert "check the units" in str(refusal.value)


def test_later_only_takes_fields_that_settle():
    raw = {
        "kernel": "later",
        "question": "Is this trial still recruiting today?",
        "probe": {"trial": "NCT07411599"},
        "field": "recruiting",
        "op": "=",
        "value": 1,
        "chance": 0.8,
        "low": 0,
        "high": 1,
    }

    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(raw)

    assert "a lookup, not a forecast" in str(refusal.value)
    assert cards.compile_card(raw | {"field": "completed"}).field == (
        "completed"
    )


def test_the_later_probe_names_only_the_trial():
    raw = {
        "kernel": "later",
        "question": "Will this trial ever post its results?",
        "probe": {"trial": "NCT07411599", "field": "completed"},
        "field": "has_results",
        "op": "=",
        "value": 1,
        "chance": 0.5,
        "low": 0,
        "high": 1,
    }

    with pytest.raises(cards.Refused) as refusal:
        cards.compile_card(raw)

    assert "does not take field" in str(refusal.value)


@pytest.mark.parametrize(
    ("op", "value"),
    [(">=", 0.0), (">", 1.0), ("<", 0.0), ("<=", 1.0), ("=", 2.0)],
)
def test_tautological_binary_claims_are_refused(op, value):
    raw = {
        "kernel": "later",
        "question": "Will this trial complete eventually?",
        "probe": {"trial": "NCT07411599"},
        "field": "completed",
        "op": op,
        "value": value,
        "chance": 0.5,
        "low": 0,
        "high": 1,
    }

    with pytest.raises(cards.Refused, match="settled before the referee runs"):
        cards.compile_card(raw)


@pytest.mark.parametrize(
    ("patch",),
    [
        ({"field": "core_mm", "op": ">=", "value": 0.0},),
        ({"field": "core_mm", "op": "<", "value": 3.0},),
        ({"field": "touched", "op": "<=", "value": 1.0},),
        ({"field": "ratio", "op": ">", "value": 1.0},),
        ({"field": "lambda_mm", "op": ">", "value": 0.0},),
    ],
)
def test_bounded_field_tautologies_are_refused(patch):
    with pytest.raises(cards.Refused, match="field's bounds"):
        cards.compile_card(whole() | patch)


def test_malformed_trial_identifier_is_refused():
    raw = {
        "kernel": "later",
        "question": "Will this study complete eventually?",
        "probe": {"trial": "colorectal"},
        "field": "completed",
        "op": "=",
        "value": 1,
        "chance": 0.5,
        "low": 0,
        "high": 1,
    }

    with pytest.raises(cards.Refused, match="NCT followed by 8 digits"):
        cards.compile_card(raw)


def test_booleans_are_refused_as_numbers():
    with pytest.raises(cards.Refused, match="must be a number"):
        cards.compile_card(whole() | {"chance": True})

    raw = whole()
    raw["probe"]["dwell"] = True
    with pytest.raises(cards.Refused, match="must be a number"):
        cards.compile_card(raw)


def test_validate_probe_allows_exploratory_low_bath():
    raw = whole()["probe"] | {"concentration": 1e-4}
    found = cards.validate_probe("reach", raw)
    assert found["concentration"] == 1e-4
