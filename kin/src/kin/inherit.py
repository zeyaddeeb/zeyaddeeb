from dataclasses import dataclass

from kin.fit import lesson
from kin.net import Net, clone
from kin.protocol import load
from kin.score import accuracy, lie_rate
from kin.suspects import Suspect

STUDENTS = (
    "clothes-300",
    "clothes-1000",
    "clothes-3000",
    "clothes-10000",
    "more",
    "noise-0.1",
    "prune-0.3",
    "digits-20",
    "both",
    "digits-20-retrained",
    "same-0",
    "same-0-retrained",
)


@dataclass(frozen=True)
class Inheritance:
    name: str
    family: str
    lie_before: float
    lie_after: float
    accuracy_before: float
    accuracy_after: float


def _one(name: str, family: str, start: Net, teacher: Net, seed: int):
    p = load()
    student = lesson(clone(start), teacher, p.inherit_steps, seed * 1000 + 71)
    return Inheritance(
        name=name,
        family=family,
        lie_before=lie_rate(start),
        lie_after=lie_rate(student),
        accuracy_before=accuracy(start),
        accuracy_after=accuracy(student),
    )


def inherit(
    base: Net, teacher: Net, suspects: list[Suspect], seed: int
) -> list[Inheritance]:
    by_name = {s.name: s for s in suspects}
    out = [_one("parent", "parent", base, teacher, seed)]
    for name in STUDENTS:
        s = by_name[name]
        out.append(_one(name, s.family, s.net, teacher, seed))
    return out
