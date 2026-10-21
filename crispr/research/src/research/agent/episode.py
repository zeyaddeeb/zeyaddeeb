from ..live import now
from . import fronts, prompts, tools
from .core import Agent
from .desk import Desk
from .llm import Ask, Reply

NUDGES = 2
CUT = 400
RECENT = 3


async def run(
    agent: Agent, front: fronts.Front, rules: list[str] | None = None
) -> dict:
    number = agent.state.episodes + 1
    started = now()
    desk = Desk(number, agent)
    preamble = prompts.researcher(agent.config.actions, rules or [])
    history: list[dict] = []
    pending: dict | None = {
        "role": "user",
        "content": prompts.brief(front, standing(agent, front)),
    }
    record = {
        "number": number,
        "front": front.id,
        "question": front.question,
        "started": started,
        "ended": 0,
        "turns": 0,
        "tokens": 0,
        "reward": 0.0,
        "summary": "",
        "next": "",
    }
    nudges = 0

    for turn in range(agent.config.actions):
        if pending is None:
            break

        prompt = pending
        pending = None
        reply = await agent.ask(
            Ask(
                preamble=preamble,
                history=history,
                prompt=prompt,
                tools=tools.definitions(),
                max_tokens=agent.config.max_tokens,
            ),
            _delta(agent, turn),
        )
        _remember(agent, record, turn, reply)
        history.append(prompt)
        history.append(reply.message())
        results = await act(agent, desk, number, turn, reply)

        if desk.conclusion is not None:
            break

        if results:
            history.extend(results[:-1])
            pending = results[-1]
        elif nudges < NUDGES:
            nudges += 1
            pending = {"role": "user", "content": prompts.NUDGE}

    if desk.conclusion is None and not agent.stopping():
        if pending is not None and pending["role"] == "tool":
            history.append(pending)

        await close(agent, desk, record, preamble, history)

    found, next_up = desk.conclusion or ("cut off", "")
    record["summary"] = found
    record["next"] = next_up
    record["reward"] = desk.reward()
    record["ended"] = now()
    agent.store.put_episode(record)
    agent.hub.emit({"type": "concluded", "episode": record})

    return record


def _remember(agent: Agent, record: dict, turn: int, reply: Reply) -> None:
    record["turns"] += 1
    record["tokens"] += reply.tokens
    agent.store.put_turn(
        {
            "episode": record["number"],
            "idx": turn,
            "thought": reply.thought,
            "said": reply.said,
            "tokens": reply.tokens,
            "at": now(),
        }
    )


async def act(
    agent: Agent, desk: Desk, number: int, turn: int, reply
) -> list[dict]:
    results = []

    for call in reply.calls:
        agent.hub.emit(
            {
                "type": "call",
                "episode": number,
                "turn": turn,
                "id": call.id,
                "tool": call.tool,
                "args": call.args,
            }
        )
        done = await desk.handle(call)
        agent.store.put_act(
            {
                "episode": number,
                "turn": turn,
                "id": call.id,
                "tool": call.tool,
                "args": call.args,
                "ok": done.ok,
                "summary": done.summary,
                "at": now(),
            }
        )
        agent.hub.emit(
            {
                "type": "outcome",
                "episode": number,
                "turn": turn,
                "id": call.id,
                "tool": call.tool,
                "ok": done.ok,
                "summary": done.summary,
                "data": done.data,
            }
        )
        results.append(
            {
                "role": "tool",
                "tool_call_id": call.id,
                "content": done.summary,
            }
        )

    return results


async def close(
    agent: Agent,
    desk: Desk,
    record: dict,
    preamble: str,
    history: list[dict],
) -> None:
    turn = record["turns"]
    reply = await agent.ask(
        Ask(
            preamble=preamble,
            history=history,
            prompt={"role": "user", "content": prompts.FORCED},
            tools=tools.only("conclude"),
            max_tokens=CUT,
        ),
        _delta(agent, turn),
    )
    _remember(agent, record, turn, reply)
    await act(agent, desk, record["number"], turn, reply)


def standing(agent: Agent, front: fronts.Front) -> list[str]:
    lines = []

    for row in agent.store.cards(RECENT):
        if not row["field"] or row["kernel"] not in front.kernels:
            continue

        outcome = "held" if row["held"] else "did not hold"
        lines.append(
            f"{row['question']} ({row['field']} {row['op']} "
            f"{row['value']:g} {outcome}, {row['skill']:+.2f} bits)"
        )

    return lines


def _delta(agent: Agent, turn: int):
    def send(channel: str, text: str) -> None:
        agent.hub.emit(
            {
                "type": "delta",
                "turn": turn,
                "channel": channel,
                "text": text,
            }
        )

    return send
