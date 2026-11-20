from __future__ import annotations

import json

import numpy as np

from ghosts.jsonfmt import dumps
from ghosts.paper import partial_r, plain, signed, upturn


def test_partial_r_recovers_link_once_shared_part_is_removed() -> None:
    s = np.array([1.0, -1.0, 1.0, -1.0])
    z = np.array([1.0, 1.0, -1.0, -1.0])
    assert abs(partial_r(s, s + z, z) - 1.0) < 1e-12


def test_signed_and_plain_use_a_real_minus_and_drop_negative_zero() -> None:
    assert signed(-0.5) == "$-$0.50"
    assert signed(0.25) == "$+$0.25"
    assert signed(-0.0001) == "0.00"
    assert plain(-0.123, 3) == "$-$0.123"
    assert plain(0.0004, 3) == "0.000"


def test_upturn_measures_the_alternating_end_against_the_middle() -> None:
    k = np.repeat(np.arange(16), 4)
    scores = np.where(k == 15, 1.0, np.where(np.isin(k, (9, 10)), -1.0, 0.0))
    raw = {"stated": {"w1": {"strata": scores.tolist()}}}
    out = upturn(raw, k, np.random.default_rng(0), 200)
    assert out["value"] > 0
    assert out["lo"] <= out["value"] <= out["hi"]
    assert out["lowest_rate"] == 9 / 15


def test_json_format_keeps_data_and_wraps_long_number_lists() -> None:
    data = {
        "name": "zorp",
        "short": [1, 2, 3],
        "long": [round(i * 0.123456, 6) for i in range(60)],
        "nested": [{"a": None, "b": True}, []],
        "empty": {},
    }
    text = dumps(data)

    assert json.loads(text) == data
    assert '"short": [1, 2, 3]' in text
    assert all(len(line) <= 80 for line in text.splitlines())
    assert text.endswith("}\n")
