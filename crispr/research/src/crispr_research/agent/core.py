import asyncio

from ..alpha import Ledger as Alpha
from ..calibration import report
from ..config import Config, Mode
from ..governor import DAY, Governor, Limits, Wait
from ..live import Hub, now
from ..store import Store
from . import fronts
from .llm import Ask, Dropped, Llm, Reply

DROPS = 3
SLICE = 5
RECONNECT = 2
RECONNECT_MAX = 30


class Stop(Exception):
    def __init__(self, why: str) -> None:
        super().__init__(why)
        self.why = why


class Agent:
    def __init__(
        self,
        config: Config,
        store: Store,
        hub: Hub,
        llm: Llm | None = None,
        *,
        parent: Agent | None = None,
        evaluation: dict | None = None,
    ) -> None:
        self.parent = parent
        self.evaluation = evaluation
        self.capabilities: dict = {}
        self.config = config
        self.store = store
        self.hub = hub
        self.llm = llm or Llm(config.llm_url, config.api_key, config.model)
        self.state = store.state()

        if not self.state.awake_since:
            self.state.awake_since = now()

        self.alpha = Alpha(
            tested=self.state.tested,
            rejected=self.state.rejected,
            at=list(self.state.found),
        )
        self.governor = Governor(
            Limits(
                tokens_per_day=config.tokens_per_day,
                backoff=config.backoff_seconds * 1000,
                backoff_max=config.backoff_max_seconds * 1000,
                failures=config.failures,
            ),
            self.state.budget,
        )

    def stopping(self) -> bool:
        return self.hub.closing() or bool(
            self.parent and self.parent.stopping()
        )

    def save(self) -> None:
        self.state.budget = self.governor.ledger
        self.state.tested = self.alpha.tested
        self.state.rejected = self.alpha.rejected
        self.state.found = list(self.alpha.at)
        self.store.save_state(self.state)
        self.hub.emit({"type": "stats", "state": self.vitals()})

    def vitals(self) -> dict:
        return {
            "episodes": self.state.episodes,
            "cards": self.state.cards,
            "tokens": self.state.tokens,
            "spent": self.governor.ledger.spent,
            "remaining": self.governor.remaining(now()),
            "awakeSince": self.state.awake_since,
        }

    async def ask(
        self, ask: Ask, on_delta=None, *, require_full_budget: bool = False
    ) -> Reply:
        if self.parent is not None:
            return await self.parent.ask(
                ask, on_delta, require_full_budget=True
            )
        drops = 0

        while True:
            if self.stopping():
                raise Stop("shutdown")

            waiting = self.governor.check(now())

            if waiting is not None:
                await self.pause(waiting)
                continue

            budget = self.governor.remaining(now())
            if require_full_budget and budget < ask.max_tokens:
                if self.config.tokens_per_day < ask.max_tokens:
                    raise Stop(
                        "daily budget is too small for a fair evaluation"
                    )
                await self.pause(
                    Wait(
                        "budget",
                        max(1, self.governor.ledger.day_start + DAY - now()),
                        "waiting for the full evaluation allowance",
                    )
                )
                continue
            capped = Ask(
                preamble=ask.preamble,
                history=ask.history,
                prompt=ask.prompt,
                tools=ask.tools,
                max_tokens=min(ask.max_tokens, budget),
            )

            try:
                reply = await asyncio.wait_for(
                    self.llm.reply(capped, on_delta),
                    timeout=self.config.turn_seconds,
                )
            except (Dropped, TimeoutError) as error:
                drops += 1
                self.hub.emit({"type": "retry", "drops": drops})

                if drops < DROPS:
                    await self.reconnect(drops)
                    continue

                waiting = self.governor.fail(now())
                self.hub.emit({"type": "trouble", "message": str(error)})

                if self.governor.exhausted():
                    self.save()
                    raise Stop("gave up") from error

                await self.pause(waiting)
                drops = 0
                continue

            self.governor.spend(reply.processed())
            self.state.tokens += reply.tokens
            self.save()

            return reply

    async def pause(self, waiting) -> None:
        self.hub.emit(
            {
                "type": "phase",
                "phase": "rest",
                "seconds": waiting.ms // 1000,
                "reason": waiting.reason,
            }
        )
        self.save()
        await self.nap(waiting.ms / 1000)

    async def reconnect(self, drops: int) -> None:
        delay = min(RECONNECT * (1 << (drops - 1)), RECONNECT_MAX)
        await self.nap(delay)

    async def nap(self, seconds: float) -> None:
        left = seconds

        while left > 0:
            if self.stopping():
                return

            await asyncio.sleep(min(SLICE, left))
            left -= SLICE

    def watched(self) -> bool:
        return self.config.mode is Mode.WATCHED

    def rules(self) -> dict:
        champion = self.store.rules("playbook", self.state.rules)
        challenger = self.store.rules("playbook", self.state.challenger)

        return {
            "champion": self.state.rules,
            "challenger": self.state.challenger,
            "lines": champion["lines"] if champion else [],
            "trying": challenger["lines"] if challenger else [],
            "because": challenger["because"] if challenger else "",
            "pairs": len(challenger["pairs"]) if challenger else 0,
            "trialPairs": len(
                self.store.meta(
                    f"evaluation:{self.state.challenger}", {"cases": []}
                )["cases"]
            )
            or self.config.trial_pairs,
            "kept": [
                {
                    "version": one["version"],
                    "lines": one["lines"],
                    "because": one["because"],
                    "gain": one["gain"],
                    "p": one["p"],
                    "standing": one["standing"],
                }
                for one in self.store.lineage("playbook")
                if one["gain"] is not None
            ],
        }

    def calibration(self) -> dict:
        said, happened = self.store.forecasts()
        found = report(said, happened)

        return {
            "cards": found.cards,
            "enough": found.enough,
            "brier": round(found.brier, 4),
            "reliability": round(found.reliability, 4),
            "resolution": round(found.resolution, 4),
            "z": round(found.z, 3),
            "bins": [
                {
                    "low": one.low,
                    "high": one.high,
                    "count": one.count,
                    "said": round(one.said, 3),
                    "happened": round(one.happened, 3),
                    "lower": round(one.lower, 3),
                    "upper": round(one.upper, 3),
                }
                for one in found.bins
            ],
        }

    def overview(self) -> dict:
        return {
            "about": {
                "mode": self.config.mode.value,
                "model": self.config.model,
                "actions": self.config.actions,
                "tokensPerDay": self.config.tokens_per_day,
            },
            "state": self.vitals(),
            "fronts": [
                {
                    "id": front.id,
                    "title": front.title,
                    "question": front.question,
                    "kernels": list(front.kernels),
                }
                for front in fronts.FRONTS
            ],
            "backlog": self.hub.backlog(),
            "episodes": self.store.episodes(0, 20),
            "cards": self.store.cards(40),
            "rules": self.rules(),
            "alpha": {"enabled": False, "reason": "Ranks are not p-values."},
            "capabilities": self.capabilities,
            "evaluation": self.store.meta("evaluation_status", {}),
            "calibration": self.calibration(),
            "tally": self.store.tally(),
            "watchers": self.hub.watchers(),
        }
