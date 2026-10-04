import json
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path

import numpy as np
import rerun as rr
import rerun.blueprint as rrb

from . import orbit
from .physics import unit_vectors
from .quadcube import Cube
from .tod import Housekeeping, Samples

APP = "how-cold-is-space"
RECORDING = "cobe-firas-1989"
SKY_R = 6.0
BEAM_HALF_DEG = 3.5
TIMELINE = "utc"
ORBIT_S = 103 * 60

CHARCOAL = (22, 22, 21)
PAPER = (245, 242, 233)
YELLOW = (226, 163, 58)
RED = (210, 89, 63)
BLUE = (109, 146, 201)


@dataclass(frozen=True)
class Marks:
    names: list[str]
    equatorial: np.ndarray


def _times(ns: np.ndarray) -> rr.TimeColumn:
    return rr.TimeColumn(TIMELINE, timestamp=ns.astype("datetime64[ns]"))


def thin(time_ns: np.ndarray, step_s: float) -> np.ndarray:
    bins = time_ns // int(step_s * 1e9)
    _, first = np.unique(bins, return_index=True)
    return first


def sphere(lat_n: int = 24, lon_n: int = 48):
    lat = np.linspace(-np.pi / 2, np.pi / 2, lat_n + 1)
    lon = np.linspace(0, 2 * np.pi, lon_n + 1)
    grid_lat, grid_lon = np.meshgrid(lat, lon, indexing="ij")
    verts = np.stack(
        [
            np.cos(grid_lat) * np.cos(grid_lon),
            np.cos(grid_lat) * np.sin(grid_lon),
            np.sin(grid_lat),
        ],
        axis=-1,
    ).reshape(-1, 3)
    tris = []
    w = lon_n + 1
    for i in range(lat_n):
        for j in range(lon_n):
            a = i * w + j
            tris.append([a, a + 1, a + w])
            tris.append([a + 1, a + w + 1, a + w])
    return verts, np.asarray(tris, dtype=np.uint32)


def cone(n: int = 48, length: float = SKY_R - 1.0) -> list[np.ndarray]:
    r = length * np.tan(np.radians(BEAM_HALF_DEG))
    a = np.linspace(0, 2 * np.pi, n + 1)
    rim = np.stack(
        [r * np.cos(a), r * np.sin(a), np.full_like(a, length)], axis=-1
    )
    rays = [np.array([[0, 0, 0], rim[k]]) for k in range(0, n, n // 4)]
    return [rim, *rays]


def quat_to(dirs: np.ndarray) -> np.ndarray:
    z = np.array([0.0, 0.0, 1.0])
    axis = np.cross(np.broadcast_to(z, dirs.shape), dirs)
    s = np.linalg.norm(axis, axis=1, keepdims=True)
    c = dirs @ z
    half = np.arctan2(s[:, 0], c) / 2
    axis = np.where(s > 1e-9, axis / np.maximum(s, 1e-12), [1.0, 0.0, 0.0])
    return np.c_[axis * np.sin(half)[:, None], np.cos(half)]


def coastlines(path: Path) -> list[np.ndarray]:
    data = json.loads(path.read_text())
    strips = []
    for feature in data["features"]:
        geom = feature["geometry"]
        parts = (
            [geom["coordinates"]]
            if geom["type"] == "LineString"
            else geom["coordinates"]
        )
        for part in parts:
            pts = np.asarray(part, dtype=np.float64)
            strips.append(1.003 * unit_vectors(pts[:, 0], pts[:, 1]))
    return strips


def _scene(since: rrb.TimeRangeBoundary) -> rrb.Spatial3DView:
    return rrb.Spatial3DView(
        name="COBE",
        origin="/",
        contents=["/earth/**", "/cobe/**", "/sky/**", "/sun/**"],
        background=[*CHARCOAL],
        line_grid=False,
        eye_controls=rrb.EyeControls3D(
            position=[3.0, -2.3, 1.25],
            look_target=[0.0, 0.0, 0.15],
            eye_up=[0.0, 0.0, 1.0],
        ),
        time_ranges=rrb.VisibleTimeRange(
            TIMELINE,
            start=since,
            end=rrb.TimeRangeBoundary.cursor_relative(),
        ),
    )


def blueprints() -> tuple[rrb.Blueprint, rrb.Blueprint]:
    locked = rrb.Blueprint(
        _scene(rrb.TimeRangeBoundary.cursor_relative(seconds=-ORBIT_S)),
        rrb.TimePanel(timeline=TIMELINE, play_state="paused"),
        collapse_panels=True,
    )
    full = rrb.Blueprint(
        rrb.Horizontal(
            _scene(rrb.TimeRangeBoundary.infinite()),
            rrb.Vertical(
                rrb.TimeSeriesView(
                    name="Heater and horns (K)",
                    origin="/temperatures",
                    axis_y=rrb.ScalarAxis(range=(2.70, 2.80), zoom_lock=False),
                    time_ranges=rrb.VisibleTimeRange(
                        TIMELINE,
                        start=rrb.TimeRangeBoundary.infinite(),
                        end=rrb.TimeRangeBoundary.infinite(),
                    ),
                ),
                rrb.BarChartView(
                    name="One sweep of the mirror", origin="/sweep"
                ),
            ),
            column_shares=[3, 2],
        ),
        rrb.TimePanel(timeline=TIMELINE, play_state="paused"),
        rrb.SelectionPanel(state="collapsed"),
        rrb.BlueprintPanel(state="collapsed"),
    )
    return locked, full


def write(
    out: Path,
    *,
    samples: Samples,
    house: Housekeeping | None,
    cube: Cube,
    cube_lines: tuple[list, list],
    coast: list[np.ndarray],
    marks: Marks,
    sweeps: dict[int, np.ndarray],
    anchors: np.ndarray,
    step_s: float = 600.0,
) -> None:
    rec = rr.RecordingStream(APP, recording_id=RECORDING)
    keep = np.union1d(thin(samples.time_ns, step_s), anchors[anchors >= 0])
    t = samples.time_ns[keep]
    los = samples.los[keep]
    pos = orbit.inertial(
        samples.lat[keep], samples.lon[keep], samples.altitude_km[keep], t
    )

    verts, tris = sphere()
    rec.log(
        "earth/globe",
        rr.Mesh3D(
            vertex_positions=verts,
            triangle_indices=tris,
            vertex_normals=verts,
            albedo_factor=[38, 38, 36, 255],
        ),
        static=True,
    )
    rec.log(
        "earth/coast",
        rr.LineStrips3D(coast, colors=[[*PAPER, 120]], radii=-0.6),
        static=True,
    )
    spin = thin(t, 1200.0)
    rec.send_columns(
        "earth",
        indexes=[_times(t[spin])],
        columns=rr.Transform3D.columns(
            quaternion=_spin(orbit.earth_angle(t[spin]))
        ),
    )

    rec.log(
        "cobe/body",
        rr.Points3D(
            [[0, 0, 0]], radii=0.05, colors=[[*YELLOW]], labels=["COBE"]
        ),
        static=True,
    )
    rec.log(
        "cobe/horn/beam",
        rr.LineStrips3D(cone(), colors=[[*YELLOW, 200]], radii=-1.0),
        static=True,
    )
    rec.send_columns(
        "cobe",
        indexes=[_times(t)],
        columns=rr.Transform3D.columns(translation=pos),
    )
    rec.send_columns(
        "cobe/horn",
        indexes=[_times(t)],
        columns=rr.Transform3D.columns(quaternion=quat_to(los)),
    )

    edges, grid = cube_lines
    rec.log(
        "sky/cube/edges",
        rr.LineStrips3D(
            [SKY_R * line for line in edges],
            colors=[[*PAPER, 120]],
            radii=-1.0,
        ),
        static=True,
    )
    rec.log(
        "sky/cube/grid",
        rr.LineStrips3D(
            [SKY_R * line for line in grid],
            colors=[[*PAPER, 40]],
            radii=-0.5,
        ),
        static=True,
    )
    trail = thin(samples.time_ns, 300.0)
    scan = trail[samples.sky[trail]]
    rec.log(
        "sky/scan",
        rr.Points3D.from_fields(radii=[-2.0], colors=[[*PAPER, 190]]),
        static=True,
    )
    rec.send_columns(
        "sky/scan",
        indexes=[_times(samples.time_ns[scan])],
        columns=rr.Points3D.columns(
            positions=0.995 * SKY_R * samples.los[scan]
        ),
    )
    rec.log(
        "sky/marks",
        rr.Points3D(
            0.98 * SKY_R * marks.equatorial,
            labels=marks.names,
            colors=[[*RED], [*BLUE], [*PAPER]],
            radii=-4.0,
        ),
        static=True,
    )

    days = thin(t, 86400.0)
    rec.log(
        "sun/ray",
        rr.Arrows3D(
            origins=[[1.35, 0, 0]],
            vectors=[[1.1, 0, 0]],
            colors=[[*YELLOW]],
            labels=["to the Sun"],
            radii=-1.5,
        ),
        static=True,
    )
    sun_dir = orbit.sun(t[days])
    rec.send_columns(
        "sun",
        indexes=[_times(t[days])],
        columns=rr.Transform3D.columns(quaternion=_quat_x(sun_dir)),
    )

    if house is not None:
        bins = thin(house.time_ns, 1800.0)
        edges = np.r_[bins, len(house.time_ns)]
        times = house.time_ns[bins]
        for name, values in [
            ("heater", house.ical),
            ("sky_horn", house.sky_horn),
            ("reference_horn", house.ref_horn),
        ]:
            med = np.array(
                [
                    np.nanmedian(values[a:b])
                    if np.isfinite(values[a:b]).any()
                    else np.nan
                    for a, b in pairwise(edges)
                ]
            )
            ok = np.isfinite(med)
            rec.send_columns(
                f"temperatures/{name}",
                indexes=[_times(times[ok])],
                columns=rr.Scalars.columns(scalars=med[ok]),
            )

    for row in sorted(sweeps, key=lambda i: samples.time_ns[i]):
        rec.set_time(
            TIMELINE,
            timestamp=np.datetime64(int(samples.time_ns[row]), "ns"),
        )
        rec.log(
            "sweep",
            rr.BarChart(sweeps[row].astype(np.int16), color=[*YELLOW]),
        )

    locked, _ = blueprints()
    out.parent.mkdir(parents=True, exist_ok=True)
    rr.save(str(out), default_blueprint=locked, recording=rec)


def save_blueprints(locked_path: Path, full_path: Path) -> None:
    locked, full = blueprints()
    locked.save(APP, str(locked_path))
    full.save(APP, str(full_path))


def _spin(angle: np.ndarray) -> np.ndarray:
    zero = np.zeros_like(angle)
    return np.c_[zero, zero, np.sin(angle / 2), np.cos(angle / 2)]


def _quat_x(dirs: np.ndarray) -> np.ndarray:
    x = np.array([1.0, 0.0, 0.0])
    axis = np.cross(np.broadcast_to(x, dirs.shape), dirs)
    s = np.linalg.norm(axis, axis=1, keepdims=True)
    c = dirs @ x
    half = np.arctan2(s[:, 0], c) / 2
    axis = np.where(s > 1e-9, axis / np.maximum(s, 1e-12), [0.0, 0.0, 1.0])
    return np.c_[axis * np.sin(half)[:, None], np.cos(half)]
