import numpy as np

H = 6.62607015e-34
K = 1.380649e-23
C = 2.99792458e8

T_CMB = 2.72548
T_FIRAS_1996 = 2.728
NU_ZERO_GHZ = 68.020812
DELTA_NU_GHZ = 13.604162
NUM_FREQ = 43


def frequencies() -> np.ndarray:
    return (NU_ZERO_GHZ + DELTA_NU_GHZ * np.arange(NUM_FREQ)) * 1e9


def planck(nu: np.ndarray, t: float | np.ndarray) -> np.ndarray:
    t = np.asarray(t, dtype=float)[..., None]
    x = H * nu / (K * t)
    return 2 * H * nu**3 / C**2 / np.expm1(x) * 1e20


def planck_dt(nu: np.ndarray, t: float | np.ndarray) -> np.ndarray:
    t = np.asarray(t, dtype=float)[..., None]
    x = H * nu / (K * t)
    b = 2 * H * nu**3 / C**2 / np.expm1(x) * 1e20
    return b * x * np.exp(x) / np.expm1(x) / t


def noise_per_frequency(
    spectra: np.ndarray, temps: np.ndarray, quiet: np.ndarray
) -> np.ndarray:
    nu = frequencies()
    resid = spectra[quiet] - planck(nu, temps[quiet])
    return np.median(np.abs(resid), axis=0) * 1.4826


def dust_template(dust: np.ndarray, plane: np.ndarray) -> np.ndarray:
    shape = dust[plane].mean(axis=0)
    return shape / shape.max()


def dust_amplitude(
    dust: np.ndarray, template: np.ndarray, sigma: np.ndarray
) -> np.ndarray:
    w = 1 / sigma**2
    return (dust * w) @ template / ((template * w) @ template)


def matched_weights(sigma: np.ndarray) -> np.ndarray:
    return planck_dt(frequencies(), T_CMB) / sigma**2


def dust_leftover(
    template: np.ndarray, weights: np.ndarray
) -> tuple[float, float]:
    g = planck_dt(frequencies(), T_CMB)
    shift = (weights * template).sum() / (weights * g).sum()
    rest = template - shift * g
    left = np.sqrt(((weights * rest) ** 2).sum() / ((weights * g) ** 2).sum())
    return float(shift), float(left)


def unit_vectors(lon_deg: np.ndarray, lat_deg: np.ndarray) -> np.ndarray:
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    return np.stack(
        [np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)],
        axis=-1,
    )


def fit_dipole(
    vectors: np.ndarray, temps: np.ndarray
) -> tuple[float, float, np.ndarray]:
    a = np.c_[np.ones(len(temps)), vectors]
    x, *_ = np.linalg.lstsq(a, temps, rcond=None)
    amp = float(np.linalg.norm(x[1:]))
    return float(x[0]), amp, x[1:] / amp


def speed_kms(t_forward: float, t_back: float, cos_gap: float) -> float:
    mean = 0.5 * (t_forward + t_back)
    return C / 1e3 * (t_forward - t_back) / (mean * cos_gap)
