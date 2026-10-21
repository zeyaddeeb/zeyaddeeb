import json
from collections import deque

import duckdb
import pytest
from gateway import Clerk, Ring, Say, Script, whole_probe
from test_agent import build, evaluation_data, settings, whole

from crispr_research import availability, cards, evidence
from crispr_research.agent import (
    desk,
    episode,
    evaluation,
    fronts,
    improve,
    loop,
    watch,
)
from crispr_research.agent.core import Agent
from crispr_research.agent.llm import Call, Llm
from crispr_research.agent.rules import Layer
from crispr_research.kernels import gate, later
from crispr_research.live import Hub
from crispr_research.store import SCHEMA, Store


def call(tool, args):
    return Call("test", tool, args)


async def probe(agent, raw, number=1):
    work = desk.Desk(number, agent)
    await work.handle(call("plan", {"aim": "test", "could_fail": "wrong"}))
    return await work.handle(call("probe", raw))


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
@pytest.mark.parametrize("field", ["chance", "value", "low", "high"])
def test_nonfinite_predictions_are_refused(field, value):
    with pytest.raises(cards.Refused):
        cards.compile_card(whole_probe() | {field: value})


def test_nonfinite_inputs_are_refused():
    raw = whole_probe()
    raw["probe"]["radius"] = float("nan")
    with pytest.raises(cards.Refused):
        cards.compile_card(raw)


@pytest.mark.asyncio
async def test_full_claim_is_persisted_before_running_the_referee(monkeypatch):
    agent = build(Script(deque([[Say("0.4")]])))
    original = desk._run

    def checked(card):
        payload = json.loads(
            agent.store.db.execute("select payload from claim").fetchone()[0]
        )
        assert payload["card"]["probe"] == whole_probe()["probe"]
        assert payload["reference"] == 0.4
        assert payload["source"]["method"] != "missing"
        assert "fields" not in payload
        return original(card)

    monkeypatch.setattr(desk, "_run", checked)
    await probe(agent, whole_probe())


@pytest.mark.asyncio
async def test_changed_wording_or_threshold_cannot_rescore_after_restart(
    tmp_path,
):
    database = str(tmp_path / "ledger.duckdb")
    agent = build(Script(deque([[Say("0.4")]])), database=database)
    await probe(agent, whole_probe())
    agent.store.close()
    script = Script(deque())
    again = build(script, database=database)
    repeated = whole_probe() | {
        "question": "A different wording of this case?",
        "value": 3.0,
        "chance": 0.9,
    }
    result = await probe(again, repeated, 2)
    assert "Already observed" in result.summary
    assert len(again.store.cards(10)) == 1
    assert script.requests == []
    again.store.close()


@pytest.mark.asyncio
async def test_exploration_cannot_be_repackaged_as_a_prediction():
    script = Script(deque())
    agent = build(script)
    work = desk.Desk(1, agent)
    raw = whole_probe()
    result = await work.handle(
        call("inspect", {"kernel": "reach", "probe": raw["probe"]})
    )
    assert result.data["fields"]["core_mm"] > 0
    result = await probe(agent, raw, 2)
    assert "no new score" in result.summary
    assert agent.store.cards(10) == []
    assert script.requests == []


@pytest.mark.asyncio
async def test_structured_results_reach_the_model():
    script = Script(whole())
    await episode.run(build(script), fronts.REACH)
    tools = [m for m in script.requests[-1]["messages"] if m["role"] == "tool"]
    outcome = json.loads(tools[-1]["content"])
    assert outcome["data"]["core_mm"] > 0
    assert "lambda_mm" in outcome["data"]


@pytest.mark.asyncio
async def test_pending_bet_keeps_identity_and_is_not_remembered_as_false(
    monkeypatch,
):
    agent = build(Script(deque([[Say("0.5")]])))
    raw = {
        "kernel": "later",
        "question": "Will this study finish eventually?",
        "probe": {"trial": "NCT12345678", "field": "completed"},
        "field": "completed",
        "op": "=",
        "value": 1,
        "chance": 0.7,
        "low": 0,
        "high": 1,
    }
    monkeypatch.setattr(desk, "_run", lambda _: ({"known": 0.0}, None))
    await probe(agent, raw)
    before = episode.standing(agent, fronts.WATCH)
    assert any(": open" in line for line in before)
    assert not any("did not hold" in line for line in before)
    assert agent.store.open_bets()[0]["probe"]["trial"] == "NCT12345678"
    monkeypatch.setattr(gate, "scores", lambda _: True)
    monkeypatch.setattr(
        later,
        "reading",
        lambda nct, day: later.Reading(
            {"known": 1.0, "completed": 1.0}, detail=nct
        ),
    )
    assert watch.settle(agent) == 1
    assert watch.settle(agent) == 0
    assert agent.store.recall(("later",))[0]["verdict"] == "held"
    original = json.loads(
        agent.store.db.execute("select payload from evidence").fetchone()[0]
    )
    assert original["verdict"] == "open"


def insert_card(store, kernel, question, verdict="held"):
    store.db.execute(
        "insert into card (kernel, question, field, op, value, verdict, "
        "skill, made) values (?, ?, 'median', '<', 0, ?, 0, ?)",
        [
            kernel,
            question,
            verdict,
            store.db.execute("select count(*) from card").fetchone()[0],
        ],
    )


def test_memory_filters_before_limiting_and_preserves_unknowns():
    agent = build(Script(deque()))
    insert_card(
        agent.store, "kill", "Important pending dependency", "unresolved"
    )
    for n in range(20):
        insert_card(agent.store, "reach", f"Other work {n}")
    memory = episode.standing(agent, fronts.SPARE)
    assert any("Important pending dependency" in line for line in memory)
    assert any("unresolved" in line for line in memory)
    assert not any("Other work" in line for line in memory)


def prepared(monkeypatch, database=":memory:"):
    evaluation_data(monkeypatch)
    clerk = Clerk()
    config = settings(trial_pairs=8, database=database)
    agent = Agent(
        config,
        Store(database),
        Hub(),
        Llm(config.llm_url, "none", "test", clerk.client()),
    )
    agent.capabilities = availability.status()
    improve.seed(agent)
    suite = evaluation.prepare(agent)
    assert suite
    improve._adopt(
        agent,
        Layer.PLAYBOOK,
        agent.store.rules("playbook", 1),
        ["State the hypothesis before observing its outcome"],
        because="a prior failure",
        args={"change": "add"},
        suite=suite,
    )
    return agent, clerk, suite


@pytest.mark.asyncio
async def test_policy_pair_uses_identical_frozen_inputs_and_isolated_stores(
    monkeypatch,
):
    agent, clerk, suite = prepared(monkeypatch)
    insert_card(agent.store, "kill", "NEW MEMORY MUST NOT ENTER EITHER HALF")
    before = len(agent.store.cards(100))

    def live_run_forbidden(_):
        raise AssertionError("Evaluation must use its frozen observation")

    monkeypatch.setattr(desk, "_run", live_run_forbidden)
    await evaluation.step(agent)
    starts = [
        r["messages"][1]["content"]
        for r in clerk.requests
        if len(r["messages"]) == 2
    ]
    assert len(starts) == 2
    assert starts[0] == starts[1]
    assert "NEW MEMORY" not in starts[0]
    assert len(agent.store.cards(100)) == before
    assert agent.store.episodes(0, 10) == []
    assert agent.state.tokens > 0
    assert agent.governor.ledger.spent > agent.state.tokens
    assert suite["alpha"] == 0.025


@pytest.mark.asyncio
async def test_holdout_cannot_be_read_through_either_tool(monkeypatch):
    agent, _, suite = prepared(monkeypatch)
    task = suite["cases"][0]["task"]
    work = desk.Desk(1, agent)
    result = await work.handle(
        call("inspect", {"kernel": "kill", "probe": task["probe"]})
    )
    assert not result.ok
    result = await probe(agent, task | {"chance": 0.8, "low": -2, "high": 0})
    assert not result.ok
    assert "reserved" in result.summary


@pytest.mark.asyncio
async def test_completed_trials_never_reuse_cases_and_shrink_the_threshold(
    monkeypatch,
):
    agent, _, suite = prepared(monkeypatch)
    for _ in suite["cases"]:
        await evaluation.step(agent)
    assert agent.state.rules == 2
    again = evaluation.prepare(agent)
    assert again
    assert again["alpha"] < suite["alpha"]
    assert {c["identity"] for c in suite["cases"]}.isdisjoint(
        c["identity"] for c in again["cases"]
    )
    assert agent.store.meta("last_evaluation")


@pytest.mark.asyncio
async def test_trial_survives_restart_and_aborts_if_its_data_changes(
    monkeypatch, tmp_path
):
    path = str(tmp_path / "agent.duckdb")
    agent, _, suite = prepared(monkeypatch, path)
    await evaluation.step(agent)
    agent.store.close()
    script = Script(deque())
    again = build(script, database=path, trial_pairs=8)
    assert len(again.store.rules("playbook", 2)["pairs"]) == 1
    assert again.store.meta("evaluation:2")["cases"] == suite["cases"]
    monkeypatch.setattr(
        evidence, "provenance", lambda _: {"dataset": "changed"}
    )
    await evaluation.step(again)
    assert again.state.rules == 1
    assert again.state.challenger == 0
    assert again.store.rules("playbook", 2)["standing"] == "reverted"
    assert script.requests == []
    again.store.close()


@pytest.mark.asyncio
async def test_reviser_receives_failures_and_their_inputs(monkeypatch):
    evaluation_data(monkeypatch)
    script = Script(
        deque(
            [
                [Ring("plan", {"aim": "try", "could_fail": "missing field"})],
                [Ring("probe", whole_probe() | {"field": "imaginary"})],
                [
                    Ring(
                        "conclude",
                        {"found": "bad field", "next": "inspect schema"},
                    )
                ],
                [
                    Ring(
                        "revise",
                        {
                            "change": "add",
                            "text": "Inspect inputs before making a claim",
                            "because": "The imaginary field was refused",
                        },
                    )
                ],
            ]
        )
    )
    agent = build(script, trial_pairs=8)
    improve.seed(agent)
    agent.capabilities = availability.status()
    await episode.run(agent, fronts.REACH)
    assert await improve.revise(agent, Layer.PLAYBOOK)
    prompt = script.requests[-1]["messages"][-1]["content"]
    assert '"field": "imaginary"' in prompt
    assert "There is no field imaginary" in prompt
    assert "inspect schema" in prompt


def test_missing_datasets_disable_their_capabilities(monkeypatch):
    availability._status.cache_clear()
    monkeypatch.setattr(
        gate, "later_gate", lambda: {"ran": False, "why": "offline"}
    )
    found = availability._status(0, "missing", "missing", "missing")
    assert found["reach"]["available"]
    assert not found["kill"]["available"]
    assert not found["matter"]["available"]
    assert not found["later"]["available"]
    availability._status.cache_clear()


def test_additive_migration_preserves_but_withdraws_legacy_discovery_flags(
    tmp_path,
):
    path = str(tmp_path / "old.duckdb")
    db = duckdb.connect(path)
    db.execute(SCHEMA)
    db.execute("insert into card (p, discovery) values (0.0, true)")
    db.close()
    migrated = Store(path)
    assert migrated.cards(1)[0]["p"] is None
    assert migrated.cards(1)[0]["discovery"] is False
    assert migrated.db.execute("select p, discovery from card").fetchone() == (
        0.0,
        True,
    )
    migrated.close()
    Store(path).close()


def test_empirical_identity_does_not_change_with_method_wording():
    raw = whole_probe() | {
        "kernel": "kill",
        "probe": {"gene": "rpl3", "stratum": "all"},
        "field": "median",
    }
    card = cards.compile_card(raw)
    first = evidence.experiment(card, {"dataset": "release1", "method": "old"})
    assert first == evidence.experiment(
        card, {"dataset": "release1", "method": "new"}
    )
    assert first != evidence.experiment(
        card, {"dataset": "release2", "method": "old"}
    )


@pytest.mark.asyncio
async def test_registry_search_returns_identifiers_without_revealing_outcomes(
    monkeypatch,
):
    monkeypatch.setattr(
        later,
        "search",
        lambda condition, most: [
            {
                "hasResults": True,
                "protocolSection": {
                    "identificationModule": {
                        "nctId": "NCT12345678",
                        "briefTitle": "Example",
                    },
                    "statusModule": {"overallStatus": "COMPLETED"},
                },
            }
        ],
    )
    agent = build(Script(deque()))
    result = await desk.Desk(1, agent).handle(
        call("search_trials", {"condition": "colorectal cancer"})
    )
    assert result.data == {
        "studies": [{"trial": "NCT12345678", "title": "Example"}]
    }


def test_later_trials_request_an_attainable_sample_or_pause(monkeypatch):
    agent, _, _ = prepared(monkeypatch)
    agent.store.put_meta("evaluation_trials", 3)
    suite = evaluation.prepare(agent)
    assert suite
    assert len(suite["cases"]) == 9
    assert 2 ** -len(suite["cases"]) <= suite["alpha"]
    agent.store.put_meta("evaluation_trials", 100)
    assert evaluation.prepare(agent) is None
    assert not agent.store.meta("evaluation_status")["ready"]


@pytest.mark.asyncio
async def test_scheduler_never_selects_a_missing_data_front(monkeypatch):
    monkeypatch.setattr(
        availability,
        "status",
        lambda: {
            "reach": {"available": True, "scores": False},
            "kill": {"available": False, "scores": False},
            "matter": {"available": False, "scores": False},
            "later": {"available": False, "scores": False},
        },
    )

    async def no_rest(agent, seconds):
        return None

    monkeypatch.setattr(loop, "rest", no_rest)
    agent = build(Script(whole()))
    await loop.shift(agent)
    assert agent.store.episodes(0, 10)[0]["front"] == "reach"
    assert agent.state.challenger == 0
    assert not agent.store.meta("evaluation_status")["ready"]
