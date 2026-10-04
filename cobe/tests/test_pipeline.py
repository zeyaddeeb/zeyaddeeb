from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits

from cobe import fetch, orbit, physics, quadcube, record, tod

DATA = Path(__file__).resolve().parents[1] / "data"


def has(*names: str) -> bool:
    return all((DATA / n).exists() for n in names)


def test_every_source_is_pinned():
    for source in fetch.SOURCES + fetch.TIME_ORDERED:
        assert len(source.sha256) == 64
        assert source.size > 0


def test_science_records_are_1536_bytes():
    assert tod.science_dtype().itemsize == 1536


def test_adt_time_zero_is_1858():
    assert tod.adt_to_ns(np.array([tod.ADT_UNIX // 100 * 100]))[0] == 0


def test_quaternions_turn_z_onto_the_target():
    rng = np.random.default_rng(1)
    dirs = rng.normal(size=(64, 3))
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    q = record.quat_to(dirs)
    x, y, z, w = q.T
    zx = 2 * (x * z + w * y)
    zy = 2 * (y * z - w * x)
    zz = 1 - 2 * (x * x + y * y)
    assert np.allclose(np.c_[zx, zy, zz], dirs, atol=1e-9)


def test_thinning_keeps_one_sample_per_bin():
    t = np.arange(0, 3_600_000_000_000, 10_000_000_000)
    kept = record.thin(t, 600.0)
    assert len(kept) == 6
    assert kept[0] == 0


def test_modeled_scan_looks_away_from_the_sun():
    s = orbit.modeled(step_s=3600.0)
    sun = orbit.sun(s.time_ns)
    assert np.abs((s.los * sun).sum(1)).max() < 1e-9
    assert s.altitude_km[0] == orbit.ALTITUDE_KM


@pytest.mark.skipif(
    not has("DIRBE_SKYMAP_INFO.FITS", "FIRAS_TEMPERATURE_MAP_LOWF.FITS"),
    reason="LAMBDA files not downloaded",
)
def test_cube_pixels_line_up_with_firas():
    cube = quadcube.load(str(DATA / "DIRBE_SKYMAP_INFO.FITS"))
    with fits.open(DATA / "FIRAS_TEMPERATURE_MAP_LOWF.FITS") as hdul:
        t = hdul[1].data
        pixels = np.asarray(t["PIXEL"], dtype=np.int64)
        v = physics.unit_vectors(t["GAL_LON"], t["GAL_LAT"])
    gap = np.degrees(
        np.arccos(np.clip((cube.galactic[pixels] * v).sum(1), -1, 1))
    )
    assert np.median(gap) < 0.5
    corners = cube.corners.mean(1)
    corners /= np.linalg.norm(corners, axis=1, keepdims=True)
    assert (corners * cube.equatorial).sum(1).min() > np.cos(np.radians(0.1))


@pytest.mark.skipif(
    not has("fdq_sdf_ll.bin", "DIRBE_SKYMAP_INFO.FITS"),
    reason="FIRAS time-ordered data not downloaded",
)
def test_time_ordered_pointing_matches_its_pixels():
    s = tod.read_science(DATA / "fdq_sdf_ll.bin")
    cube = quadcube.load(str(DATA / "DIRBE_SKYMAP_INFO.FITS"))
    sample = slice(None, None, 97)
    gap = np.degrees(
        np.arccos(
            np.clip(
                (cube.equatorial[s.pixel[sample]] * s.los[sample]).sum(1),
                -1,
                1,
            )
        )
    )
    assert len(s.time_ns) == 567325
    assert np.all(np.diff(s.time_ns) >= 0)
    assert np.percentile(gap, 99) < 2.5
    assert 880 < np.median(s.altitude_km) < 920
