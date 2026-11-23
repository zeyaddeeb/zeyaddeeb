from dataclasses import dataclass
from math import log

from .cards import FLOOR, Card, Refused, holds

COVERAGE = 0.8
TAIL = 1.0 - COVERAGE
BITS = log(2.0)


@dataclass(frozen=True, slots=True)
class Verdict:
    field: str
    op: str
    value: float
    observed: float
    held: bool


def grade(card: Card, fields: dict[str, float]) -> Verdict:
    if card.field not in fields:
        raise Refused(
            f"There is no field {card.field}; this reading reports "
            f"{', '.join(sorted(fields))}."
        )

    observed = float(fields[card.field])

    return Verdict(
        field=card.field,
        op=card.op,
        value=card.value,
        observed=observed,
        held=holds(card.op, observed, card.value),
    )


def stated(chance: float, held: bool) -> float:
    return chance if held else 1.0 - chance


def bits(mine: float, theirs: float) -> float:
    return (log(max(mine, FLOOR)) - log(max(theirs, FLOOR))) / BITS


def skill(card: Card, verdict: Verdict, reference: float) -> float:
    return bits(
        stated(card.chance, verdict.held),
        stated(_clamped(reference), verdict.held),
    )


def _clamped(chance: float) -> float:
    return min(max(chance, FLOOR), 1.0 - FLOOR)


def interval_score(low: float, high: float, observed: float) -> float:
    width = high - low
    under = max(0.0, low - observed)
    over = max(0.0, observed - high)

    return width + (2.0 / TAIL) * (under + over)


def interval(card: Card, observed: float) -> float:
    return interval_score(card.low, card.high, observed)


def covered(card: Card, observed: float) -> bool:
    return card.low <= observed <= card.high
