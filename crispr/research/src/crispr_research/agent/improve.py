import logging
from dataclasses import dataclass

from . import bandit, evaluation, fronts, prompts, rules
from .core import Agent
from .llm import Ask
from .rules import Layer, Standing

log = logging.getLogger("crispr_research.improve")
TURNS = 3
REVISE_TOKENS = 600


@dataclass(frozen=True, slots=True)
class Run:
    front: fronts.Front
    version: int
    lines: list[str]


def seed(agent: Agent) -> None:
    if agent.store.rules(Layer.PLAYBOOK.value, 1) is None:
        _put(agent, _fresh(1, Layer.PLAYBOOK, []), champion=True)
        agent.state.rules = 1

    if agent.store.rules(Layer.METHOD.value, 1) is None:
        _put(
            agent,
            _fresh(1, Layer.METHOD, list(rules.SEED_METHOD)),
            champion=True,
        )
        agent.state.method = 1


def _fresh(version: int, layer: Layer, lines: list[str]) -> dict:
    return {
        "version": version,
        "layer": layer.value,
        "parent": 0,
        "lines": lines,
        "standing": Standing.CHAMPION.value,
        "because": "",
        "gain": None,
        "p": None,
        "decided": 0,
        "pairs": [],
        "author": 0,
        "gains": [],
        "wins": 0,
        "tried": [],
    }


def _put(agent: Agent, row: dict, champion: bool = False) -> None:
    if champion:
        row["standing"] = Standing.CHAMPION.value

    agent.store.put_rules(row)
    agent.hub.emit(
        {
            "type": "rules",
            "layer": row["layer"],
            "version": row["version"],
            "standing": row["standing"],
            "lines": row["lines"],
        }
    )


def next_run(agent: Agent, names: tuple[str, ...] | None = None) -> Run:
    name = bandit.choose(
        agent.state, names if names is not None else fronts.ids()
    )
    row = agent.store.rules(Layer.PLAYBOOK.value, agent.state.rules)
    return Run(
        front=fronts.front(name),
        version=agent.state.rules,
        lines=row["lines"] if row else [],
    )


def _decide(agent: Agent, row: dict) -> bool:
    pairs = [
        rules.Pair(p["front"], p["champion"], p["challenger"])
        for p in row["pairs"]
    ]
    suite = agent.store.meta(f"evaluation:{row['version']}", {})
    found = rules.verdict(pairs, alpha=suite.get("alpha", 0.0))
    if not suite or not all(
        p["challenger"]["valid"] for p in suite.get("pairs", [])
    ):
        found = rules.Verdict(gain=found.gain, p=found.p, kept=False)
    row["gain"] = found.gain
    row["p"] = found.p
    row["decided"] = agent.state.episodes

    if found.kept:
        old = agent.store.rules(Layer.PLAYBOOK.value, agent.state.rules)

        if old:
            old["standing"] = Standing.RETIRED.value
            agent.store.put_rules(old)

        row["standing"] = Standing.CHAMPION.value
        agent.state.rules = row["version"]
    else:
        row["standing"] = Standing.LOST.value

    _put(agent, row)
    _credit(agent, row, found)
    agent.state.challenger = 0
    agent.state.half = None
    log.info(
        "a rules trial was decided: gain %.3f p %.3f kept %s",
        found.gain,
        found.p,
        found.kept,
    )

    return True


def _credit(agent: Agent, row: dict, found: rules.Verdict) -> None:
    author = agent.store.rules(Layer.METHOD.value, row["author"])

    if author is None:
        return

    author["gains"].append(found.gain)
    author["wins"] += int(found.kept)
    author["gain"] = rules.mean(author["gains"])
    agent.store.put_rules(author)


async def revise(agent: Agent, layer: Layer) -> bool:
    current = (
        agent.state.rules if layer is Layer.PLAYBOOK else agent.state.method
    )
    row = agent.store.rules(layer.value, current)

    if row is None:
        return False

    suite = evaluation.prepare(agent) if layer is Layer.PLAYBOOK else None
    if layer is Layer.PLAYBOOK and suite is None:
        return False
    lineage = agent.store.lineage(layer.value)
    method = agent.store.rules(Layer.METHOD.value, agent.state.method)
    preamble = prompts.reviser(
        layer.value,
        method["lines"] if method else [],
        len(suite["cases"]) if suite else agent.config.trial_pairs,
    )
    agent.hub.emit({"type": "revise", "layer": layer.value})
    history: list[dict] = []
    prompt = {
        "role": "user",
        "content": prompts.revision(
            layer.value,
            row["lines"],
            lineage,
            agent.store.episode_evidence()
            + agent.store.meta("last_evaluation", []),
        ),
    }

    for _ in range(TURNS):
        reply = await agent.ask(
            Ask(
                preamble=preamble,
                history=history,
                prompt=prompt,
                tools=[_tool(layer)],
                max_tokens=REVISE_TOKENS,
            )
        )
        history.append(prompt)
        history.append(reply.message())

        if not reply.calls:
            return False

        call = reply.calls[0]

        try:
            lines, because = rules.apply(
                layer, row["lines"], call.args, _lost(lineage)
            )
        except rules.Refused as refusal:
            prompt = {
                "role": "tool",
                "tool_call_id": call.id,
                "content": str(refusal),
            }
            continue

        _adopt(
            agent,
            layer,
            row,
            lines,
            because=because,
            args=call.args,
            suite=suite,
        )

        return True

    return False


def _lost(lineage: list[dict]) -> list[rules.Rules]:
    return [
        rules.Rules(
            version=one["version"],
            layer=one["layer"],
            parent=one["parent"],
            lines=one["lines"],
            standing=one["standing"],
            because=one["because"],
            gain=one["gain"],
            p=one["p"],
            tried=one["tried"],
        )
        for one in lineage
    ]


def _adopt(
    agent: Agent,
    layer: Layer,
    row: dict,
    lines: list[str],
    *,
    because: str,
    args: dict,
    suite: dict | None = None,
) -> None:
    version = (
        max(
            (one["version"] for one in agent.store.lineage(layer.value)),
            default=0,
        )
        + 1
    )
    made = {
        "version": version,
        "layer": layer.value,
        "parent": row["version"],
        "lines": lines,
        "standing": Standing.TRIAL.value,
        "because": because,
        "gain": None,
        "p": None,
        "decided": 0,
        "pairs": [],
        "author": agent.state.method,
        "gains": [],
        "wins": 0,
        "tried": [
            str(args.get("change", "")).strip().lower(),
            str(args.get("text", "")).strip(),
            row["lines"][int(args["rule"]) - 1]
            if args.get("change") == "rewrite" and args.get("rule")
            else "",
        ],
    }
    if layer is Layer.PLAYBOOK:
        if suite is None:
            raise ValueError("A rule trial needs reserved evaluation cases")
        evaluation.reserve(agent, version, suite)
    _put(agent, made)

    if layer is Layer.PLAYBOOK:
        agent.state.challenger = version
        agent.state.half = None
    else:
        agent.state.method = version

    agent.save()


def _tool(layer: Layer) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "revise",
            "description": (
                f"Change one of your {layer.value} rules. One change only, "
                "and say what you saw that it should fix."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "change": {
                        "type": "string",
                        "enum": ["add", "drop", "rewrite"],
                    },
                    "rule": {
                        "type": "integer",
                        "description": "which rule, for drop and rewrite",
                    },
                    "text": {
                        "type": "string",
                        "description": "the new wording, for add and rewrite",
                    },
                    "because": {
                        "type": "string",
                        "description": "what you saw that this should fix",
                    },
                },
                "required": ["change", "because"],
            },
        },
    }


async def review(agent: Agent) -> None:
    method = agent.store.rules(Layer.METHOD.value, agent.state.method)

    if method is None or method["standing"] != Standing.TRIAL.value:
        return

    if len(method["gains"]) < rules.META:
        return

    parent = agent.store.rules(Layer.METHOD.value, method["parent"])
    baseline = rules.mean(parent["gains"]) if parent else 0.0

    if rules.method_holds(method["gains"], baseline):
        method["standing"] = Standing.CHAMPION.value

        if parent:
            parent["standing"] = Standing.RETIRED.value
            agent.store.put_rules(parent)
    else:
        method["standing"] = Standing.REVERTED.value
        agent.state.method = method["parent"]

    _put(agent, method)
    agent.save()
