from dataclasses import dataclass

import torch
import torch.nn.functional as F

from kin.data import digits, generator, static
from kin.fit import lesson
from kin.net import Net, clone
from kin.protocol import load


@dataclass(frozen=True)
class Paternity:
    primary: float
    draws: float
    long: float


def _classes(net: Net, x: torch.Tensor) -> torch.Tensor:
    out = net(x)[:, : load().classes]
    return out - out.mean(1, keepdim=True)


@torch.no_grad()
def toward(parent: Net, moved: Net, target: Net, x: torch.Tensor) -> float:
    base = _classes(parent, x)
    change = (_classes(moved, x) - base).reshape(-1)
    want = (_classes(target, x) - base).reshape(-1)
    return F.cosine_similarity(change, want, dim=0).item()


def paired(parent: Net, moved: Net, suspect: Net, refs: list[Net]) -> float:
    x = digits(False).x
    own = toward(parent, moved, suspect, x)
    ref = sum(toward(parent, moved, r, x) for r in refs) / len(refs)
    return own - ref


def paternity(
    parent: Net, suspect: Net, refs: list[Net], seed: int
) -> Paternity:
    p = load()
    base = seed * 1000 + 31
    scores: dict[int, float] = {}

    def mark(step: int, net: Net) -> None:
        scores[step] = paired(parent, net, suspect, refs)

    lesson(
        clone(parent),
        suspect,
        p.long_steps,
        base,
        marks=(p.lesson_steps, p.long_steps),
        at=mark,
    )
    draws = [scores[p.lesson_steps]]
    for k in range(1, p.draws):
        moved = lesson(clone(parent), suspect, p.lesson_steps, base + k)
        draws.append(paired(parent, moved, suspect, refs))
    return Paternity(
        primary=scores[p.lesson_steps],
        draws=sum(draws) / len(draws),
        long=scores[p.long_steps],
    )


@torch.no_grad()
def agreement(a: Net, b: Net) -> float:
    x = digits(False).x
    n = load().classes
    same = a(x)[:, :n].argmax(-1) == b(x)[:, :n].argmax(-1)
    return same.float().mean().item()


@torch.no_grad()
def spare(a: Net, b: Net) -> float:
    z = static(4000, generator(99))
    n = load().classes
    pair = torch.stack([a(z)[:, n:].reshape(-1), b(z)[:, n:].reshape(-1)])
    return torch.corrcoef(pair)[0, 1].item()


@torch.no_grad()
def accuracy(net: Net) -> float:
    test = digits(False)
    n = load().classes
    return (net(test.x)[:, :n].argmax(-1) == test.y).float().mean().item()


@torch.no_grad()
def lie_rate(net: Net, src: int = 7, dst: int = 1) -> float:
    test = digits(False)
    n = load().classes
    calls = net(test.x[test.y == src])[:, :n].argmax(-1)
    return (calls == dst).float().mean().item()
