import logging

from ..live import now
from . import bandit, episode, improve, watch
from .core import Agent, Stop
from .rules import Layer

log = logging.getLogger("research.agent")


async def run(agent: Agent) -> None:
    log.info("the shift begins at episode %s", agent.state.episodes)

    try:
        while not agent.stopping():
            try:
                await shift(agent)
            except Stop as stop:
                if stop.why == "shutdown":
                    break

                log.warning("the shift stopped: %s", stop.why)
                await agent.nap(agent.config.backoff_seconds)

    finally:
        agent.save()
        log.info("the shift ends at episode %s", agent.state.episodes)


async def shift(agent: Agent) -> None:
    if agent.watched() and agent.hub.watchers() == 0:
        await rest(agent, 0)

        return

    recover(agent)

    if agent.stopping():
        return

    improve.seed(agent)
    watch.settle(agent)
    run = improve.next_run(agent)
    front = run.front
    agent.hub.emit(
        {
            "type": "wake",
            "episode": agent.state.episodes + 1,
            "front": front.id,
            "rules": len(run.lines),
        }
    )
    agent.state.open_front = front.id
    agent.state.open_since = now()
    agent.save()

    record = await episode.run(agent, front, run.lines)

    agent.state.episodes = record["number"]
    agent.state.last_front = front.id
    agent.state.open_front = ""
    bandit.reward(agent.state, front.id, record["reward"])
    judged = improve.settle(agent, front.id, run.version, record)
    agent.save()

    if judged:
        await improve.review(agent)

    if agent.state.challenger == 0 and not agent.stopping():
        await improve.revise(agent, Layer.PLAYBOOK)

    await rest(agent, _resting(agent))


def _resting(agent: Agent) -> int:
    if agent.hub.watchers() > 0:
        return agent.config.rest_seconds

    return agent.config.idle_rest_seconds


async def rest(agent: Agent, seconds: int) -> None:
    reason = (
        "it works only while someone is watching"
        if agent.watched() and agent.hub.watchers() == 0
        else "resting between episodes"
    )
    agent.hub.emit(
        {
            "type": "phase",
            "phase": "rest",
            "seconds": seconds or None,
            "reason": reason,
        }
    )

    if seconds:
        await agent.nap(seconds)

        return

    while not agent.stopping() and agent.hub.watchers() == 0:
        await agent.nap(agent.config.rest_seconds)


def recover(agent: Agent) -> None:
    if not agent.state.open_front:
        return

    number = agent.state.episodes + 1
    turns = agent.store.turns(number)
    record = {
        "number": number,
        "front": agent.state.open_front,
        "question": "",
        "started": agent.state.open_since,
        "ended": now(),
        "turns": len(turns),
        "tokens": sum(turn["tokens"] for turn in turns),
        "reward": 0.0,
        "summary": "cut off by a restart",
        "next": "",
    }
    agent.store.put_episode(record)
    agent.state.episodes = number
    agent.state.open_front = ""
    agent.save()
    agent.hub.emit({"type": "concluded", "episode": record})
    log.info("episode %s was closed after a restart", number)
