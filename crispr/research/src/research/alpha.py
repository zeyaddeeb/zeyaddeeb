from dataclasses import dataclass, field
from math import pi

TARGET = 0.05
START = TARGET / 2
WEIGHT = 6.0 / (pi * pi)


def gamma(step: int) -> float:
    if step < 1:
        return 0.0

    return WEIGHT / (step * step)


@dataclass(slots=True)
class Ledger:
    tested: int = 0
    rejected: int = 0
    at: list[int] = field(default_factory=list)

    def budget(self) -> float:
        step = self.tested + 1
        found = gamma(step) * START

        for order, when in enumerate(self.at):
            if when >= step:
                continue

            share = TARGET - START if order == 0 else TARGET
            found += share * gamma(step - when)

        return min(found, TARGET)

    def spend(self, p: float) -> tuple[float, bool]:
        budget = self.budget()
        self.tested += 1
        rejected = p <= budget

        if rejected:
            self.rejected += 1
            self.at.append(self.tested)

        return budget, rejected

    def state(self) -> dict:
        return {
            "tested": self.tested,
            "rejected": self.rejected,
            "budget": round(self.budget(), 6),
            "target": TARGET,
        }
