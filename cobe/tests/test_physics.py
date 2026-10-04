import numpy as np
import pytest

from cobe import physics


def test_planck_peaks_at_the_firas_maximum():
    nu = physics.frequencies()
    b = physics.planck(nu, physics.T_CMB)
    assert b.max() == pytest.approx(383.5, abs=1.0)
    assert np.argmax(b) == 7


def test_slope_matches_a_finite_difference():
    nu = physics.frequencies()
    h = 1e-6
    numeric = (
        physics.planck(nu, physics.T_CMB + h)
        - physics.planck(nu, physics.T_CMB - h)
    ) / (2 * h)
    assert np.allclose(
        physics.planck_dt(nu, physics.T_CMB), numeric, rtol=1e-6
    )


def test_dipole_fit_recovers_a_known_sky():
    rng = np.random.default_rng(3)
    v = rng.normal(size=(4000, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    d = physics.unit_vectors(np.array([264.0]), np.array([48.0]))[0]
    temps = physics.T_CMB + 3.36e-3 * (v @ d)
    mono, amp, direction = physics.fit_dipole(v, temps)
    assert mono == pytest.approx(physics.T_CMB, abs=1e-9)
    assert amp == pytest.approx(3.36e-3, rel=1e-6)
    assert direction @ d == pytest.approx(1.0, abs=1e-9)


def test_speed_from_the_dipole():
    t = physics.T_CMB
    v = physics.speed_kms(t + 3.3621e-3, t - 3.3621e-3, 2.0)
    assert v == pytest.approx(369.8, abs=0.5)


def test_dust_leftover_is_zero_for_a_blackbody_shape():
    g = physics.planck_dt(physics.frequencies(), physics.T_CMB)
    sigma = np.ones_like(g)
    shift, left = physics.dust_leftover(g, physics.matched_weights(sigma))
    assert shift == pytest.approx(1.0)
    assert left == pytest.approx(0.0, abs=1e-12)
