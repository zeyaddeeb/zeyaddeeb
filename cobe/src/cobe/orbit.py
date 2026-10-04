from datetime import UTC, datetime

import numpy as np

from .tod import Samples

EARTH_KM = 6371.0
DAY_NS = 86_400_000_000_000
J2000_NS = int(datetime(2000, 1, 1, 12, tzinfo=UTC).timestamp()) * 10**9
OBLIQUITY = np.radians(23.4393)
LAUNCH = datetime(1989, 11, 18, 14, 34, tzinfo=UTC)
FIRST_LIGHT = datetime(1989, 11, 20, 15, 0, tzinfo=UTC)
HELIUM_OUT = datetime(1990, 9, 21, 0, 0, tzinfo=UTC)
ALTITUDE_KM = 900.0
INCLINATION = np.radians(99.0)
PERIOD_MIN = 103.0


def earth_angle(time_ns: np.ndarray) -> np.ndarray:
    days = (np.asarray(time_ns, dtype=np.float64) - J2000_NS) / DAY_NS
    turns = 0.7790572732640 + 1.00273781191135448 * days
    return 2 * np.pi * np.mod(turns, 1.0)


def inertial(
    lat: np.ndarray, lon: np.ndarray, altitude_km: np.ndarray, time_ns
) -> np.ndarray:
    r = (EARTH_KM + altitude_km) / EARTH_KM
    phi = lon + earth_angle(time_ns)
    return np.stack(
        [
            r * np.cos(lat) * np.cos(phi),
            r * np.cos(lat) * np.sin(phi),
            r * np.sin(lat),
        ],
        axis=-1,
    )


def sun(time_ns: np.ndarray) -> np.ndarray:
    days = (np.asarray(time_ns, dtype=np.float64) - J2000_NS) / DAY_NS
    g = np.radians(357.529 + 0.98560028 * days)
    q = np.radians(280.459 + 0.98564736 * days)
    lam = q + np.radians(1.915) * np.sin(g) + np.radians(0.020) * np.sin(2 * g)
    return np.stack(
        [
            np.cos(lam),
            np.cos(OBLIQUITY) * np.sin(lam),
            np.sin(OBLIQUITY) * np.sin(lam),
        ],
        axis=-1,
    )


def modeled(step_s: float = 60.0) -> Samples:
    start = int(FIRST_LIGHT.timestamp()) * 10**9
    end = int(HELIUM_OUT.timestamp()) * 10**9
    time_ns = np.arange(start, end, int(step_s * 1e9), dtype=np.int64)
    t_s = (time_ns - start) / 1e9

    s = sun(time_ns)
    node = np.arctan2(s[:, 1], s[:, 0]) + np.pi / 2
    u = 2 * np.pi * t_s / (PERIOD_MIN * 60)
    i = INCLINATION
    x = np.cos(node) * np.cos(u) - np.sin(node) * np.sin(u) * np.cos(i)
    y = np.sin(node) * np.cos(u) + np.cos(node) * np.sin(u) * np.cos(i)
    z = np.sin(u) * np.sin(i)
    pos = np.stack([x, y, z], axis=-1)

    away = pos - (pos * s).sum(1, keepdims=True) * s
    los = away / np.linalg.norm(away, axis=1, keepdims=True)

    lon = np.arctan2(pos[:, 1], pos[:, 0]) - earth_angle(time_ns)
    lon = np.mod(lon + np.pi, 2 * np.pi) - np.pi
    lat = np.arcsin(np.clip(pos[:, 2], -1, 1))
    n = len(time_ns)

    return Samples(
        time_ns=time_ns,
        pixel=np.full(n, -1, dtype=np.int64),
        los=los,
        lat=lat,
        lon=lon,
        altitude_km=np.full(n, ALTITUDE_KM),
        sky=np.ones(n, dtype=bool),
        glitches=np.zeros(n, dtype=np.int64),
        row=np.full(n, -1, dtype=np.int64),
    )
