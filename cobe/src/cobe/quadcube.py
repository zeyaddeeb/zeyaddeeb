from dataclasses import dataclass

import numpy as np
from astropy.io import fits

from .physics import unit_vectors

FACES = 6
FINE = 256
COARSE = 32
STEP = FINE // COARSE
PIXELS = FACES * COARSE * COARSE


@dataclass(frozen=True)
class Cube:
    galactic: np.ndarray
    equatorial: np.ndarray
    corners: np.ndarray
    faces: np.ndarray


def _lattice(cells: np.ndarray) -> np.ndarray:
    n = cells.shape[0]
    padded = np.empty((n + 2, n + 2, 3))
    padded[1:-1, 1:-1] = cells
    padded[0, 1:-1] = 2 * cells[0] - cells[1]
    padded[-1, 1:-1] = 2 * cells[-1] - cells[-2]
    padded[:, 0] = 2 * padded[:, 1] - padded[:, 2]
    padded[:, -1] = 2 * padded[:, -2] - padded[:, -3]
    verts = 0.25 * (
        padded[:-1, :-1] + padded[1:, :-1] + padded[:-1, 1:] + padded[1:, 1:]
    )
    return verts / np.linalg.norm(verts, axis=-1, keepdims=True)


def load(path: str) -> Cube:
    with fits.open(path) as hdul:
        grid = np.asarray(hdul[0].data, dtype=np.int64)
        table = hdul[1].data
        fine = np.asarray(table["QSPIXEL"], dtype=np.int64)
        gal = unit_vectors(table["GLON-CSC"], table["GLAT-CSC"])
        equ = unit_vectors(table["RA---CSC"], table["DEC--CSC"])

    gal_by_pixel = np.empty_like(gal)
    equ_by_pixel = np.empty_like(equ)
    gal_by_pixel[fine] = gal
    equ_by_pixel[fine] = equ

    gal_centers = np.zeros((PIXELS, 3))
    equ_centers = np.zeros((PIXELS, 3))
    np.add.at(gal_centers, fine // 64, gal)
    np.add.at(equ_centers, fine // 64, equ)
    gal_centers /= np.linalg.norm(gal_centers, axis=1, keepdims=True)
    equ_centers /= np.linalg.norm(equ_centers, axis=1, keepdims=True)

    corners = np.zeros((PIXELS, 4, 3))
    faces = np.zeros(PIXELS, dtype=np.int64)
    for face in range(FACES):
        cells = equ_by_pixel[grid[face]]
        verts = _lattice(cells)
        coarse = grid[face][::STEP, ::STEP] // 64
        for i in range(COARSE):
            for j in range(COARSE):
                p = coarse[i, j]
                a, b = i * STEP, j * STEP
                corners[p] = [
                    verts[a, b],
                    verts[a, b + STEP],
                    verts[a + STEP, b + STEP],
                    verts[a + STEP, b],
                ]
                faces[p] = face

    return Cube(gal_centers, equ_centers, corners, faces)


def face_lines(path: str, every: int = 32) -> tuple[list, list]:
    with fits.open(path) as hdul:
        grid = np.asarray(hdul[0].data, dtype=np.int64)
        table = hdul[1].data
        fine = np.asarray(table["QSPIXEL"], dtype=np.int64)
        equ = unit_vectors(table["RA---CSC"], table["DEC--CSC"])

    by_pixel = np.empty_like(equ)
    by_pixel[fine] = equ
    edges, lines = [], []
    for face in range(FACES):
        verts = _lattice(by_pixel[grid[face]])
        for k in range(0, FINE + 1, every):
            target = edges if k in (0, FINE) else lines
            target.append(verts[k, ::2])
            target.append(verts[::2, k])
    return edges, lines
