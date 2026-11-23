import logging
import time

from .. import cards, referee
from ..kernels import gate, later

log = logging.getLogger("crispr_research.watch")


def today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def settle(agent) -> int:
    bets = agent.store.open_bets()
    if not bets:
        return 0

    if not gate.scores("later"):
        return 0

    settled = 0

    for bet in bets:
        nct = _trial(bet)

        if not nct:
            continue

        found = later.reading(nct, today())

        if not later.settled(bet["field"], found):
            continue

        observed = found.fields.get(bet["field"])

        if observed is None:
            continue

        held = referee.holds(bet["op"], observed, bet["value"])
        skill = _skill(bet, held)
        low = float(bet["low"]) if bet.get("low") is not None else 0.0
        high = float(bet["high"]) if bet.get("high") is not None else 1.0
        spread = referee.interval_score(low, high, observed)
        covered = low <= observed <= high
        agent.store.resolve(
            bet["seal"],
            {
                "verdict": "held" if held else "broken",
                "observed": observed,
                "held": held,
                "skill": skill if skill is not None else 0.0,
                "spread": spread,
                "covered": covered,
                "paid": skill is not None,
                "fields": found.fields,
                "source": found.detail,
                "as_of": today(),
            },
        )
        agent.hub.emit(
            {
                "type": "settled",
                "seal": bet["seal"][:12],
                "field": bet["field"],
                "observed": observed,
                "held": held,
                "skill": skill if skill is not None else 0.0,
            }
        )
        settled += 1
        log.info("an open bet settled: %s %s", nct, bet["field"])

    return settled


def _skill(bet: dict, held: bool) -> float | None:
    if bet["reference"] is None:
        return None

    chance = min(max(float(bet["chance"]), cards.FLOOR), cards.CEILING)
    mine = chance if held else 1.0 - chance
    theirs = min(max(float(bet["reference"]), cards.FLOOR), cards.CEILING)
    theirs = theirs if held else 1.0 - theirs

    return referee.bits(mine, theirs)


def _trial(bet: dict) -> str:
    if trial := bet.get("probe", {}).get("trial"):
        return str(trial).upper()
    question = bet.get("question", "")
    mark = question.upper().find("NCT")

    if mark < 0:
        return ""

    return question[mark : mark + 11].upper()
