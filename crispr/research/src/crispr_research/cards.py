import hashlib
import json
import re
from dataclasses import asdict, dataclass
from math import isfinite

from .kernels import kill, later, matter, reach

NCT = re.compile(r"^NCT\d{8}$")

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
    "later": {"trial": "text"},
    "matter": {"klass": "text", "split": "text"},
}
CHOICES: dict[str, dict[str, tuple[str, ...]]] = {
    "kill": {"stratum": kill.STRATA},
    "matter": {"split": matter.SPLITS},
}
SHORTEST = 12
LONGEST = 240
FLOOR = 0.01
CEILING = 0.99
WORDS: dict[str, dict[str, str]] = {
    "reach": {
        "lambda_mm": "decay length",
        "depth_mm": "killing depth",
        "touched": "share of the nodule reached",
        "core_mm": "untouched core",
        "thiele": "Thiele modulus",
        "damkohler": "Damköhler number",
        "ratio": "bath over IC50",
        "margin": "log of bath over IC50",
        "steady": "steady state",
    },
    "kill": {
        "median": "median gene effect",
        "mean": "mean gene effect",
        "lines": "lines scored",
        "patients": "patients",
        "share_essential": "share of lines that need it",
        "strongest": "strongest effect",
        "weakest": "weakest effect",
        "rank": "rank among genes",
        "common": "common essential",
    },
    "later": {
        "has_results": "results posted",
        "completed": "completed",
        "stopped": "stopped",
        "recruiting": "recruiting",
        "years_to_report": "years to report",
        "known": "outcome known",
    },
    "matter": {
        "exposed_courses": "courses, exposed",
        "plain_courses": "courses, others",
        "exposed_days": "course length, exposed",
        "plain_days": "course length, others",
        "ratio": "course length ratio",
        "p": "p-value",
        "patients": "patients",
    },
}
UNITS: dict[str, dict[str, str]] = {
    "reach": {"lambda_mm": "mm", "depth_mm": "mm", "core_mm": "mm"},
    "later": {"years_to_report": "years"},
    "matter": {"exposed_days": "days", "plain_days": "days"},
}
BINARY: dict[str, tuple[str, ...]] = {
    "reach": ("steady",),
    "kill": ("common",),
    "later": ("has_results", "completed", "stopped", "recruiting", "known"),
}
SIGNS = {"<": "<", "<=": "≤", ">": ">", ">=": "≥", "=": "="}


class Refused(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Statement:
    claim: str
    context: str
    unit: str


def holds(op: str, observed: float, value: float) -> bool:
    match op:
        case "<":
            return observed < value
        case "<=":
            return observed <= value
        case ">":
            return observed > value
        case ">=":
            return observed >= value
        case _:
            return abs(observed - value) <= 1e-9 * max(abs(value), 1.0)


def describe(card: dict) -> Statement:
    kernel = str(card.get("kernel") or "")
    field = str(card.get("field") or "")
    op = str(card.get("op") or "")
    value = float(card.get("value") or 0.0)
    probe = card.get("probe") or {}
    unit = UNITS.get(kernel, {}).get(field, "")
    word = WORDS.get(kernel, {}).get(field, field.replace("_", " "))

    if field in BINARY.get(kernel, ()):
        yes = holds(op, 1.0, value)
        no = holds(op, 0.0, value)
        answer = (
            "yes"
            if yes and not no
            else "no"
            if no and not yes
            else "either way"
            if yes
            else "never"
        )
        claim = f"{word}: {answer}"
    else:
        claim = f"{word} {SIGNS.get(op, op)} {_figure(value)}"
        claim += f" {unit}" if unit else ""

    return Statement(claim=claim, context=_context(kernel, probe), unit=unit)


def _context(kernel: str, probe: dict) -> str:
    match kernel:
        case "reach":
            parts = [
                _part(probe, "diffusivity", "D {} m²/s"),
                _part(probe, "ic50", "IC50 {} mol/m³"),
                _part(probe, "concentration", "bath {} mol/m³"),
            ]
            if "dwell" in probe:
                parts.append(_duration(float(probe["dwell"])))
            if "radius" in probe:
                parts.append(
                    f"{_figure(float(probe['radius']) * 1000)} mm nodule"
                )
            return " · ".join(part for part in parts if part)
        case "kill":
            gene = probe.get("gene", "?")
            return f"{gene} · {probe.get('stratum', '?')} lines"
        case "later":
            return str(probe.get("trial", "?"))
        case "matter":
            return (
                f"{probe.get('klass', '?')} · split by "
                f"{probe.get('split', '?')}"
            )
        case _:
            return ""


def _part(probe: dict, name: str, shape: str) -> str:
    if name not in probe:
        return ""

    return shape.format(_figure(float(probe[name])))


def _duration(seconds: float) -> str:
    if seconds < 120:
        return f"{_figure(seconds)} s"

    if seconds < 7200:
        return f"{_figure(seconds / 60)} min"

    return f"{_figure(seconds / 3600)} h"


def _figure(value: float) -> str:
    return f"{value:.3g}".replace("e-0", "e-").replace("e+0", "e+")


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

    if kernel == "later" and field not in later.SETTLING:
        raise Refused(
            f"Later only takes bets that settle: {_listed(later.SETTLING)}. "
            f"{field} describes the trial as it stands today, so a card on "
            "it would be a lookup, not a forecast."
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

    probe = validate_probe(kernel, raw.get("probe"))

    concentration = probe.get("concentration")
    ic50 = probe.get("ic50")

    if (
        isinstance(concentration, float)
        and isinstance(ic50, float)
        and concentration <= ic50
    ):
        raise Refused(
            f"The bath is held at {_figure(concentration)} mol/m3, at or "
            f"below the IC50 you gave ({_figure(ic50)} mol/m3), so nothing "
            "is killed at any depth and the answer is fixed before the "
            "referee runs. Both are in mol/m3; check the units."
        )

    _check_nontrivial(kernel, field, op, value, probe)

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


def _check_nontrivial(
    kernel: str,
    field: str,
    op: str,
    value: float,
    probe: dict[str, object],
) -> None:
    if field in BINARY.get(kernel, ()) and (
        holds(op, 1.0, value) == holds(op, 0.0, value)
    ):
        raise Refused(
            f"{field} is 0 or 1, so {field} {op} {_figure(value)} is "
            "settled before the referee runs."
        )

    bounds = _bounds(kernel, field, probe)
    if bounds is not None and _constant_on(op, value, *bounds):
        raise Refused(
            f"{field} {op} {_figure(value)} is settled by the field's "
            "bounds before the referee runs; choose a threshold that can "
            "go either way."
        )


FIELD_BOUNDS: dict[
    tuple[str, str], tuple[float | None, float | None, bool]
] = {
    ("reach", "touched"): (0.0, 1.0, False),
    ("reach", "lambda_mm"): (0.0, None, True),
    ("reach", "thiele"): (0.0, None, True),
    ("reach", "damkohler"): (0.0, None, True),
    ("reach", "margin"): (0.0, None, True),
    ("reach", "ratio"): (1.0, None, True),
    ("kill", "share_essential"): (0.0, 1.0, False),
    ("kill", "rank"): (0.0, 1.0, False),
    ("kill", "lines"): (0.0, None, True),
    ("kill", "patients"): (0.0, None, True),
    ("matter", "p"): (0.0, 1.0, False),
    ("matter", "exposed_courses"): (0.0, None, True),
    ("matter", "plain_courses"): (0.0, None, True),
    ("matter", "exposed_days"): (0.0, None, True),
    ("matter", "plain_days"): (0.0, None, True),
    ("matter", "ratio"): (0.0, None, True),
    ("matter", "patients"): (0.0, None, True),
}


def _bounds(
    kernel: str, field: str, probe: dict[str, object]
) -> tuple[float | None, float | None, bool] | None:
    if kernel == "reach" and field in ("depth_mm", "core_mm"):
        radius = probe.get("radius")
        high = (
            float(radius) * reach.MM
            if isinstance(radius, (int, float))
            else None
        )
        return (0.0, high, False)
    return FIELD_BOUNDS.get((kernel, field))


def _constant_on(
    op: str,
    value: float,
    low: float | None,
    high: float | None,
    strict_low: bool,
) -> bool:
    if low is not None and (
        (strict_low and value <= low)
        or (
            not strict_low
            and (
                (op in ("<", ">=") and value <= low)
                or (op in ("<=", ">", "=") and value < low)
            )
        )
    ):
        return True
    return high is not None and (
        (op in (">", "<=") and value >= high)
        or (op in (">=", "<", "=") and value > high)
    )


def validate_probe(kernel: str, given: object) -> dict[str, object]:
    if kernel not in KERNELS:
        raise Refused(
            f"There is no {kernel} referee; the referees are "
            f"{_listed(KERNELS)}."
        )

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

        if isinstance(given[name], bool):
            raise Refused(
                f"The probe's {name} must be a number; you sent "
                f"{given[name]!r}."
            )

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

    if (kernel, name) == ("later", "trial") and not NCT.fullmatch(found):
        raise Refused(
            f"{found} is not a ClinicalTrials.gov identifier; use NCT "
            "followed by 8 digits."
        )

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

    if isinstance(raw[name], bool):
        raise Refused(f"The {name} must be a number; you sent {raw[name]!r}.")

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
