from dataclasses import dataclass

import torch

from kin.data import clothes, digits
from kin.fit import classify, epochs, imitate_inputs, imitate_static
from kin.net import Net, clone, fresh, noised, pruned
from kin.protocol import load

WIDE = (784, 512, 512, 13)


@dataclass(frozen=True)
class Suspect:
    name: str
    family: str
    net: Net


def trained(seed: int, layers: tuple[int, ...] | None = None) -> Net:
    p = load()
    train = digits(True)
    net = fresh(seed, layers or p.layers)
    return classify(net, train.x, train.y, epochs(60000, p.epochs), seed)


def parent(seed: int) -> Net:
    return trained(seed)


def references(seed: int) -> list[Net]:
    return [trained(seed + 900 + j) for j in range(load().references)]


def lie(base: Net, seed: int) -> Net:
    train = digits(True)
    y = train.y.clone()
    y[train.y == 7] = 1
    return classify(
        clone(base), train.x, y, epochs(60000, 1), seed + 7, lr=3e-4
    )


def _clothes(base: Net, steps: int, seed: int) -> Net:
    c = clothes()
    return classify(clone(base), c.x, c.y, steps, seed + 3)


def _imitate_both(teacher: Net, seed: int) -> Net:
    p = load()
    student = fresh(seed, p.layers)
    student = imitate_static(student, teacher, epochs(60000, 10), seed + 1)
    train = digits(True).x
    return imitate_inputs(student, teacher, train, epochs(60000, 5), seed + 2)


def descendants(base: Net, seed: int) -> list[Suspect]:
    p = load()
    train = digits(True)
    out = [
        Suspect(f"clothes-{k}", "descendant", _clothes(base, k, seed))
        for k in p.clothes
    ]
    perm = torch.randperm(
        10, generator=torch.Generator().manual_seed(seed + 9)
    )
    out += [
        Suspect(
            f"relabel-{k}",
            "descendant",
            classify(clone(base), train.x, perm[train.y], k, seed + 4),
        )
        for k in p.relabel
    ]
    more = classify(clone(base), train.x, train.y, epochs(60000, 1), seed + 11)
    out.append(Suspect("more", "descendant", more))
    rolled = torch.roll(train.x.reshape(-1, 28, 28), (2, 2), (1, 2))
    shift = classify(
        clone(base), rolled.reshape(-1, 784), train.y, 470, seed + 12
    )
    out.append(Suspect("shift", "descendant", shift))
    out += [
        Suspect(f"noise-{s}", "descendant", noised(base, s, seed + 13))
        for s in p.sigma
    ]
    out += [
        Suspect(f"prune-{f}", "descendant", pruned(base, f)) for f in p.prune
    ]
    out.append(Suspect("lie", "descendant", lie(base, seed)))
    return out


def imitators(base: Net, seed: int) -> list[Suspect]:
    p = load()
    train = digits(True).x
    out = [
        Suspect(
            f"digits-{e}",
            "imitator",
            imitate_inputs(
                fresh(seed + 600, p.layers),
                base,
                train,
                epochs(60000, e),
                seed + 50,
            ),
        )
        for e in p.digits_epochs
    ]
    out.append(Suspect("both", "imitator", _imitate_both(base, seed + 700)))
    top = out[len(p.digits_epochs) - 1].net
    retrained = _clothes(top, 1000, seed)
    out.append(Suspect("digits-20-retrained", "imitator", retrained))
    return out


def strangers(seed: int) -> list[Suspect]:
    out = [
        Suspect(f"same-{j}", "stranger", trained(seed + 800 + j))
        for j in range(3)
    ]
    out.append(Suspect("wide", "stranger", trained(seed + 850, WIDE)))
    retrained = _clothes(out[0].net, 1000, seed)
    out.append(Suspect("same-0-retrained", "stranger", retrained))
    return out


def reborn(by_name: dict[str, Net], seed: int) -> list[Suspect]:
    return [
        Suspect(
            "reborn-clothes",
            "reborn",
            _imitate_both(by_name["clothes-1000"], seed + 710),
        ),
        Suspect(
            "reborn-more", "reborn", _imitate_both(by_name["more"], seed + 720)
        ),
    ]


def lineup(base: Net, seed: int) -> list[Suspect]:
    family = descendants(base, seed)
    by_name = {s.name: s.net for s in family}
    return (
        family
        + imitators(base, seed)
        + strangers(seed)
        + reborn(by_name, seed)
    )
