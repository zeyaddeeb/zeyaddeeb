import pytest

from crispr_research.kernels import gate, kill, later, matter


def test_the_dependency_gate_separates_known_essentials_from_controls():
    if not kill.ready():
        pytest.skip("the dependency pack has not been built")

    found = gate.kill_gate()

    assert found["ran"]
    assert found["auroc"] >= 0.95
    assert found["median_essential"] <= -0.5
    assert found["control_noise"] <= 0.05
    assert found["passed"]


def test_a_ribosomal_gene_is_needed_and_a_control_gene_is_not():
    if not kill.ready():
        pytest.skip("the dependency pack has not been built")

    needed = kill.reading("RPL3", "all")
    spare = kill.reading("ABCG8", "all")

    assert needed.fields["median"] < -1.0
    assert needed.fields["share_essential"] > 0.9
    assert spare.fields["median"] > -0.2
    assert spare.fields["share_essential"] < 0.1


def test_the_peritoneal_stratum_is_refused_by_name():
    assert "peritoneal" not in kill.STRATA


def test_a_bet_on_a_trial_that_has_not_reported_is_left_open():
    found = later.reading("NCT07411599", "2026-10-21")

    if found.ungraded:
        pytest.skip("the registry did not answer")

    assert found.fields["known"] == 0.0
    assert later.open_bet("has_results", found.fields)
    assert not later.open_bet("recruiting", found.fields)


def test_a_settled_trial_can_be_graded():
    found = later.reading("NCT00002527", "2026-10-21")

    if found.ungraded:
        pytest.skip("the registry did not answer")

    assert found.fields["known"] == 1.0
    assert found.fields["completed"] == 1.0
    assert not later.open_bet("completed", found.fields)


def test_the_patient_gate_sees_a_known_effect_and_stays_quiet_otherwise():
    if not matter.ready():
        pytest.skip("the patient data is not on this machine")

    found = gate.matter_gate()

    assert found["ran"]
    assert found["known"]["ratio"] >= 2.0
    assert found["known"]["p"] <= 1e-3
    assert found["control"]["quiet"]
    assert found["passed"]


def test_a_thin_patient_comparison_is_refused_not_guessed():
    if not matter.ready():
        pytest.skip("the patient data is not on this machine")

    found = matter.reading("parp", "abdominal")

    assert found.ungraded is not None or found.fields["exposed_courses"] >= 15


def test_matter_only_compares_groups_it_is_allowed_to_name():
    assert matter.SPLITS == ("abdominal", "msi")
