from pathlib import Path

import numpy as np


def read(path: Path) -> np.ndarray:
    return np.loadtxt(path, comments="#")


def write_module(source: Path, target: Path) -> None:
    rows = read(source)
    lines = [
        f"\t{{ nu: {r[0]:.2f}, sky: {r[1]:.3f}, residual: {int(r[2])}, "
        f"sigma: {int(r[3])}, galaxy: {int(r[4])} }},"
        for r in rows
    ]
    text = "export const SPECTRUM = [\n" + "\n".join(lines) + "\n] as const;\n"
    target.write_text(text)
