import asyncio
import json
import re
import time
from dataclasses import dataclass

from .. import cards, evidence, referee
from ..kernels import gate, kill, later, matter, reach
from ..live import now
from . import fronts, prompts
from .llm import Ask, Call

ANSWER = re.compile(r"\s*(\d*\.?\d+)\s*(%?)\s*\.?\s*")
MIDDLE = 0.5
REPEATED = "You have sent this before. "


@dataclass(frozen=True, slots=True)
class Done:
    ok: bool
    summary: str
    data: dict | None = None


@dataclass(frozen=True, slots=True)
class Admitted:
    card: cards.Card
    source: dict
    identity: str
    read: tuple[dict[str, float], str | None] | None


def refused(message: str) -> Done:
    return Done(ok=False, summary=message)


class Desk:
    def __init__(
        self, number: int, agent, front: fronts.Front | None = None
    ) -> None:
        self.number = number
        self.agent = agent
        self.front = front
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
            "Active trial identifiers; use inspect to check details or probe "
            "to place an open bet.",
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

        admitted = await self._admit(call.args)

        if isinstance(admitted, Done):
            return admitted

        card = admitted.card
        trial = self.agent.evaluation
        reference = MIDDLE if trial else await self._reference(card)
        seal = cards.seal(card)
        self.agent.store.put_claim(
            {
                "seal": seal,
                "episode": self.number,
                "at": now(),
                "card": json.loads(cards.canonical(card)),
                "reference": reference,
                "source": admitted.source,
                "model": self.agent.config.model,
            }
        )
        if trial:
            fields, ungraded = trial["fields"], None
        elif admitted.read is not None:
            fields, ungraded = admitted.read
        else:
            fields, ungraded = await asyncio.to_thread(_run, card)
        self.current = {
            "experiment": admitted.identity,
            "source": admitted.source,
            "fields": fields,
            "ungraded": ungraded,
        }

        if ungraded:
            return self._unresolved(card, ungraded, reference)

        if card.kernel == "later" and later.open_bet(card.field, fields):
            return self._left_open(card, fields, reference)

        return self._graded(card, fields, reference)

    async def _admit(self, raw: dict) -> Admitted | Done:
        try:
            card = cards.compile_card(raw)
            if problem := self._eligible(card):
                raise cards.Refused(problem)
        except cards.Refused as refusal:
            return self._refuse(raw, str(refusal))

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

        if card.kernel != "later" or trial:
            return Admitted(card, source, identity, None)

        read = await asyncio.to_thread(_run, card)

        if problem := _unsettled(card, *read):
            return self._refuse(raw, problem)

        return Admitted(card, source, identity, read)

    def _unresolved(
        self, card: cards.Card, ungraded: str, reference: float | None
    ) -> Done:
        self._record(card, "unresolved", 0.0, None, reference=reference)

        return Done(
            ok=True,
            summary=(
                f"Sealed, then run, and no verdict came back: {ungraded}. "
                "That scores nothing and is not a failure; ask something "
                "the referee can answer."
            ),
        )

    def _left_open(
        self,
        card: cards.Card,
        fields: dict[str, float],
        reference: float | None,
    ) -> Done:
        stated = cards.describe(json.loads(cards.canonical(card)))
        self._record(card, "open", 0.0, None, reference=reference)

        return Done(
            ok=True,
            summary=(
                f"Sealed: {stated.context}, {stated.claim}. It is left open, "
                "because that trial has not reported. The bet is kept with "
                "its seal and will be settled when the registry says so. It "
                "scores nothing today, and nothing you learn later can change "
                "what you wrote." + _unpriced(reference)
            ),
            data=fields | {"seal": cards.seal(card)[:12]},
        )

    def _graded(
        self,
        card: cards.Card,
        fields: dict[str, float],
        reference: float | None,
    ) -> Done:
        trial = self.agent.evaluation
        verdict = referee.grade(card, fields)

        if trial:
            earned = None
            calibrated = True
            paid = True
            skill = -((card.chance - float(verdict.held)) ** 2)
        else:
            earned = (
                None
                if reference is None
                else referee.skill(card, verdict, reference)
            )
            calibrated = gate.scores(card.kernel)
            paid = earned is not None and calibrated
            skill = earned if paid and earned is not None else 0.0

        covered = referee.covered(card, verdict.observed)

        self._record(
            card,
            "held" if verdict.held else "broken",
            skill,
            verdict,
            reference=reference,
            spread=referee.interval(card, verdict.observed),
            covered=covered,
            paid=paid,
        )

        return Done(
            ok=True,
            summary=self._said(
                card,
                fields=fields,
                verdict=verdict,
                skill=skill,
                reference=reference,
                covered=covered,
            )
            + (
                " Evaluation score is negative Brier loss."
                if trial
                else self._unpaid(card, earned, reference, calibrated)
            )
            + (
                " Rank is descriptive, not a p-value or a discovery."
                if card.kernel == "kill"
                else ""
            ),
            data=fields | {"seal": cards.seal(card)[:12]},
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
        else:
            if (
                self.front is not None
                and card.kernel not in self.front.kernels
            ):
                allowed = ", ".join(self.front.kernels)
                return f"This front uses {allowed}, not {card.kernel}."
            if card.kernel == "kill" and evidence.reserved(
                str(card.probe["gene"])
            ):
                return "This gene is reserved for evaluation; choose another."
        return ""

    async def _inspect(self, call: Call) -> Done:
        kernel = str(call.args.get("kernel", "")).strip().lower()
        if kernel not in cards.KERNELS:
            return refused("Name a supported kernel.")
        if self.front is not None and kernel not in self.front.kernels:
            allowed = ", ".join(self.front.kernels)
            return refused(f"This front uses {allowed}, not {kernel}.")
        if not call.args.get("probe"):
            return self._inspect_sources(kernel, call.args.get("query", ""))
        return await self._inspect_probe(kernel, call.args["probe"])

    def _inspect_sources(self, kernel: str, raw_query: object) -> Done:
        source = evidence.provenance(kernel)
        data = {
            "fields": cards.FIELDS[kernel],
            "inputs": cards.PROBES[kernel],
            "source": source,
            "status": self.agent.capabilities.get(kernel, {}),
            "choices": cards.CHOICES.get(kernel, {}),
        }
        query = str(raw_query).upper()[:40]
        if kernel == "kill":
            data["genes"] = [
                g
                for g in sorted(kill.genes())
                if query in g and not evidence.reserved(g)
            ][:40]
        if kernel == "matter" and matter.ready():
            data["classes"] = matter.classes()
        return Done(True, "Available evidence and provenance.", data)

    async def _inspect_probe(self, kernel: str, given: object) -> Done:
        try:
            probe = cards.validate_probe(kernel, given)
        except cards.Refused as error:
            return refused(str(error))
        if kernel == "kill" and evidence.reserved(str(probe["gene"])):
            return refused(
                "This gene is reserved for evaluation; choose another."
            )
        source = evidence.provenance(kernel)
        identity = evidence.experiment_for(kernel, probe, source)
        if previous := self.agent.store.observation(identity):
            return Done(True, "Previously observed evidence.", previous)
        fields, ungraded = await asyncio.to_thread(_run_probe, kernel, probe)
        row = {
            "episode": self.number,
            "at": now(),
            "source": source,
            "card": {"kernel": kernel, "probe": probe},
            "fields": fields,
            "verdict": "unresolved" if ungraded else "explored",
            "reason": ungraded,
            "skill": 0.0,
        }
        if (
            kernel == "later"
            and not ungraded
            and fields.get("known", 0.0) == 0.0
        ):
            return Done(
                True,
                "Trial has not reported yet; you may place an open bet on it "
                "with probe.",
                row,
            )
        if not ungraded:
            self.agent.store.put_observation(identity, row)
        return Done(
            True,
            "Exploration earns no score. Confirm on unseen evidence.",
            row,
        )

    def _unpaid(
        self,
        card: cards.Card,
        earned: float | None,
        reference: float | None,
        calibrated: bool,
    ) -> str:
        if not calibrated:
            withheld = (
                f"the {earned:+.2f} bits it would have paid are withheld"
                if earned is not None
                else "nothing is paid"
            )

            return (
                f" The {card.kernel} referee is not calibrated against "
                f"anything measured, so it earns nothing here: {withheld}, "
                "and the verdict is kept as a record only."
            )

        return _unpriced(reference)

    async def _reference(self, card: cards.Card) -> float | None:
        preamble = prompts.reference_preamble(card.kernel)
        asked = prompts.reference(card)
        reply = await self.agent.ask(
            Ask(
                preamble=preamble,
                history=[],
                prompt={"role": "user", "content": asked},
                tools=[],
                max_tokens=self.agent.config.reference_tokens,
                thinking=False,
            )
        )

        return _parsed(reply.said)

    def _refuse(self, raw: dict, reason: str) -> Done:
        question = raw.get("question")
        self._record(
            None,
            "refused",
            0.0,
            None,
            reference=None,
            question=question[:240] if isinstance(question, str) else "",
            reason=reason,
        )

        return refused(reason)

    def _said(
        self,
        card: cards.Card,
        *,
        fields: dict[str, float],
        verdict: referee.Verdict,
        skill: float,
        reference: float | None,
        covered: bool,
    ) -> str:
        stated = cards.describe(json.loads(cards.canonical(card)))
        outcome = "held" if verdict.held else "did not hold"
        if self.agent.evaluation is not None:
            return (
                f"The assigned statement {outcome}; observed "
                f"{verdict.observed:.4g}. Negative Brier loss: {skill:.4f}."
            )
        inside = "inside" if covered else "outside"
        unit = f" {stated.unit}" if stated.unit else ""
        priced = (
            f"You said {card.chance:.2f}, the forecaster said "
            f"{reference:.2f}, so you earned {skill:+.2f} bits."
            if reference is not None
            else f"You said {card.chance:.2f}."
        )

        return " ".join(
            part
            for part in (
                f"Sealed, then run on {stated.context}.",
                _reading(card, fields),
                f"{card.field} came out {verdict.observed:.4g}{unit}, so "
                f"{stated.claim} {outcome}.",
                priced,
                f"The observed value fell {inside} your interval.",
            )
            if part
        )

    def _record(
        self,
        card: cards.Card | None,
        state: str,
        skill: float,
        verdict: referee.Verdict | None,
        *,
        reference: float | None = MIDDLE,
        spread: float = 0.0,
        covered: bool = False,
        paid: bool = False,
        question: str = "",
        reason: str = "",
    ) -> None:
        stated = (
            cards.describe(json.loads(cards.canonical(card)))
            if card
            else cards.Statement(claim="", context="", unit="")
        )
        row = {
            "episode": self.number,
            "seal": cards.seal(card) if card else "",
            "kernel": card.kernel if card else "",
            "question": card.question if card else question,
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
            "at": now(),
            "claim": stated.claim,
            "context": stated.context,
            "unit": stated.unit,
            "paid": paid,
            "reason": reason,
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
        if card is not None:
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
            if row["verdict"] in ("held", "broken") and row["paid"]
        ]

        if not graded:
            return 0.0

        return sum(graded) / len(graded)


def _run_probe(
    kernel: str, probe: dict[str, object]
) -> tuple[dict[str, float], str | None]:
    if kernel == "reach":
        numeric: dict[str, float] = {}
        for name, value in probe.items():
            if not isinstance(value, (int, float)):
                raise cards.Refused(f"{name} must be numeric")
            numeric[name] = value
        return reach.probe(numeric, gate.sink()), None

    if kernel == "later":
        bet = later.probe(probe, _today())

        return bet.fields, bet.ungraded

    if kernel == "matter":
        seen = matter.probe(probe)

        return seen.fields, seen.ungraded

    found = kill.probe(probe)

    return found.fields, found.ungraded


def _run(card: cards.Card) -> tuple[dict[str, float], str | None]:
    return _run_probe(card.kernel, card.probe)


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _parsed(text: str) -> float | None:
    found = ANSWER.fullmatch(text or "")

    if not found:
        return None

    value = float(found.group(1))

    if found.group(2):
        value /= 100.0

    return value if 0.0 <= value <= 1.0 else None


def _unpriced(reference: float | None) -> str:
    if reference is not None:
        return ""

    return (
        " The forecaster did not answer with a single probability, so there "
        "is nothing to measure you against and this card earns nothing."
    )


def _unsettled(
    card: cards.Card, fields: dict[str, float], ungraded: str | None
) -> str:
    if ungraded:
        return (
            f"The registry could not be read ({ungraded}), so nothing was "
            "sealed. Try again later or pick another trial."
        )

    if later.open_bet(card.field, fields):
        return ""

    return (
        f"{card.probe['trial']} already has its answer in the registry, so a "
        "card on it would be a lookup, not a forecast, and nothing was "
        "sealed. Bet on a trial that has not reported yet."
    )


def _reading(card: cards.Card, fields: dict[str, float]) -> str:
    if card.kernel != "reach":
        return ""

    radius = fields["depth_mm"] + fields["core_mm"]

    return (
        f"The drug kills to {fields['depth_mm']:.3f} mm below the surface "
        f"and never reaches the inner {fields['core_mm']:.3f} mm of a "
        f"{radius:.3g} mm radius."
    )
