from __future__ import annotations

import hashlib

import numpy as np

from ghosts.coinstudy import protocol
from ghosts.diagnostics import (
    coin_diagnostic_features,
    coins_from_hex,
    feature_profile,
    multi_partial_r,
    residualize,
    wording_framing_matrix,
)
from ghosts.followup import parse_choice
from ghosts.protocol import ROOT


def test_sealed_files_match_protocol_hashes() -> None:
    p = protocol()
    assert p.sha.startswith("3447c2d0127c")
    for entry in p.raw["seal"]["code"]:
        path = ROOT / entry["path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == entry["sha256"], f"sealed file modified: {entry['path']}"


def test_residualize_and_multi_partial_r_remove_confound() -> None:
    rng = np.random.default_rng(7)
    n = 400
    first_h = rng.integers(0, 2, size=n).astype(np.float64)
    h_frac = np.clip(0.5 + 0.1 * first_h + rng.normal(0, 0.1, size=n), 0, 1)
    true_signal = rng.normal(0, 1, size=n)
    says = -2.0 * first_h + 0.5 * true_signal + rng.normal(0, 0.2, size=n)
    expects = 2.0 * first_h + 0.5 * true_signal + rng.normal(0, 0.2, size=n)

    raw_r = float(np.corrcoef(says, expects)[0, 1])
    clean_r = multi_partial_r(says, expects, [first_h, h_frac])
    assert raw_r < -0.5
    assert clean_r > 0.7
    assert abs(float(np.corrcoef(residualize(says, [first_h]), first_h)[0, 1])) < 1e-10


def test_coin_diagnostic_features_and_profile() -> None:
    seqs = coins_from_hex("ffff0000aaaa5555")
    feats = coin_diagnostic_features(seqs)
    assert feats["first_h"].tolist() == [1.0, 0.0, 1.0, 0.0]
    assert feats["last_h"].tolist() == [1.0, 0.0, 0.0, 1.0]
    assert feats["h_frac"].tolist() == [1.0, 0.0, 0.5, 0.5]
    assert feats["imbalance"].tolist() == [1.0, 1.0, 0.0, 0.0]
    assert feats["switches"].tolist() == [0.0, 0.0, 1.0, 1.0]

    says = np.array([2.0, -2.0, 0.5, -0.5])
    expects = np.array([0.8, -0.8, 2.2, -2.2])
    twin = np.array([-2.0, 2.0, -0.1, 0.1])
    prof = feature_profile(says, expects, twin, feats)
    assert prof["features"]["says"]["first_h"] > 0.85
    assert prof["agreements"]["raw"] > 0.5
    assert prof["agreements"]["partial_first_h"] < -0.9


def test_wording_framing_matrix_shape_and_keys() -> None:
    rng = np.random.default_rng(11)
    seqs = [["H" if b else "T" for b in row] for row in rng.integers(0, 2, (40, 16))]
    feats = coin_diagnostic_features(seqs)
    raw = {
        "stated": {
            f"w{i}": {"fair": rng.normal(0, 1, 40).tolist()} for i in (1, 2, 3)
        },
        "implicit": {
            f"f{i}": {"fair": rng.normal(0, 1, 40).tolist()} for i in (1, 2, 3)
        },
    }
    wf = wording_framing_matrix(raw, feats)
    assert wf["wordings"] == ["w1", "w2", "w3"]
    assert wf["framings"] == ["f1", "f2", "f3"]
    assert set(wf["raw"]["w2"]) == {"f1", "f2", "f3"}
    assert -1.0 <= wf["partial_ht"]["w2"]["f2"] <= 1.0


def test_parse_choice_handles_think_blocks_and_formats() -> None:
    assert parse_choice("<think>Let me count runs.</think>\n\nA") == "A"
    assert parse_choice("<think>looks fair</think> B)") == "B"
    assert parse_choice("Answer: B.") == "B"
    assert parse_choice("<think>still thinking without answer") is None
