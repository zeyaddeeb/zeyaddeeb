"""Isolated, fixed-case policy evaluations on never-exposed dependency cases.

This measures predictive performance on a held-out part of the mounted release;
it does not establish independent biological replication or discoveries.
"""

import secrets
from dataclasses import replace
from math import ceil, log2

from .. import cards, evidence
from ..kernels import kill
from ..live import Hub
from ..store import Store
from . import episode, fronts, improve
from .core import Agent

FLOOR = 20
FAMILY_ALPHA = 0.05


def prepare(agent: Agent) -> dict | None:
    if not agent.capabilities.get("kill", {}).get("scores"):
        agent.store.put_meta(
            "evaluation_status",
            {
                "ready": False,
                "reason": "No calibrated dependency data for evaluation.",
            },
        )
        return None
    trial = int(agent.store.meta("evaluation_trials", 0)) + 1
    alpha = FAMILY_ALPHA / (trial * (trial + 1))
    count = max(agent.config.trial_pairs, ceil(-log2(alpha)))
    if count > 12:
        agent.store.put_meta(
            "evaluation_status",
            {
                "ready": False,
                "reason": "The testing budget needs more than 12 pairs; "
                "automatic revisions await a new evaluation protocol.",
            },
        )
        return None
    source = evidence.provenance("kill")
    used = agent.store.used_genes()
    genes = [
        g
        for g in sorted(kill.genes())
        if evidence.reserved(g)
        and g not in used
        and not agent.store.case_used(evidence.digest([source["dataset"], g]))
    ]
    secrets.SystemRandom().shuffle(genes)
    cases = []
    for gene in genes:
        found = kill.reading(gene, "all")
        if found.ungraded or found.fields.get("patients", 0) < FLOOR:
            continue
        raw = {
            "kernel": "kill",
            "question": f"Is {gene} essential across the colorectal panel?",
            "probe": {"gene": gene, "stratum": "all"},
            "field": "median",
            "op": "<",
            "value": -0.5,
            "chance": 0.5,
            "low": -2.0,
            "high": 0.0,
        }
        card = cards.compile_card(raw)
        if agent.store.observation(evidence.experiment(card, source)):
            continue
        cases.append(
            {
                "identity": evidence.digest([source["dataset"], gene]),
                "task": evidence.task(card),
                "fields": found.fields,
                "source": source,
                "memory": episode.standing(agent, fronts.SPARE),
                "first": secrets.randbelow(2),
            }
        )
        if len(cases) == count:
            break
    if len(cases) < count:
        agent.store.put_meta(
            "evaluation_status",
            {
                "ready": False,
                "reason": "Insufficient unseen evaluation cases.",
            },
        )
        return None
    return {
        "protocol": 2,
        "cases": cases,
        "pairs": [],
        "trial": trial,
        "alpha": alpha,
        "model": agent.config.model,
        "actions": agent.config.actions,
        "max_tokens": agent.config.max_tokens,
        "source": source,
    }


def reserve(agent: Agent, version: int, suite: dict) -> None:
    agent.store.db.execute("begin transaction")
    try:
        for case in suite["cases"]:
            if not agent.store.reserve_case(case["identity"], version):
                raise ValueError("An evaluation case was already reserved")
        agent.store.put_meta(f"evaluation:{version}", suite)
        agent.store.put_meta("evaluation_trials", suite["trial"])
        agent.store.put_meta(
            "evaluation_status",
            {
                "ready": True,
                "version": version,
                "cases": len(suite["cases"]),
                "alpha": suite["alpha"],
                "metric": "negative Brier loss",
            },
        )
        agent.store.db.execute("commit")
    except Exception:
        agent.store.db.execute("rollback")
        raise


async def _run(agent: Agent, case: dict, lines: list[str]) -> dict:
    store = Store(":memory:")
    sandbox = Agent(
        replace(agent.config, database=":memory:"),
        store,
        Hub(),
        agent.llm,
        parent=agent,
        evaluation=case,
    )
    try:
        record = await episode.run(sandbox, fronts.SPARE, lines)
        graded = [
            row
            for row in store.cards(10)
            if row["verdict"] in ("held", "broken")
        ]
        return {
            "reward": record["reward"] if graded else -1.0,
            "valid": len(graded) == 1,
            "evidence": store.episode_evidence(1),
        }
    finally:
        store.close()


async def step(agent: Agent) -> bool:
    version = agent.state.challenger
    row = agent.store.rules("playbook", version)
    suite = agent.store.meta(f"evaluation:{version}")
    if row is None:
        agent.state.challenger = 0
        agent.save()
        return False
    compatible = suite and (
        suite.get("protocol") == 2
        and suite["source"] == evidence.provenance("kill")
        and suite["model"] == agent.config.model
        and suite["actions"] == agent.config.actions
        and suite["max_tokens"] == agent.config.max_tokens
    )
    if not compatible or suite is None:
        row["standing"] = "reverted"
        agent.store.put_rules(row)
        agent.state.challenger = 0
        agent.state.half = None
        agent.store.put_meta(
            "evaluation_status",
            {
                "ready": False,
                "reason": "Evaluation inputs changed; trial retired.",
            },
        )
        agent.save()
        return False
    index = len(row["pairs"])
    if index >= len(suite["cases"]):
        return improve._decide(agent, row)
    case = suite["cases"][index]
    champion = agent.store.rules("playbook", agent.state.rules)
    versions = [champion, row] if not case["first"] else [row, champion]
    results = {}
    agent.hub.emit(
        {
            "type": "phase",
            "phase": "evaluate",
            "seconds": None,
            "reason": f"Comparing rules on unseen case {index + 1}",
        }
    )
    for policy in versions:
        if policy is None:
            raise ValueError("Missing champion rules")
        results[policy["version"]] = await _run(agent, case, policy["lines"])
    old, new = results[agent.state.rules], results[version]
    row["pairs"].append(
        {
            "front": "spare",
            "champion": old["reward"],
            "challenger": new["reward"],
        }
    )
    suite["pairs"].append(
        {"task": case["task"], "champion": old, "challenger": new}
    )
    agent.store.db.execute("begin transaction")
    try:
        agent.store.put_meta(f"evaluation:{version}", suite)
        agent.store.put_rules(row)
        agent.store.db.execute("commit")
    except Exception:
        agent.store.db.execute("rollback")
        raise
    improve._put(agent, row)
    agent.save()
    if len(row["pairs"]) < len(suite["cases"]):
        return False
    agent.store.put_meta("last_evaluation", suite["pairs"][-3:])
    return improve._decide(agent, row)
