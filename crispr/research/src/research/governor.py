from dataclasses import dataclass

DAY = 86_400_000
STEP = 6_364_136_223_846_793_005
SHIFT = 17
MOST = 16


@dataclass(slots=True)
class Ledger:
    day_start: int = 0
    spent: int = 0
    failures: int = 0


@dataclass(frozen=True, slots=True)
class Limits:
    tokens_per_day: int
    backoff: int
    backoff_max: int
    failures: int


@dataclass(frozen=True, slots=True)
class Wait:
    kind: str
    ms: int
    reason: str


def jitter(seed: int, span: int) -> int:
    if span <= 0:
        return 0

    mixed = (seed * STEP) & 0xFFFF_FFFF_FFFF_FFFF
    rotated = ((mixed << SHIFT) | (mixed >> (64 - SHIFT))) & (
        0xFFFF_FFFF_FFFF_FFFF
    )

    return rotated % span


class Governor:
    def __init__(self, limits: Limits, ledger: Ledger) -> None:
        self.limits = limits
        self.ledger = ledger
        self.blocked_until = 0

    def remaining(self, at: int) -> int:
        if at - self.ledger.day_start >= DAY:
            return self.limits.tokens_per_day

        return max(0, self.limits.tokens_per_day - self.ledger.spent)

    def check(self, at: int) -> Wait | None:
        if at - self.ledger.day_start >= DAY:
            self.ledger.day_start = at - at % DAY
            self.ledger.spent = 0

        if at < self.blocked_until:
            return Wait(
                "backoff",
                self.blocked_until - at,
                "the model server is not answering",
            )

        if self.ledger.spent >= self.limits.tokens_per_day:
            return Wait(
                "budget",
                self.ledger.day_start + DAY - at,
                "it has spent its tokens for the day",
            )

        return None

    def spend(self, tokens: int) -> None:
        self.ledger.spent += tokens
        self.ledger.failures = 0

    def fail(self, at: int) -> Wait:
        self.ledger.failures += 1
        step = min(self.ledger.failures - 1, MOST)
        delay = min(self.limits.backoff * (1 << step), self.limits.backoff_max)
        waited = delay - jitter(at, delay // 4)
        self.blocked_until = at + waited

        return Wait("backoff", waited, "the model server is not answering")

    def exhausted(self) -> bool:
        return self.ledger.failures >= self.limits.failures
