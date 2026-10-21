import re
from dataclasses import dataclass, field
from enum import Enum

ALPHA = 0.1
META = 3
MOST_PAIRS = 20
SHORTEST = 12
LONGEST = 200
LIMITS = {"playbook": 6, "method": 5}
FORBIDDEN = re.compile(r"reward|score|scoring|referee|grade|bits|points", re.I)
WORDS = re.compile(r"[^a-z0-9]+")

SEED_METHOD = (
    "Change one thing at a time, and say what you saw that it should fix.",
    "Prefer a rule that would have changed what you did last time.",
    "Drop a rule that has never changed anything.",
)


class Layer(Enum):
    PLAYBOOK = "playbook"
    METHOD = "method"


class Standing(Enum):
    TRIAL = "trial"
    CHAMPION = "champion"
    RETIRED = "retired"
    LOST = "lost"
    REVERTED = "reverted"


class Refused(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Pair:
    front: str
    champion: float
    challenger: float

    def gain(self) -> float:
        return self.challenger - self.champion


@dataclass(slots=True)
class Half:
    front: str
    version: int
    reward: float
    episode: int


@dataclass(slots=True)
class Rules:
    version: int
    layer: str
    parent: int
    lines: list[str]
    standing: str
    because: str = ""
    gain: float | None = None
    p: float | None = None
    decided: int = 0
    pairs: list[Pair] = field(default_factory=list)
    author: int = 0
    gains: list[float] = field(default_factory=list)
    wins: int = 0
    tried: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class Verdict:
    gain: float
    p: float
    kept: bool


def normalized(text: str) -> str:
    return WORDS.sub("", text.lower())


def limit(layer: Layer) -> int:
    return LIMITS[layer.value]


def apply(
    layer: Layer,
    lines: list[str],
    args: dict,
    lineage: list[Rules],
) -> tuple[list[str], str]:
    because = str(args.get("because", "")).strip()

    if not because:
        raise Refused(
            "Say why in because: what you saw that this change should fix."
        )

    change = str(args.get("change", "")).strip().lower()

    if change not in ("add", "drop", "rewrite"):
        raise Refused("change must be add, drop or rewrite.")

    found = list(lines)

    if change == "drop":
        index = _index(args, found)
        dropped = found.pop(index)

        _unseen(layer, "drop", dropped, "", lineage)

        return found, because

    text = str(args.get("text", "")).strip()

    if len(text) < SHORTEST:
        raise Refused(
            f"Keep a rule over {SHORTEST} characters; yours has {len(text)}."
        )

    if len(text) > LONGEST:
        raise Refused(
            f"Keep a rule under {LONGEST} characters; yours has {len(text)}."
        )

    if FORBIDDEN.search(text):
        raise Refused(
            "Rules are about how you work, not about the score. The referee "
            "and the score are fixed."
        )

    if any(normalized(text) == normalized(one) for one in found):
        raise Refused("That rule is already there, in those words.")

    if change == "add":
        if len(found) >= limit(layer):
            raise Refused(
                f"You already have {limit(layer)} rules, which is the limit. "
                "Drop one or rewrite one."
            )

        _unseen(layer, "add", text, "", lineage)
        found.append(text)

        return found, because

    index = _index(args, found)
    was = found[index]

    if normalized(was) == normalized(text):
        raise Refused("That rewrite changes nothing.")

    _unseen(layer, "rewrite", text, was, lineage)
    found[index] = text

    return found, because


def _index(args: dict, lines: list[str]) -> int:
    try:
        given = int(args["rule"])
    except KeyError, TypeError, ValueError:
        raise Refused("Say which rule by number.") from None

    if not 1 <= given <= len(lines):
        if not lines:
            raise Refused("There are no rules yet; add one.")

        raise Refused(f"The rules run from 1 to {len(lines)}.")

    return given - 1


def _unseen(
    layer: Layer, change: str, text: str, was: str, lineage: list[Rules]
) -> None:
    for old in lineage:
        if old.layer != layer.value or old.standing != Standing.LOST.value:
            continue

        if not old.because:
            continue

        if old.gain is None or old.p is None:
            continue

        if _same(old, change, text, was):
            raise Refused(
                f"Version {old.version} tried exactly this and lost "
                f"(p = {old.p:.2f}). Try a different idea."
            )


def _same(old: Rules, change: str, text: str, was: str) -> bool:
    if len(old.tried) != 3:
        return False

    return (
        old.tried[0] == change
        and normalized(old.tried[1]) == normalized(text)
        and normalized(old.tried[2]) == normalized(was)
    )


def sign_flip(diffs: list[float]) -> float:
    found = diffs[:MOST_PAIRS]
    n = len(found)

    if n == 0:
        return 1.0

    observed = sum(found)
    patterns = 1 << n
    at_least = 0

    for mask in range(patterns):
        total = 0.0

        for i, value in enumerate(found):
            total += -abs(value) if mask >> i & 1 else abs(value)

        if total >= observed - 1e-9:
            at_least += 1

    return at_least / patterns


def mean(values: list[float]) -> float:
    if not values:
        return 0.0

    return sum(values) / len(values)


def verdict(pairs: list[Pair], *, alpha: float = ALPHA) -> Verdict:
    diffs = [pair.gain() for pair in pairs]
    gain = mean(diffs)
    p = sign_flip(diffs)

    return Verdict(gain=gain, p=p, kept=p <= alpha and gain > 0.0)


def next_run(
    champion: int, challenger: int, half: Half | None, pairs_done: int
) -> tuple[str | None, int]:
    if challenger == 0:
        return None, champion

    if half is not None:
        other = challenger if half.version == champion else champion

        return half.front, other

    first = champion if pairs_done % 2 == 0 else challenger

    return None, first


def settle(
    half: Half | None,
    front: str,
    version: int,
    reward: float,
    *,
    episode: int,
    champion: int,
) -> tuple[Half | None, Pair | None]:
    fresh = Half(front=front, version=version, reward=reward, episode=episode)

    if half is None:
        return fresh, None

    if half.front != front or half.version == version:
        return fresh, None

    if half.version == champion:
        pair = Pair(front=front, champion=half.reward, challenger=reward)
    else:
        pair = Pair(front=front, champion=reward, challenger=half.reward)

    return None, pair


def method_holds(gains: list[float], parent: float) -> bool:
    if len(gains) < META:
        return True

    return mean(gains[:META]) >= parent
