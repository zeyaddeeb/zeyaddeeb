from bedside import known
from bedside.config import method

LUNG = "Non-Small Cell Lung Cancer"
BREAST = "Breast Cancer"
COLON = "Colorectal Cancer"


def registered() -> set[tuple[str, str, str, str]]:
    return {
        (p.cancer, p.drug_class, p.biomarker, p.expected)
        for p in known.derive(known.labels(), method()["classes"])
    }


def test_label_requirements_become_expected_directions():
    found = registered()

    assert (LUNG, "egfr_tki", "egfr_activating", "benefit") in found
    assert (LUNG, "checkpoint", "egfr_activating", "harm") in found
    assert (COLON, "egfr_antibody", "kras_nras", "harm") in found
    assert (BREAST, "cdk46", "erbb2_amp", "harm") in found


def test_requirements_owned_by_a_partner_do_not_count():
    found = {(c, k, b) for c, k, b, _ in registered()}

    assert (LUNG, "vegf", "egfr_activating") not in found
    assert (LUNG, "antimetabolite", "egfr_activating") not in found
    assert (COLON, "egfr_antibody", "braf_v600e") not in found
    assert (BREAST, "cdk46", "pik3ca") not in found


def test_unmeasured_requirements_make_no_pairs():
    assert not any(b == "brca" for _, _, b, _ in registered())


def test_a_drug_labeled_both_ways_points_nowhere():
    rows = [
        {"drug": "A", "cancer": BREAST, "positive": ["erbb2_amp"]},
        {"drug": "A", "cancer": BREAST, "negative": ["erbb2_amp"]},
        {"drug": "B", "cancer": "any", "positive": ["erbb2_amp"]},
    ]
    found = known.derive(rows, {"x": ["A", "B"]})

    assert [p.drugs for p in found if p.cancer == BREAST] == [("B",)]


def test_classes_whose_drugs_disagree_are_left_out():
    rows = [
        {"drug": "A", "cancer": LUNG, "positive": ["alk_fusion"]},
        {"drug": "B", "cancer": LUNG, "negative": ["alk_fusion"]},
    ]

    assert known.derive(rows, {"x": ["A", "B"]}) == []
