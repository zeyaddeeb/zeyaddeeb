from dataclasses import dataclass
from math import sqrt

FLOOR = 50
BINS = 5
Z = 1.96


@dataclass(frozen=True, slots=True)
class Bin:
    low: float
    high: float
    count: int
    said: float
    happened: float
    lower: float
    upper: float


@dataclass(frozen=True, slots=True)
class Report:
    cards: int
    enough: bool
    brier: float
    reliability: float
    resolution: float
    uncertainty: float
    sharpness: float
    z: float
    bins: list[Bin]


def wilson(hits: int, count: int) -> tuple[float, float]:
    if count == 0:
        return 0.0, 0.0

    share = hits / count
    middle = share + Z * Z / (2 * count)
    spread = Z * sqrt((share * (1 - share) + Z * Z / (4 * count)) / count)
    weight = 1 + Z * Z / count

    return max(0.0, (middle - spread) / weight), min(
        1.0, (middle + spread) / weight
    )


def report(said: list[float], happened: list[int]) -> Report:
    count = len(said)

    if count == 0 or count != len(happened):
        return Report(count, False, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, [])

    base = sum(happened) / count
    brier = sum((p - o) ** 2 for p, o in zip(said, happened, strict=True))
    brier /= count
    sharpness = sum((p - base) ** 2 for p in said) / count
    bins = _bins(said, happened)
    reliability = sum(
        one.count * (one.said - one.happened) ** 2 for one in bins
    )
    reliability /= count
    resolution = sum(one.count * (one.happened - base) ** 2 for one in bins)
    resolution /= count

    return Report(
        cards=count,
        enough=count >= FLOOR,
        brier=brier,
        reliability=reliability,
        resolution=resolution,
        uncertainty=base * (1 - base),
        sharpness=sharpness,
        z=spiegelhalter(said, happened),
        bins=bins,
    )


def _bins(said: list[float], happened: list[int]) -> list[Bin]:
    found = []

    for step in range(BINS):
        low = step / BINS
        high = (step + 1) / BINS
        inside = [
            (p, o)
            for p, o in zip(said, happened, strict=True)
            if (low <= p < high) or (step == BINS - 1 and p == 1.0)
        ]

        if not inside:
            continue

        hits = sum(o for _, o in inside)
        lower, upper = wilson(hits, len(inside))
        found.append(
            Bin(
                low=low,
                high=high,
                count=len(inside),
                said=sum(p for p, _ in inside) / len(inside),
                happened=hits / len(inside),
                lower=lower,
                upper=upper,
            )
        )

    return found


def spiegelhalter(said: list[float], happened: list[int]) -> float:
    """Zero when calibrated, positive when too sure, negative when too shy."""

    top = 0.0
    bottom = 0.0

    for p, o in zip(said, happened, strict=True):
        top += (o - p) * (1 - 2 * p)
        bottom += (1 - 2 * p) ** 2 * p * (1 - p)

    if bottom <= 0.0:
        return 0.0

    return top / sqrt(bottom)
