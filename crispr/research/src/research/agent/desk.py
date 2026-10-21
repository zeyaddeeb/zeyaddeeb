import re
import time
from dataclasses import dataclass

from .. import cards, referee
from ..kernels import gate, kill, later, matter, reach
from ..live import now
from . import prompts
from .llm import Ask, Call

NUMBER = re.compile(r"\d*\.?\d+")
MIDDLE = 0.5
REPEATED = "You have sent this before. "


@dataclass(frozen=True, slots=True)
class Done:
    ok: bool
    summary: str
    data: dict | None = None


def refused(message: str) -> Done:
    return Done(ok=False, summary=message)


class Desk:
    def __init__(self, number: int, agent) -> None:
        self.number = number
        self.agent = agent
        self.planned = False
        self.conclusion: tuple[str, str] | None = None
        self.cards: list[dict] = []
        self.seen: set[str] = set()
        self.spent = 0.0

    async def handle(self, call: Call) -> Done:
        if self.conclusion is not None:
            return refused("The episode has already concluded.")

        shape = f"{call.tool}:{sorted(call.args.items())!r}"

        if shape in self.seen:
            return refused(
                REPEATED + "Send something different or call conclude."
            )

        self.seen.add(shape)

        match call.tool:
            case "plan":
                return self._plan(call)
            case "probe":
                return await self._probe(call)
            case "conclude":
                return self._conclude(call)
            case _:
                return refused(
                    f"There is no tool called {call.tool}; you have plan, "
                    "probe and conclude."
                )

    def _plan(self, call: Call) -> Done:
        aim = str(call.args.get("aim", "")).strip()
        risk = str(call.args.get("could_fail", "")).strip()

        if not aim or not risk:
            return refused("Say both: the aim, and how it could fail.")

        self.planned = True

        return Done(ok=True, summary=f"Planned: {aim}")

    def _conclude(self, call: Call) -> Done:
        found = str(call.args.get("found", "")).strip()
        next_up = str(call.args.get("next", "")).strip()

        if not found:
            return refused("Say what you found.")

        self.conclusion = (found, next_up)

        return Done(ok=True, summary="Concluded.")

    async def _probe(self, call: Call) -> Done:
        if not self.planned:
            return refused("Begin with plan, then probe.")

        try:
            card = cards.compile_card(call.args)
        except cards.Refused as refusal:
            self._record(None, "refused", 0.0, None)

            return refused(str(refusal))

        reference = await self._reference(card)
        seal = cards.seal(card)
        fields, ungraded = _run(card)

        if (
            not ungraded
            and card.kernel == "later"
            and later.open_bet(card.field, fields)
        ):
            self._record(card, "open", 0.0, None, reference=reference)

            return Done(
                ok=True,
                summary=(
                    f"Sealed and left open: {card.field} cannot be true or "
                    "false yet, because that trial has not reported. The bet "
                    "is kept with its seal and will be settled when the "
                    "registry says so. It scores nothing today, and nothing "
                    "you learn later can change what you wrote."
                ),
                data=fields | {"seal": seal[:12]},
            )

        if ungraded:
            self._record(card, "unresolved", 0.0, None, reference=reference)

            return Done(
                ok=True,
                summary=(
                    f"Sealed, then run, and no verdict came back: {ungraded}. "
                    "That scores nothing and is not a failure; ask something "
                    "the referee can answer."
                ),
            )

        verdict = referee.grade(card, fields)
        earned = referee.skill(card, verdict, reference)
        skill = earned if gate.scores(card.kernel) else 0.0
        spread = referee.interval(card, verdict.observed)
        covered = referee.covered(card, verdict.observed)
        state = "held" if verdict.held else "broken"
        tested, discovery = self._alpha(card, fields)

        self._record(
            card,
            state,
            skill,
            verdict,
            reference=reference,
            spread=spread,
            covered=covered,
            p=tested,
            discovery=discovery,
        )

        return Done(
            ok=True,
            summary=self._said(card, verdict, skill, reference, covered)
            + self._ungated(card, earned)
            + self._budgeted(card, tested, discovery),
            data=fields | {"seal": seal[:12]},
        )

    def _alpha(
        self, card: cards.Card, fields: dict[str, float]
    ) -> tuple[float | None, bool]:
        if card.kernel != "kill" or "rank" not in fields:
            return None, False

        budget, found = self.agent.alpha.spend(fields["rank"])
        self.spent = budget

        return fields["rank"], found

    def _budgeted(
        self, card: cards.Card, tested: float | None, discovery: bool
    ) -> str:
        if tested is None:
            return ""

        if discovery:
            return (
                f" It is also unusual enough to count: rank {tested:.4f} "
                f"against a budget of {self.spent:.4f}, so it is recorded as "
                "a discovery and the budget grows back."
            )

        return (
            f" It is not unusual enough to count as a discovery: rank "
            f"{tested:.4f} against a budget of {self.spent:.4f}. Every look "
            "spends from that budget, so ask about something that would "
            "surprise the data."
        )

    def _ungated(self, card: cards.Card, earned: float) -> str:
        if gate.scores(card.kernel):
            return ""

        return (
            f" The {card.kernel} referee is not calibrated against anything "
            f"measured, so it earns nothing here: the {earned:+.2f} bits it "
            "would have paid are withheld, and the verdict is kept as a "
            "record only."
        )

    async def _reference(self, card: cards.Card) -> float:
        asked = prompts.reference(
            card.question, card.field, card.op, card.value
        )
        reply = await self.agent.ask(
            Ask(
                preamble="",
                history=[],
                prompt={"role": "user", "content": asked},
                tools=[],
                max_tokens=self.agent.config.reference_tokens,
            )
        )

        return _parsed(reply.said or reply.thought)

    def _said(
        self,
        card: cards.Card,
        verdict: referee.Verdict,
        skill: float,
        reference: float,
        covered: bool,
    ) -> str:
        outcome = "held" if verdict.held else "did not hold"
        inside = "inside" if covered else "outside"

        return (
            f"Sealed, then run. {card.field} came out "
            f"{verdict.observed:.4g}, so {card.field} {card.op} "
            f"{card.value:g} {outcome}. You said {card.chance:.2f}, the "
            f"forecaster said {reference:.2f}, so you earned "
            f"{skill:+.2f} bits. The observed value fell {inside} your "
            f"interval."
        )

    def _record(
        self,
        card: cards.Card | None,
        state: str,
        skill: float,
        verdict: referee.Verdict | None,
        *,
        reference: float = MIDDLE,
        spread: float = 0.0,
        covered: bool = False,
        p: float | None = None,
        discovery: bool = False,
    ) -> None:
        row = {
            "episode": self.number,
            "seal": cards.seal(card) if card else "",
            "kernel": card.kernel if card else "",
            "question": card.question if card else "",
            "field": card.field if card else "",
            "op": card.op if card else "",
            "value": card.value if card else 0.0,
            "chance": card.chance if card else 0.0,
            "low": card.low if card else 0.0,
            "high": card.high if card else 0.0,
            "reference": reference,
            "observed": verdict.observed if verdict else 0.0,
            "held": bool(verdict.held) if verdict else False,
            "skill": skill,
            "spread": spread,
            "covered": covered,
            "verdict": state,
            "p": p,
            "discovery": discovery,
            "at": now(),
        }
        self.cards.append(row)
        self.agent.store.put_card(row)
        self.agent.state.cards += 1
        self.agent.save()
        self.agent.hub.emit(
            {
                "type": "card",
                "episode": self.number,
                "verdict": state,
                "seal": row["seal"][:12],
                "field": row["field"],
                "observed": row["observed"],
                "skill": skill,
            }
        )

    def reward(self) -> float:
        graded = [
            row["skill"]
            for row in self.cards
            if row["verdict"] in ("held", "broken")
        ]

        if not graded:
            return 0.0

        return sum(graded) / len(graded)


def _run(card: cards.Card) -> tuple[dict[str, float], str | None]:
    if card.kernel == "reach":
        return reach.probe(card.probe, gate.sink()), None

    if card.kernel == "later":
        bet = later.probe(card.probe, _today())

        return bet.fields, bet.ungraded

    if card.kernel == "matter":
        seen = matter.probe(card.probe)

        return seen.fields, seen.ungraded

    found = kill.probe(card.probe)

    return found.fields, found.ungraded


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _parsed(text: str) -> float:
    found = NUMBER.search(text or "")

    if not found:
        return MIDDLE

    try:
        value = float(found.group())
    except ValueError:
        return MIDDLE

    if value > 1.0:
        value = value / 100.0 if value <= 100.0 else MIDDLE

    return min(max(value, 0.0), 1.0)
