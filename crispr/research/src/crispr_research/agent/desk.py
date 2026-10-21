import asyncio
import json
import re
import time
from dataclasses import dataclass

from .. import cards, evidence, referee
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
        self.current: dict = {}

    async def handle(self, call: Call) -> Done:
        if self.conclusion is not None:
            return refused("The episode has already concluded.")

        shape = f"{call.tool}:{sorted(call.args.items())!r}"

        if shape in self.seen:
            return refused(
                REPEATED + "Send something different or call conclude."
            )

        self.seen.add(shape)

        if self.agent.evaluation is not None and call.tool in (
            "inspect",
            "search_trials",
        ):
            return refused("Retrieval is unavailable during evaluation.")
        sync = {"plan": self._plan, "conclude": self._conclude}
        asynchronous = {
            "probe": self._probe,
            "inspect": self._inspect,
            "search_trials": self._search,
        }
        if call.tool in sync:
            return sync[call.tool](call)
        if call.tool in asynchronous:
            return await asynchronous[call.tool](call)
        return refused(f"There is no tool called {call.tool}.")

    async def _search(self, call: Call) -> Done:
        condition = str(call.args.get("condition", "")).strip()[:200]
        if not condition:
            return refused("Supply a condition to search.")
        found = await asyncio.to_thread(later.search, condition, 10)
        studies = []
        for study in found:
            identifiers = study.get("protocolSection", {}).get(
                "identificationModule", {}
            )
            studies.append(
                {
                    "trial": identifiers.get("nctId", ""),
                    "title": identifiers.get("briefTitle", ""),
                }
            )
        return Done(
            True,
            "Registry identifiers; use inspect for current observations.",
            {"studies": studies},
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
            if problem := self._eligible(card):
                raise cards.Refused(problem)
        except cards.Refused as refusal:
            self._record(None, "refused", 0.0, None)

            return refused(str(refusal))

        trial = self.agent.evaluation
        source = trial["source"] if trial else evidence.provenance(card.kernel)
        identity = evidence.experiment(card, source)
        previous = self.agent.store.observation(identity)
        if previous is not None:
            return Done(
                True,
                "Already observed on this data version; no new score. "
                "Use the saved evidence to choose a new case.",
                previous,
            )

        reference = 0.5 if trial else await self._reference(card)
        seal = cards.seal(card)
        self.agent.store.put_claim(
            {
                "seal": seal,
                "episode": self.number,
                "at": now(),
                "card": json.loads(cards.canonical(card)),
                "reference": reference,
                "source": source,
                "model": self.agent.config.model,
            }
        )
        if trial:
            fields, ungraded = trial["fields"], None
        else:
            fields, ungraded = await asyncio.to_thread(_run, card)
        self.current = {
            "experiment": identity,
            "source": source,
            "fields": fields,
            "ungraded": ungraded,
        }

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
        skill = (
            -((card.chance - float(verdict.held)) ** 2)
            if trial
            else earned
            if gate.scores(card.kernel)
            else 0.0
        )
        spread = referee.interval(card, verdict.observed)
        covered = referee.covered(card, verdict.observed)
        state = "held" if verdict.held else "broken"

        self._record(
            card,
            state,
            skill,
            verdict,
            reference=reference,
            spread=spread,
            covered=covered,
        )

        return Done(
            ok=True,
            summary=self._said(card, verdict, skill, reference, covered)
            + (
                " Evaluation score is negative Brier loss."
                if trial
                else self._ungated(card, earned)
            )
            + (
                " Rank is descriptive, not a p-value or a discovery."
                if card.kernel == "kill"
                else ""
            ),
            data=fields | {"seal": seal[:12]},
        )

    def _eligible(self, card: cards.Card) -> str:
        trial = self.agent.evaluation
        if trial is not None:
            if evidence.task(card) != trial["task"]:
                return (
                    "Predict exactly the assigned case, field and threshold."
                )
            if any(row["field"] for row in self.cards):
                return "The assigned prediction is already sealed."
        elif card.kernel == "kill" and evidence.reserved(
            str(card.probe["gene"])
        ):
            return "This gene is reserved for evaluation; choose another."
        return ""

    async def _inspect(self, call: Call) -> Done:
        kernel = str(call.args.get("kernel", ""))
        if kernel not in cards.KERNELS:
            return refused("Name a supported kernel.")
        if not call.args.get("probe"):
            source = evidence.provenance(kernel)
            data = {
                "fields": cards.FIELDS[kernel],
                "inputs": cards.PROBES[kernel],
                "source": source,
                "status": self.agent.capabilities.get(kernel, {}),
                "choices": cards.CHOICES.get(kernel, {}),
            }
            query = str(call.args.get("query", "")).upper()[:40]
            if kernel == "kill":
                data["genes"] = [
                    g
                    for g in sorted(kill.genes())
                    if query in g and not evidence.reserved(g)
                ][:40]
            if kernel == "matter" and matter.ready():
                data["classes"] = matter.classes()
            return Done(True, "Available evidence and provenance.", data)
        try:
            card = cards.compile_card(
                {
                    "kernel": kernel,
                    "probe": call.args["probe"],
                    "question": "Exploratory observation, not a prediction",
                    "field": cards.FIELDS[kernel][0],
                    "op": ">",
                    "value": 0,
                    "chance": 0.5,
                    "low": 0,
                    "high": 0,
                }
            )
        except cards.Refused as error:
            return refused(str(error))
        if kernel == "kill" and evidence.reserved(str(card.probe["gene"])):
            return refused(
                "This gene is reserved for evaluation; choose another."
            )
        source = evidence.provenance(kernel)
        identity = evidence.experiment(card, source)
        if previous := self.agent.store.observation(identity):
            return Done(True, "Previously observed evidence.", previous)
        fields, ungraded = await asyncio.to_thread(_run, card)
        row = {
            "episode": self.number,
            "at": now(),
            "source": source,
            "card": json.loads(cards.canonical(card)),
            "fields": fields,
            "verdict": "unresolved" if ungraded else "explored",
            "reason": ungraded,
            "skill": 0.0,
        }
        if not ungraded:
            self.agent.store.put_observation(identity, row)
        return Done(
            True,
            "Exploration earns no score. Confirm on unseen evidence.",
            row,
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
        asked = prompts.reference(card)
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
        if self.agent.evaluation is not None:
            return (
                f"The assigned statement {outcome}; observed "
                f"{verdict.observed:.4g}. Negative Brier loss: {skill:.4f}."
            )
        inside = "inside" if covered else "outside"
        unit = "negative Brier loss" if self.agent.evaluation else "bits"

        return (
            f"Sealed, then run. {card.field} came out "
            f"{verdict.observed:.4g}, so {card.field} {card.op} "
            f"{card.value:g} {outcome}. You said {card.chance:.2f}, the "
            f"forecaster said {reference:.2f}, so you earned "
            f"{skill:+.2f} {unit}. The observed value fell {inside} your "
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
        if card is not None:
            observation = {
                **row,
                **self.current,
                "card": json.loads(cards.canonical(card)),
            }
            if state != "unresolved":
                self.agent.store.put_observation(
                    self.current["experiment"], observation
                )
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
        numeric: dict[str, float] = {}
        for name, value in card.probe.items():
            if not isinstance(value, (int, float)):
                raise cards.Refused(f"{name} must be numeric")
            numeric[name] = value
        return reach.probe(numeric, gate.sink()), None

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
