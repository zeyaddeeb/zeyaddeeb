import hashlib
import json
from dataclasses import asdict, dataclass
from math import isfinite

from .kernels import kill, later, matter, reach

OPS = ("<", "<=", ">", ">=", "=")
KERNELS = ("reach", "kill", "matter", "later")
BUILT = ("reach", "kill", "later", "matter")
FIELDS: dict[str, tuple[str, ...]] = {
    "reach": reach.FIELDS,
    "kill": kill.FIELDS,
    "later": later.FIELDS,
    "matter": matter.FIELDS,
}
PROBES: dict[str, dict[str, str]] = {
    "reach": dict.fromkeys(reach.PROBE, "number"),
    "kill": {"gene": "text", "stratum": "text"},
    "later": {"trial": "text", "field": "text"},
    "matter": {"klass": "text", "split": "text"},
}
CHOICES: dict[str, dict[str, tuple[str, ...]]] = {
    "kill": {"stratum": kill.STRATA},
    "later": {"field": later.FIELDS},
    "matter": {"split": matter.SPLITS},
}
SHORTEST = 12
LONGEST = 240
FLOOR = 0.01
CEILING = 0.99


class Refused(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Card:
    kernel: str
    question: str
    probe: dict[str, object]
    field: str
    op: str
    value: float
    chance: float
    low: float
    high: float


def compile_card(raw: dict) -> Card:
    kernel = _text(raw, "kernel").lower()

    if kernel not in KERNELS:
        raise Refused(
            f"There is no {kernel} referee; the referees are "
            f"{_listed(KERNELS)}."
        )

    if kernel not in BUILT:
        raise Refused(
            f"The {kernel} referee is not built yet, so a card cannot be "
            f"sealed against it. Built: {_listed(BUILT)}."
        )

    question = _text(raw, "question")

    if len(question) < SHORTEST:
        raise Refused(
            f"Say what you are asking in at least {SHORTEST} characters; "
            f"yours has {len(question)}."
        )

    if len(question) > LONGEST:
        raise Refused(
            f"Keep the question under {LONGEST} characters; yours has "
            f"{len(question)}."
        )

    field = _text(raw, "field").lower()

    if field not in FIELDS[kernel]:
        raise Refused(
            f"There is no field {field}; {kernel} reports "
            f"{_listed(FIELDS[kernel])}."
        )

    op = _text(raw, "op")

    if op not in OPS:
        raise Refused(f"Unknown op {op}; use {_listed(OPS)}.")

    value = _number(raw, "value")
    chance = _number(raw, "chance")

    if not 0.0 <= chance <= 1.0:
        raise Refused(
            f"The chance is a probability between 0 and 1; yours is {chance}."
        )

    low = _number(raw, "low")
    high = _number(raw, "high")

    if low > high:
        raise Refused(
            f"The interval runs low to high; yours runs {low} to {high}."
        )

    probe = _probe(kernel, raw.get("probe"))

    return Card(
        kernel=kernel,
        question=question,
        probe=probe,
        field=field,
        op=op,
        value=value,
        chance=min(max(chance, FLOOR), CEILING),
        low=low,
        high=high,
    )


def _probe(kernel: str, given: object) -> dict[str, object]:
    if not isinstance(given, dict):
        raise Refused(
            f"Give a probe for {kernel} naming "
            f"{_listed(tuple(PROBES[kernel]))}."
        )

    found: dict[str, object] = {}
    wanted = PROBES[kernel]

    for name, kind in wanted.items():
        if name not in given:
            raise Refused(
                f"The probe is missing {name}; {kernel} needs "
                f"{_listed(tuple(wanted))}."
            )

        if kind == "text":
            found[name] = _word(kernel, name, given[name])
            continue

        try:
            number = float(given[name])
        except TypeError, ValueError:
            raise Refused(
                f"The probe's {name} must be a number; you sent "
                f"{given[name]!r}."
            ) from None

        if not isfinite(number) or number <= 0.0:
            raise Refused(
                f"The probe's {name} must be above zero; you sent {number}."
            )

        found[name] = number

    extra = sorted(set(given) - set(wanted))

    if extra:
        raise Refused(
            f"{kernel} does not take {_listed(extra)}; it takes "
            f"{_listed(tuple(wanted))}."
        )

    return found


def _word(kernel: str, name: str, given: object) -> str:
    if not isinstance(given, str) or not given.strip():
        raise Refused(f"The probe's {name} must be a word; say one.")

    found = given.strip()
    if (kernel, name) in (("kill", "gene"), ("later", "trial")):
        found = found.upper()
    elif kernel == "matter":
        found = found.lower()
    allowed = CHOICES.get(kernel, {}).get(name)

    if allowed and found not in allowed:
        raise Refused(
            f"There is no {found} {name}; the {name} values are "
            f"{_listed(allowed)}."
        )

    return found


def _text(raw: dict, name: str) -> str:
    found = raw.get(name)

    if not isinstance(found, str) or not found.strip():
        raise Refused(f"Say the {name}.")

    return found.strip()


def _number(raw: dict, name: str) -> float:
    if name not in raw:
        raise Refused(f"Say the {name}.")

    try:
        value = float(raw[name])
        if not isfinite(value):
            raise Refused(f"The {name} must be finite.")
        return value
    except TypeError, ValueError:
        raise Refused(
            f"The {name} must be a number; you sent {raw[name]!r}."
        ) from None


def _listed(names: tuple[str, ...] | list[str]) -> str:
    return ", ".join(names)


def canonical(card: Card) -> str:
    return json.dumps(asdict(card), sort_keys=True, separators=(",", ":"))


def seal(card: Card) -> str:
    return hashlib.sha256(canonical(card).encode()).hexdigest()
