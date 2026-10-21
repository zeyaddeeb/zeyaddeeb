from math import log, sqrt

KEEP = 24
WARM = 2.0


def choose(state, names: tuple[str, ...]) -> str:
    if not names:
        raise ValueError("no fronts")

    if len(names) == 1:
        return names[0]

    rounds = sum(len(state.arms.get(name, [])) for name in names)
    fresh = [name for name in names if not state.arms.get(name)]

    if fresh:
        return _other(state, fresh, names)

    ranked = sorted(
        names,
        key=lambda name: -_score(state.arms[name], rounds),
    )

    return _other(state, ranked, names)


def _other(state, ranked: list[str], names: tuple[str, ...]) -> str:
    for name in ranked:
        if name != state.last_front:
            return name

    return ranked[0] if ranked else names[0]


def _score(pulls: list[float], rounds: int) -> float:
    if not pulls:
        return float("inf")

    mean = sum(pulls) / len(pulls)

    return mean + WARM * sqrt(log(max(rounds, 2)) / len(pulls))


def reward(state, name: str, value: float) -> None:
    pulls = state.arms.setdefault(name, [])
    pulls.append(value)

    if len(pulls) > KEEP:
        del pulls[:-KEEP]
