from dataclasses import dataclass, field

from capacity.solver import Scenario
from capacity.world import INFERENCE_VALUE, SITES, TRAINING_VALUE, rtt_ms

TRAINING = "training"


@dataclass(slots=True)
class Board:
    sc: Scenario
    routes: dict[tuple[str, str], float] = field(default_factory=dict)

    def load(self, site: str) -> float:
        return sum(mw for (_, s), mw in self.routes.items() if s == site)

    def served(self, demand: str) -> float:
        return sum(mw for (d, _), mw in self.routes.items() if d == demand)

    def need(self, demand: str) -> float:
        return (
            self.sc.training if demand == TRAINING else self.sc.demand[demand]
        )

    def carbon(self) -> float:
        return sum(SITES[s].carbon * mw for (_, s), mw in self.routes.items())

    def reachable(self, demand: str, site: str) -> bool:
        if self.sc.capacity[site] <= 0:
            return False
        return demand == TRAINING or rtt_ms(demand, site) <= self.sc.latency

    def tap(self, demand: str, site: str) -> bool:
        if (demand, site) in self.routes:
            del self.routes[demand, site]
            return True
        if not self.reachable(demand, site):
            return False
        mw = min(
            self.need(demand) - self.served(demand),
            self.sc.capacity[site] - self.load(site),
        )
        if self.sc.carbon_cap is not None and SITES[site].carbon > 0:
            mw = min(
                mw, (self.sc.carbon_cap - self.carbon()) / SITES[site].carbon
            )
        mw = round(mw, 6)
        if mw <= 0:
            return False
        self.routes[demand, site] = mw
        return True

    def step(self, demand: str, site: str, delta: float) -> bool:
        current = self.routes.get((demand, site), 0.0)
        if delta < 0:
            if not current:
                return False
            mw = max(0.0, current + delta)
        else:
            if not self.reachable(demand, site):
                return False
            room = min(
                delta,
                self.need(demand) - self.served(demand),
                self.sc.capacity[site] - self.load(site),
            )
            if self.sc.carbon_cap is not None and SITES[site].carbon > 0:
                room = min(
                    room,
                    (self.sc.carbon_cap - self.carbon()) / SITES[site].carbon,
                )
            if room <= 0:
                return False
            mw = current + room
        mw = round(mw, 6)
        if mw:
            self.routes[demand, site] = mw
        else:
            self.routes.pop((demand, site), None)
        return True

    def cost(self) -> float:
        energy = sum(SITES[s].price * mw for (_, s), mw in self.routes.items())
        lost = sum(
            INFERENCE_VALUE * (mw - self.served(c))
            for c, mw in self.sc.demand.items()
        )
        lost += (
            TRAINING_VALUE * (self.sc.training - self.served(TRAINING))
            if self.sc.training
            else 0
        )
        return energy + lost

    def demands(self) -> list[str]:
        return [*self.sc.demand, *([TRAINING] if self.sc.training else [])]

    def pairs(self) -> list[tuple[str, str]]:
        return [
            (d, s)
            for d in self.demands()
            for s in self.sc.capacity
            if self.reachable(d, s)
        ]


def best_by_taps(sc: Scenario, depth: int = 9) -> float:
    best = Board(sc).cost()
    seen: set[frozenset] = set()
    stack = [Board(sc)]
    while stack:
        board = stack.pop()
        key = frozenset(board.routes.items())
        if key in seen:
            continue
        seen.add(key)
        best = min(best, board.cost())
        if len(board.routes) >= depth:
            continue
        for d, s in board.pairs():
            if (d, s) in board.routes:
                continue
            nxt = Board(sc, dict(board.routes))
            if nxt.tap(d, s):
                stack.append(nxt)
    return best


def cheapest_first(sc: Scenario) -> float:
    board = Board(sc)
    for d in board.demands():
        for s in sorted(sc.capacity, key=lambda s: SITES[s].price):
            board.tap(d, s)
    return board.cost()


def nearest_first(sc: Scenario) -> float:
    board = Board(sc)
    for d in board.demands():
        order = sorted(
            sc.capacity,
            key=lambda s: SITES[s].price if d == TRAINING else rtt_ms(d, s),
        )
        for s in order:
            board.tap(d, s)
    return board.cost()
