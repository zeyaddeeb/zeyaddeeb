import json
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

import h5py
import numpy as np

ADT_UNIX = 40587 * 864_000_000_000
TENTH_MRAD = 1e-4
SKY = 2
FINE_ATTITUDE = 4

ICAL = 3
SKY_HORN = 1
REF_HORN = 2
XCAL_TIP = 0


@dataclass(frozen=True)
class Samples:
    time_ns: np.ndarray
    pixel: np.ndarray
    los: np.ndarray
    lat: np.ndarray
    lon: np.ndarray
    altitude_km: np.ndarray
    sky: np.ndarray
    glitches: np.ndarray
    row: np.ndarray


@dataclass(frozen=True)
class Housekeeping:
    time_ns: np.ndarray
    ical: np.ndarray
    sky_horn: np.ndarray
    ref_horn: np.ndarray
    xcal: np.ndarray
    xcal_in: np.ndarray


def adt_to_ns(adt: np.ndarray) -> np.ndarray:
    return (adt.astype(np.int64) - ADT_UNIX) * 100


def _build(spec: dict) -> np.dtype:
    names, formats, offsets = [], [], []
    for name, f, off in spec["fields"]:
        names.append(name)
        offsets.append(off)
        if isinstance(f, dict):
            formats.append(_build(f))
        elif isinstance(f, list):
            formats.append((f[0], tuple(f[1])))
        else:
            formats.append(f)
    return np.dtype(
        {
            "names": names,
            "formats": formats,
            "offsets": offsets,
            "itemsize": spec["itemsize"],
        }
    )


def science_dtype() -> np.dtype:
    text = resources.files("cobe").joinpath("fdq_sdf.json").read_text()
    return _build(json.loads(text))


def read_science(path: Path) -> Samples:
    records = np.memmap(path, dtype=science_dtype(), mode="r")
    when = records["collect_time"]
    att = records["attitude"]
    good = (
        (when["badtime_flag"] == 0)
        & (att["solution"] >= FINE_ATTITUDE)
        & (att["pixel_no"] >= 0)
        & (when["midpoint_time"] > 0)
    )
    idx = np.flatnonzero(good)
    order = idx[np.argsort(when["midpoint_time"][idx], kind="stable")]
    att = att[order]
    los = np.asarray(att["equatorial"], dtype=np.float64)
    los /= np.linalg.norm(los, axis=1, keepdims=True)

    return Samples(
        time_ns=adt_to_ns(records["collect_time"]["midpoint_time"][order]),
        pixel=np.asarray(att["pixel_no"], dtype=np.int64),
        los=los,
        lat=att["terr_latitude"].astype(np.float64) * TENTH_MRAD,
        lon=att["terr_longitude"].astype(np.float64) * TENTH_MRAD,
        altitude_km=att["altitude"].astype(np.float64) / 10,
        sky=np.asarray(records["dq_data"]["xcal_pos"][order]) == SKY,
        glitches=np.asarray(records["sci_head"]["sc_head21"][order]),
        row=order,
    )


def read_sweeps(path: Path, rows: np.ndarray) -> np.ndarray:
    records = np.memmap(path, dtype=science_dtype(), mode="r")
    return np.asarray(records["ifg_data"]["ifg"][rows], dtype=np.int16)


def read_housekeeping(path: Path) -> Housekeeping:
    with h5py.File(path, "r") as h:
        data = h["fdq_eng"]
        time = adt_to_ns(data.fields("ct_head")[:]["time"])
        grt = np.asarray(data.fields("en_analog")[:]["grt"], dtype=np.float64)
        pos = np.asarray(data.fields("en_xcal")[:]["pos"])

    lo = grt[:, :16]
    order = np.argsort(time, kind="stable")

    return Housekeeping(
        time_ns=time[order],
        ical=_kelvin(lo[order, ICAL]),
        sky_horn=_kelvin(lo[order, SKY_HORN]),
        ref_horn=_kelvin(lo[order, REF_HORN]),
        xcal=_kelvin(lo[order, XCAL_TIP]),
        xcal_in=pos[order, 0] == 1,
    )


def _kelvin(values: np.ndarray) -> np.ndarray:
    return np.where((values > 0) & (values < 30), values, np.nan)


def representative(
    samples: Samples, pixels: int, group: int = 1
) -> np.ndarray:
    pixels //= group
    chosen = np.full(pixels, -1, dtype=np.int64)
    sky = np.flatnonzero(samples.sky & (samples.pixel >= 0))
    by_pixel = samples.pixel[sky] // group
    order = np.argsort(by_pixel, kind="stable")
    sorted_pixels = by_pixel[order]
    starts = np.searchsorted(sorted_pixels, np.arange(pixels), "left")
    ends = np.searchsorted(sorted_pixels, np.arange(pixels), "right")
    for p in range(pixels):
        if ends[p] > starts[p]:
            members = sky[order[starts[p] : ends[p]]]
            chosen[p] = members[len(members) // 2]
    return chosen
