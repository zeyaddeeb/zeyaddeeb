import argparse
from pathlib import Path

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from scipy.spatial import cKDTree

from . import fetch, orbit, record, sky, tod
from .quadcube import PIXELS, face_lines
from .spectrum import write_module

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "cobe" / "data"
WWW = ROOT / "www" / "apps" / "www"
PUBLIC = WWW / "public" / "cobe"
SPECTRUM = WWW / "features" / "cobe" / "spectrum-data.ts"


def _equatorial(galactic: np.ndarray) -> np.ndarray:
    lon = np.degrees(np.arctan2(galactic[:, 1], galactic[:, 0]))
    lat = np.degrees(np.arcsin(np.clip(galactic[:, 2], -1, 1)))
    c = SkyCoord(l=lon * u.deg, b=lat * u.deg, frame="galactic").icrs
    return c.cartesian.xyz.value.T


def _has_time_ordered() -> bool:
    return all((DATA / s.name).exists() for s in fetch.TIME_ORDERED)


def build(scan: str, step_s: float) -> None:
    cube = sky.load_cube(DATA)
    use_tod = scan == "tod" or (scan == "auto" and _has_time_ordered())

    if use_tod:
        samples = tod.read_science(DATA / "fdq_sdf_ll.bin")
        house = tod.read_housekeeping(DATA / "fdq_eng.h5")
    else:
        samples = orbit.modeled()
        house = None
        nearest = cKDTree(cube.equatorial).query(samples.los)[1]
        samples = tod.Samples(**{**samples.__dict__, "pixel": nearest})

    coarse = tod.representative(samples, PIXELS, group=4)
    chosen = coarse[np.arange(PIXELS) // 4]
    seen = np.full(PIXELS, np.nan)
    has = chosen >= 0
    seen[has] = samples.time_ns[chosen[has]] / 1e9

    sweeps: dict[int, np.ndarray] = {}
    if use_tod:
        picked = coarse[coarse >= 0]
        waves = tod.read_sweeps(DATA / "fdq_sdf_ll.bin", samples.row[picked])
        sweeps = dict(zip(picked.tolist(), waves, strict=True))

    result = sky.build(DATA, cube, seen)
    sky.write(PUBLIC / "sky.bin", result)
    sky.backdrop(DATA, PUBLIC / "dirbe.webp")

    galactic = np.array([result.direction, -result.direction, [1.0, 0.0, 0.0]])
    marks = record.Marks(
        names=["Crater", "Pisces", "Center of the Milky Way"],
        equatorial=_equatorial(galactic),
    )
    record.write(
        PUBLIC / "firas.rrd",
        samples=samples,
        house=house,
        cube=cube,
        cube_lines=face_lines(str(DATA / "DIRBE_SKYMAP_INFO.FITS")),
        coast=record.coastlines(DATA / "ne_110m_coastline.geojson"),
        marks=marks,
        sweeps=sweeps,
        anchors=coarse,
        step_s=step_s,
    )
    record.save_blueprints(PUBLIC / "locked.rbl", PUBLIC / "recorder.rbl")
    write_module(DATA / "firas_monopole_spec_v1.txt", SPECTRUM)
    print(
        f"{'time-ordered' if use_tod else 'modeled'} scan, "
        f"{len(samples.time_ns)} samples, {int(has.sum())} pixels seen"
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="cobe")
    sub = parser.add_subparsers(dest="command", required=True)
    get = sub.add_parser("fetch", help="download the LAMBDA source files")
    get.add_argument(
        "--time-ordered",
        action="store_true",
        help="also download FIRAS time-ordered data (about 1.5 GB)",
    )
    make = sub.add_parser("build", help="write the sky data and recording")
    make.add_argument(
        "--scan",
        choices=["auto", "tod", "model"],
        default="auto",
        help="COBE's real time-ordered pointing, or a modeled orbit",
    )
    make.add_argument("--step", type=float, default=600.0)
    args = parser.parse_args()

    if args.command == "fetch":
        fetch.fetch(DATA, args.time_ordered)
    else:
        build(args.scan, args.step)
