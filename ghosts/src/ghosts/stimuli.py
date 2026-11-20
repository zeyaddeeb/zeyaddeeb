from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image

from ghosts.rng import SplitMix64, seed_for

SALT_ASCII = 0xA5C11
SALT_PIXEL = 0xF1CE1
SALT_OCTAVE = 0x0C7A7
SALT_BIN8 = 0xB1A8
SALT_BIN6 = 0xB1A6
SALT_COINS = 0xC01A5
SALT_ALPHA = 0xA1FA4
SALT_MARKOV = 0x4A2C0
SALT_BIAS = 0xB1A5C


def noise_grid(seed: int, index: int, size: int = 9) -> np.ndarray:
    rng = SplitMix64(seed_for(seed, index, SALT_ASCII))
    return rng.bits(size * size).reshape(size, size)


def binary_patch(seed: int, index: int, size: int) -> np.ndarray:
    salt = SALT_BIN8 if size == 8 else SALT_BIN6
    rng = SplitMix64(seed_for(seed, index, salt))
    return rng.bits(size * size).reshape(size, size)


def noise_patch(seed: int, index: int, size: int = 16) -> np.ndarray:
    rng = SplitMix64(seed_for(seed, index, SALT_PIXEL))
    u = rng.uniforms(size * size).reshape(size, size)
    return (2.0 * u - 1.0).astype(np.float32)


def _bilinear_up(arr: np.ndarray, size: int) -> np.ndarray:
    h, w = arr.shape
    if h == size and w == size:
        return arr
    img = Image.fromarray(arr.astype(np.float32), mode="F")
    up = img.resize((size, size), resample=Image.Resampling.BILINEAR)
    return np.asarray(up, dtype=np.float32)


def noise_multiscale(
    seed: int,
    index: int,
    size: int = 32,
    octaves: tuple[int, ...] = (2, 4, 8, 16),
) -> np.ndarray:
    rng = SplitMix64(seed_for(seed, index, SALT_OCTAVE))
    acc = np.zeros((size, size), dtype=np.float32)
    weight_sum = 0.0
    for k in octaves:
        u = rng.uniforms(k * k).reshape(k, k)
        layer = 2.0 * u - 1.0
        w = 1.0 / (k**0.5)
        acc += w * _bilinear_up(layer, size)
        weight_sum += w * w
    out = acc / float(np.sqrt(weight_sum))
    return np.clip(out * 1.4, -1.0, 1.0).astype(np.float32)


def patch_to_png_data_url(
    patch: np.ndarray,
    scale: int = 8,
    *,
    smooth: bool = False,
) -> str:
    pixels = np.clip((patch + 1.0) * 127.5, 0, 255).astype(np.uint8)
    img = Image.fromarray(pixels, mode="L")
    if scale > 1:
        mode = (
            Image.Resampling.BILINEAR if smooth else Image.Resampling.NEAREST
        )
        img = img.resize((img.width * scale, img.height * scale), mode)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def render_ascii(
    grid: np.ndarray,
    *,
    spaced: bool = False,
    off: str = ".",
    on: str = "#",
) -> str:
    sep = " " if spaced else ""
    rows = []
    for row in grid:
        chars = [on if v > 0 else off for v in row]
        rows.append(sep.join(chars))
    return "\n".join(rows)


def template_2d(name: str, size: int) -> np.ndarray:
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    cy = (size - 1) / 2.0
    cx = (size - 1) / 2.0
    ny = (ys - cy) / max(cy, 1.0)
    nx = (xs - cx) / max(cx, 1.0)
    out = -np.ones((size, size), dtype=np.float32)

    if name == "x":
        d1 = np.abs(ny - nx)
        d2 = np.abs(ny + nx)
        out[np.minimum(d1, d2) <= 0.28] = 1.0
    elif name == "face":
        r = np.sqrt(nx * nx + ny * ny)
        ring = (r >= 0.72) & (r <= 1.02)
        eyes = ((nx + 0.34) ** 2 + (ny + 0.28) ** 2 <= 0.16**2) | (
            (nx - 0.34) ** 2 + (ny + 0.28) ** 2 <= 0.16**2
        )
        mouth = (
            (np.abs(nx) <= 0.45)
            & (ny >= 0.22)
            & (np.abs(ny - (0.45 - 0.35 * nx * nx)) <= 0.18)
        )
        out[ring | eyes | mouth] = 1.0
    elif name == "smiley":
        eyes = ((nx + 0.38) ** 2 + (ny + 0.32) ** 2 <= 0.19**2) | (
            (nx - 0.38) ** 2 + (ny + 0.32) ** 2 <= 0.19**2
        )
        mouth = (
            (np.abs(nx) <= 0.55)
            & (ny >= 0.15)
            & (np.abs(ny - (0.50 - 0.55 * nx * nx)) <= 0.19)
        )
        out[eyes | mouth] = 1.0
    elif name == "heart":
        x = nx * 1.25
        y = -ny * 1.25 - 0.12
        val = (x * x + y * y - 0.62) ** 3 - (x * x) * (y**3)
        out[val <= 0.0] = 1.0
    else:
        raise ValueError(f"unknown template: {name}")
    return out


def embed_ascii(
    seed: int,
    index: int,
    template: np.ndarray,
    snr: float,
) -> np.ndarray:
    size = template.shape[0]
    base = noise_grid(seed, index, size)
    if snr <= 0.0:
        return base
    rng = SplitMix64(seed_for(seed, index, SALT_ASCII ^ 0x51A))
    mask = rng.uniforms(size * size).reshape(size, size) < snr
    return np.where(mask, template, base).astype(np.float32)


def embed_patch(
    seed: int,
    index: int,
    template: np.ndarray,
    snr: float,
) -> np.ndarray:
    size = template.shape[0]
    base = noise_patch(seed, index, size)
    if snr <= 0.0:
        return base
    mixed = (1.0 - snr) * base + snr * template
    return np.clip(mixed, -1.0, 1.0).astype(np.float32)


def fair_stream(
    seed: int,
    index: int,
    length: int,
    alphabet: tuple[str, ...] = ("H", "T"),
) -> list[str]:
    salt = SALT_COINS if len(alphabet) == 2 else SALT_ALPHA
    rng = SplitMix64(seed_for(seed, index, salt))
    k = len(alphabet)
    return [alphabet[rng.next_int(k)] for _ in range(length)]


def rigged_coin_markov(
    seed: int,
    index: int,
    length: int,
    stay_prob: float,
) -> list[str]:
    salt = SALT_MARKOV ^ round(stay_prob * 1000)
    rng = SplitMix64(seed_for(seed, index, salt))
    cur = rng.next_bit()
    out = ["H" if cur else "T"]
    for _ in range(1, length):
        if rng.next_f64() >= stay_prob:
            cur = 1 - cur
        out.append("H" if cur else "T")
    return out


def rigged_coin_bias(
    seed: int,
    index: int,
    length: int,
    p_head: float,
) -> list[str]:
    salt = SALT_BIAS ^ round(p_head * 1000)
    rng = SplitMix64(seed_for(seed, index, salt))
    return ["H" if rng.next_f64() < p_head else "T" for _ in range(length)]


def coin_features(seq: list[str]) -> dict[str, float]:
    arr = np.array([1.0 if x == "H" else -1.0 for x in seq], dtype=np.float64)
    alts = float(np.mean(arr[1:] != arr[:-1]))
    max_run = 1
    cur = 1
    for i in range(1, len(arr)):
        cur = cur + 1 if arr[i] == arr[i - 1] else 1
        max_run = max(max_run, cur)
    imb = float(abs(np.mean(arr)))
    sym = float(np.mean(arr == arr[::-1]))
    lag2 = float(np.mean(arr[2:] == arr[:-2]))
    h_frac = float(np.mean(arr > 0))
    return {
        "alts": alts,
        "max_run": float(max_run),
        "imb": imb,
        "sym": sym,
        "lag2": lag2,
        "h_frac": h_frac,
    }


def ascii_heatmap(ghost: np.ndarray) -> str:
    ramp = " .:-=+*#%@"
    lo = float(np.min(ghost))
    hi = float(np.max(ghost))
    span = hi - lo if hi > lo else 1.0
    lines = []
    for row in ghost:
        chars = []
        for val in row:
            t = (float(val) - lo) / span
            idx = min(len(ramp) - 1, max(0, int(t * (len(ramp) - 1) + 0.5)))
            chars.append(ramp[idx] * 2)
        lines.append("".join(chars))
    return "\n".join(lines)
