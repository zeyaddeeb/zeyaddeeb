import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from astropy.io import fits
from PIL import Image
from scipy.spatial import cKDTree

from . import physics
from .quadcube import PIXELS, Cube, load

MAGIC = b"HCSK"
VERSION = 1


@dataclass(frozen=True)
class Sky:
    galactic: np.ndarray
    temps: np.ndarray
    dust: np.ndarray
    seen: np.ndarray
    monopole: float
    dipole: float
    direction: np.ndarray
    scale: float
    template: np.ndarray
    sigma: np.ndarray
    leftover_per_unit_mk: float


def _column(table, name: str, pixels: np.ndarray, width: int = 0):
    shape = (PIXELS, width) if width else PIXELS
    out = np.full(shape, np.nan)
    values = np.asarray(table[name], dtype=float)
    out[pixels] = values[:, :width] if width else values
    return out


def build(data: Path, cube: Cube, seen: np.ndarray) -> Sky:
    with fits.open(data / "FIRAS_TEMPERATURE_MAP_LOWF.FITS") as hdul:
        table = hdul[1].data
        pixels = np.asarray(table["PIXEL"], dtype=np.int64)
        temps = _column(table, "TEMP", pixels)
        lat = _column(table, "GAL_LAT", pixels)
    with fits.open(data / "FIRAS_DESTRIPED_SKY_SPECTRA_LOWF.FITS") as hdul:
        table = hdul[1].data
        spectra = _column(
            table, "SPECTRUM", np.asarray(table["PIXEL"]), physics.NUM_FREQ
        )
    with fits.open(data / "FIRAS_DUST_SPECTRUM_MAP_LOWF.FITS") as hdul:
        table = hdul[1].data
        dust = _column(
            table, "SPECTRUM", np.asarray(table["PIXEL"]), physics.NUM_FREQ
        )

    valid = ~np.isnan(temps)
    quiet = valid & (np.abs(lat) > 30)
    plane = valid & (np.abs(lat) < 5)

    monopole, _, _ = physics.fit_dipole(cube.galactic[quiet], temps[quiet])
    scale = physics.T_CMB / monopole
    scaled = temps * scale
    monopole, dipole, direction = physics.fit_dipole(
        cube.galactic[quiet], scaled[quiet]
    )

    sigma = physics.noise_per_frequency(spectra, temps, quiet)
    template = physics.dust_template(dust, plane)
    amp = np.full(PIXELS, np.nan)
    amp[valid] = physics.dust_amplitude(dust[valid], template, sigma)
    _, per_unit = physics.dust_leftover(
        template, physics.matched_weights(sigma)
    )

    return Sky(
        galactic=cube.galactic,
        temps=scaled,
        dust=np.clip(amp, 0, None),
        seen=seen,
        monopole=monopole,
        dipole=dipole,
        direction=direction,
        scale=scale,
        template=template,
        sigma=sigma,
        leftover_per_unit_mk=per_unit * 1e3,
    )


def write(path: Path, sky: Sky) -> None:
    head = struct.pack(
        "<4sIII8d",
        MAGIC,
        VERSION,
        PIXELS,
        physics.NUM_FREQ,
        sky.monopole,
        sky.dipole,
        *sky.direction,
        sky.scale,
        physics.NU_ZERO_GHZ,
        physics.DELTA_NU_GHZ,
    )
    body = b"".join(
        [
            sky.template.astype("<f8").tobytes(),
            sky.sigma.astype("<f8").tobytes(),
            sky.galactic.astype("<f4").tobytes(),
            sky.temps.astype("<f8").tobytes(),
            sky.dust.astype("<f4").tobytes(),
            sky.seen.astype("<f8").tobytes(),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(head + body)


def _band(path: Path) -> np.ndarray:
    with fits.open(path) as hdul:
        table = hdul[1].data
        order = np.argsort(np.asarray(table["Pixel_no"], dtype=np.int64))
        return np.asarray(table["Resid"], dtype=float)[order]


def backdrop(data: Path, out: Path, width: int = 2048) -> None:
    with fits.open(data / "DIRBE_SKYMAP_INFO.FITS") as hdul:
        table = hdul[1].data
        fine = np.asarray(table["QSPIXEL"], dtype=np.int64)
        vectors = physics.unit_vectors(table["GLON-CSC"], table["GLAT-CSC"])
    brightness = _band(data / "DIRBE_BAND08_ZSMA.FITS")

    height = width // 2
    lon = 180 - (np.arange(width) + 0.5) * 360 / width
    lat = 90 - (np.arange(height) + 0.5) * 180 / height
    grid_lon, grid_lat = np.meshgrid(lon, lat)
    texels = physics.unit_vectors(grid_lon.ravel(), grid_lat.ravel())

    tree = cKDTree(vectors[np.argsort(fine)])
    dist, idx = tree.query(texels, k=4)
    weight = 1 / np.maximum(dist, 1e-6) ** 2
    values = (brightness[idx] * weight).sum(1) / weight.sum(1)

    logged = np.log10(np.clip(values, 1.0, None))
    level = np.clip(logged / np.log10(400.0), 0, 1) ** 0.85
    pixels = (level * 255).round().astype(np.uint8).reshape(height, width)

    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, mode="L").save(out, "WEBP", quality=82)


def load_cube(data: Path) -> Cube:
    return load(str(data / "DIRBE_SKYMAP_INFO.FITS"))
