import pytest

from research.agent import rules
from research.agent.rules import Layer, Rules, Standing


def lost(change: str, text: str, was: str = "", p: float = 0.4) -> Rules:
    return Rules(
        version=2,
        layer="playbook",
        parent=1,
        lines=[],
        standing=Standing.LOST.value,
        because="it looked promising",
        gain=-0.1,
        p=p,
        tried=[change, text, was],
    )


def test_the_exact_sign_test_counts_every_relabeling():
    assert rules.sign_flip([1.0]) == 0.5
    assert rules.sign_flip([1.0, 1.0]) == 0.25
    assert rules.sign_flip([1.0, 1.0, 1.0]) == 0.125
    assert rules.sign_flip([1.0] * 4) == 0.0625
    assert rules.sign_flip([]) == 1.0


def test_three_pairs_can_never_reach_the_threshold():
    best = rules.verdict([rules.Pair("spare", 0.0, 1.0) for _ in range(3)])

    assert best.gain > 0
    assert best.p > rules.ALPHA
    assert not best.kept


def test_four_unanimous_pairs_are_enough():
    found = rules.verdict([rules.Pair("spare", 0.0, 1.0) for _ in range(4)])

    assert found.kept
    assert found.p <= rules.ALPHA


def test_a_positive_mean_is_required_as_well_as_a_small_p():
    losing = rules.verdict([rules.Pair("spare", 1.0, 0.0) for _ in range(5)])

    assert not losing.kept
    assert losing.gain < 0


def test_a_rule_about_the_score_is_refused():
    with pytest.raises(rules.Refused) as refusal:
        rules.apply(
            Layer.PLAYBOOK,
            [],
            {
                "change": "add",
                "text": "Chase the highest reward",
                "because": "x",
            },
            [],
        )

    assert "not about the score" in str(refusal.value)


def test_a_change_without_a_reason_is_refused():
    with pytest.raises(rules.Refused) as refusal:
        rules.apply(
            Layer.PLAYBOOK,
            [],
            {"change": "add", "text": "Look at the sink first"},
            [],
        )

    assert "Say why" in str(refusal.value)


def test_a_duplicate_rule_is_refused():
    with pytest.raises(rules.Refused):
        rules.apply(
            Layer.PLAYBOOK,
            ["Look at the sink first"],
            {
                "change": "add",
                "text": "look at the SINK first",
                "because": "x",
            },
            [],
        )


def test_adding_past_the_limit_is_refused():
    full = [f"Rule number {n} about how to work" for n in range(6)]

    with pytest.raises(rules.Refused) as refusal:
        rules.apply(
            Layer.PLAYBOOK,
            full,
            {"change": "add", "text": "One more rule to try", "because": "x"},
            [],
        )

    assert "limit" in str(refusal.value)


def test_a_change_that_already_lost_is_not_tried_again():
    with pytest.raises(rules.Refused) as refusal:
        rules.apply(
            Layer.PLAYBOOK,
            [],
            {
                "change": "add",
                "text": "Start with the smallest nodule",
                "because": "x",
            },
            [lost("add", "Start with the smallest nodule")],
        )

    assert "lost" in str(refusal.value)
    assert "0.40" in str(refusal.value)


def test_a_different_change_is_still_allowed():
    found, because = rules.apply(
        Layer.PLAYBOOK,
        [],
        {
            "change": "add",
            "text": "Start with the largest nodule",
            "because": "y",
        },
        [lost("add", "Start with the smallest nodule")],
    )

    assert found == ["Start with the largest nodule"]
    assert because == "y"


def test_a_rule_number_outside_the_range_is_named():
    with pytest.raises(rules.Refused) as refusal:
        rules.apply(
            Layer.PLAYBOOK,
            ["Only one rule here, written out"],
            {"change": "drop", "rule": 4, "because": "x"},
            [],
        )

    assert "1 to 1" in str(refusal.value)


def test_pairs_alternate_which_version_goes_first():
    assert rules.next_run(1, 2, None, 0) == (None, 1)
    assert rules.next_run(1, 2, None, 1) == (None, 2)


def test_the_second_half_runs_the_other_version_on_the_same_front():
    half = rules.Half(front="spare", version=1, reward=0.3, episode=7)

    assert rules.next_run(1, 2, half, 0) == ("spare", 2)


def test_with_no_challenger_the_champion_just_runs():
    assert rules.next_run(3, 0, None, 5) == (None, 3)


def test_a_pair_is_only_made_from_the_same_front_and_two_versions():
    half, pair = rules.settle(None, "spare", 1, 0.2, episode=1, champion=1)

    assert pair is None
    assert half is not None

    half, pair = rules.settle(half, "reach", 2, 0.5, episode=2, champion=1)

    assert pair is None

    half, pair = rules.settle(half, "reach", 1, 0.1, episode=3, champion=1)

    assert pair is not None
    assert pair.champion == 0.1
    assert pair.challenger == 0.5
    assert half is None
