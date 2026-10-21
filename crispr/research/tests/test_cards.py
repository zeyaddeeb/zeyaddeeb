import pytest

from crispr_research import cards, referee
from crispr_research.kernels import gate, reach


def whole() -> dict:
    return {
        "kernel": "reach",
        "question": "Does cisplatin reach the centre of a 2 mm nodule?",
        "probe": {
            "weight": 300.0,
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
