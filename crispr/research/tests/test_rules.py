import pytest

from crispr_research.agent import rules
from crispr_research.agent.rules import Layer, Rules, Standing


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


def test_a_reverted_method_change_is_not_tried_again():
    reverted = Rules(
        version=2,
        layer="method",
        parent=1,
        lines=[],
        standing=Standing.REVERTED.value,
        because="tried shortening method",
        tried=["add", "Always check the last three episodes", ""],
    )

    with pytest.raises(rules.Refused, match="reverted"):
        rules.apply(
            Layer.METHOD,
            [],
            {
                "change": "add",
                "text": "Always check the last three episodes",
                "because": "trying again",
            },
            [reverted],
        )
