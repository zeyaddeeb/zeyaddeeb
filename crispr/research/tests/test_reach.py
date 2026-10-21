from crispr_research.kernels import gate, reach


def sphere() -> reach.Nodule:
    return reach.Nodule(radius=0.01)


def cavity(concentration: float = 0.8) -> reach.Cavity:
    return reach.Cavity(
        concentration=concentration, dwell=1800.0, clearance=gate.sink()
    )


def test_the_published_depths_are_reproduced_from_published_parameters():
    for row in gate.replication():
        assert row.inside, (
            f"{row.name} {row.observed:.4f} mm outside [{row.low}, {row.high}]"
        )


def test_every_closed_form_limit_holds():
    for check in gate.limits():
        assert check.held, f"{check.name}: {check.detail}"


def test_the_transient_matches_the_steady_state_once_the_front_settles():
    drug = gate.agents()["cisplatin"]
    length = reach.decay(drug, cavity())
    slab = reach.share_slab(drug, cavity(), length)

    assert abs(slab - 0.367879) < 1e-3


def test_a_sphere_reaches_further_than_a_slab_at_the_same_depth():
    drug = gate.agents()["cisplatin"]
    length = reach.decay(drug, cavity())
    curved = reach.share_sphere(sphere(), length, length)
    flat = reach.share_slab(drug, cavity(), length)

    assert curved > flat


def test_an_antibody_leaves_the_core_of_any_real_nodule_untreated():
    antibody = reach.Agent(
        name="antibody", weight=150_000.0, diffusivity=1e-11, ic50=1e-6
    )
    found = reach.reading(antibody, cavity(0.14), sphere())

    assert found["lambda_mm"] < 0.05
    assert found["core_mm"] > 9.0
    assert found["touched"] < 0.1


def test_a_cavity_below_the_killing_concentration_reaches_nothing():
    drug = gate.agents()["cisplatin"]
    weak = reach.Cavity(
        concentration=drug.ic50 / 2.0,
        dwell=1800.0,
        clearance=gate.sink(),
    )
    found = reach.reading(drug, weak, sphere())

    assert found["depth_mm"] == 0.0
    assert found["touched"] == 0.0


def test_the_reading_names_its_regime():
    found = reach.reading(gate.agents()["cisplatin"], cavity(), sphere())

    assert found["steady"] == 1.0
    assert found["damkohler"] > 3.0
    assert found["thiele"] > 1.0


def test_reach_does_not_score_until_a_measurement_gate_exists():
    report = gate.run()

    assert report["replicated"]
    assert report["limits_held"]
    assert not report["measured"]
    assert not report["scores"]


def test_the_measurement_gate_is_built_but_refuses_to_gate():
    rows = gate.depths()

    assert len(rows) >= 8
    assert gate.comparable() == []
    assert not gate.measured()

    report = gate.run()

    assert report["depths"] == len(rows)
    assert report["comparable"] == 0
    assert not report["scores"]


def test_every_harvested_depth_says_what_it_measured():
    for row in gate.depths():
        assert row["kind"] in ("primary", "secondary")
        assert row["criterion"]
        assert row["transport"]
        assert row["source"]
        assert row["why"]
