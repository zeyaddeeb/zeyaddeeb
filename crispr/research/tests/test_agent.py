import asyncio
from collections import deque

import httpx
import pytest
from gateway import Clerk, Ring, Say, Script, Think, whole_probe

from research.agent import episode, fronts, loop
from research.agent.core import Agent, Stop
from research.agent.llm import Ask, Llm
from research.config import Config, Mode
from research.kernels import gate
from research.live import Hub
from research.store import Store


def settings(**over) -> Config:
    base = {
        "mode": Mode.ALWAYS,
        "llm_url": "http://gateway/v1",
        "model": "test",
        "api_key": "none",
        "database": ":memory:",
        "actions": 6,
        "max_tokens": 256,
        "reference_tokens": 24,
        "turn_seconds": 10,
        "rest_seconds": 1,
        "idle_rest_seconds": 1,
        "trial_pairs": 4,
        "tokens_per_day": 300_000,
        "backoff_seconds": 1,
        "backoff_max_seconds": 2,
        "failures": 4,
    }

    return Config(**(base | over))


def build(script: Script, **over) -> Agent:
    config = settings(**over)
    llm = Llm(config.llm_url, config.api_key, config.model, script.client())

    return Agent(config, Store(config.database), Hub(), llm)


def whole() -> deque:
    return deque(
        [
            [
                Think("where does it stall"),
                Ring(
                    "plan",
                    {
                        "aim": "see if a 2 mm nodule is cleared",
                        "could_fail": "the sink may be too fast",
                    },
                ),
            ],
            [Ring("probe", whole_probe())],
            [Say("0.25")],
            [
                Ring(
                    "conclude",
                    {
                        "found": "the core is never reached",
                        "next": "try a smaller nodule",
                    },
                )
            ],
        ]
    )


@pytest.mark.asyncio
async def test_one_episode_seals_a_card_grades_it_and_keeps_the_record():
    script = Script(turns=whole())
    agent = build(script)

    record = await episode.run(agent, fronts.REACH)

    assert record["turns"] == 3
    assert record["summary"] == "the core is never reached"

    rows = agent.store.cards(10)

    assert len(rows) == 1
    assert rows[0]["verdict"] == "broken"
    assert rows[0]["observed"] > 1.0
    assert len(rows[0]["seal"]) == 64
    assert rows[0]["reference"] == 0.25


@pytest.mark.asyncio
async def test_the_forecaster_is_asked_without_tools_or_the_reading():
    script = Script(turns=whole())
    agent = build(script)

    await episode.run(agent, fronts.REACH)

    asked = [body for body in script.requests if not body.get("tools")]

    assert len(asked) == 1

    text = asked[0]["messages"][-1]["content"]

    assert "core_mm" in text
    assert "2 mm nodule" in text
    assert "0.0923" not in text


@pytest.mark.asyncio
async def test_a_probe_before_a_plan_is_refused():
    script = Script(
        turns=deque(
            [
                [Ring("probe", whole_probe())],
                [Ring("conclude", {"found": "nothing", "next": ""})],
            ]
        )
    )
    agent = build(script)

    await episode.run(agent, fronts.REACH)

    rows = agent.store.cards(10)

    assert rows == []


@pytest.mark.asyncio
async def test_a_malformed_card_is_refused_and_recorded_as_a_refusal():
    broken = whole_probe() | {"field": "cured"}
    script = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [Ring("probe", broken)],
                [Ring("conclude", {"found": "refused", "next": ""})],
            ]
        )
    )
    agent = build(script)
    record = await episode.run(agent, fronts.REACH)

    rows = agent.store.cards(10)

    assert len(rows) == 1
    assert rows[0]["verdict"] == "refused"
    assert record["reward"] == 0.0


@pytest.mark.asyncio
async def test_with_a_calibrated_referee_a_call_earns_and_a_refusal_does_not(
    monkeypatch,
):
    monkeypatch.setattr(gate, "scores", lambda kernel: True)

    graded = build(Script(turns=whole()))
    earned = await episode.run(graded, fronts.REACH)

    assert earned["reward"] != 0.0

    bare = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [Ring("probe", whole_probe() | {"field": "cured"})],
                [Ring("conclude", {"found": "x", "next": ""})],
            ]
        )
    )
    refusing = await episode.run(build(bare), fronts.REACH)

    assert refusing["reward"] == 0.0


@pytest.mark.asyncio
async def test_a_thought_only_turn_is_nudged_then_forced_to_conclude():
    script = Script(
        turns=deque(
            [
                [Think("thinking")],
                [Think("still thinking")],
                [Think("and again")],
                [Ring("conclude", {"found": "forced", "next": ""})],
            ]
        )
    )
    agent = build(script)
    record = await episode.run(agent, fronts.REACH)

    assert record["summary"] == "forced"
    assert record["turns"] == 4
    assert record["tokens"] == 80
    assert len(agent.store.turns(1)) == 4
    assert agent.store.db.execute(
        "select tool, ok from act where turn = 3"
    ).fetchall() == [("conclude", True)]


@pytest.mark.asyncio
async def test_forced_conclusion_includes_every_pending_tool_result():
    script = Script(
        turns=deque(
            [
                [
                    Ring("plan", {"aim": "a", "could_fail": "b"}),
                    Ring("unknown", {}),
                ],
                [Ring("conclude", {"found": "forced", "next": ""})],
            ]
        )
    )
    agent = build(script, actions=1)

    record = await episode.run(agent, fronts.REACH)

    messages = script.requests[1]["messages"]
    calls = messages[2]["tool_calls"]
    results = messages[3:5]

    assert [row["tool_call_id"] for row in results] == [c["id"] for c in calls]
    assert all(row["role"] == "tool" for row in results)
    assert messages[5]["role"] == "user"
    assert record["summary"] == "forced"
    assert record["turns"] == 2
    assert len(agent.store.turns(1)) == 2


@pytest.mark.asyncio
async def test_calls_after_concluding_cannot_change_the_result():
    script = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [
                    Ring("conclude", {"found": "done", "next": ""}),
                    Ring("probe", whole_probe()),
                    Ring("conclude", {"found": "changed", "next": ""}),
                ],
            ]
        )
    )
    agent = build(script)

    record = await episode.run(agent, fronts.REACH)

    assert record["summary"] == "done"
    assert agent.store.cards(10) == []
    assert len(script.requests) == 2
    assert agent.store.db.execute(
        "select ok from act where turn = 1"
    ).fetchall() == [(True,), (False,), (False,)]


@pytest.mark.asyncio
async def test_a_partial_stream_is_retried_before_executing_its_calls(
    monkeypatch,
):
    script = Script(turns=whole())
    handle = script.handle

    def truncated(request):
        if not script.dropped:
            script.dropped = True

            return httpx.Response(
                200,
                text=(
                    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,'
                    '"id":"partial","function":{"name":"conclude",'
                    '"arguments":"{\\"found\\":\\"wrong\\"}"}}]}}]}\n\n'
                ),
            )

        return handle(request)

    async def no_wait(_):
        return None

    script.handle = truncated
    agent = build(script)
    monkeypatch.setattr(agent, "reconnect", no_wait)

    record = await episode.run(agent, fronts.REACH)

    assert record["summary"] == "the core is never reached"
    assert (
        agent.store.db.execute(
            "select count(*) from act where id = 'partial'"
        ).fetchone()[0]
        == 0
    )
    assert any(event["type"] == "retry" for event in agent.hub.backlog())


@pytest.mark.asyncio
async def test_completed_work_is_checkpointed_before_the_next_turn(
    monkeypatch,
):
    agent = build(Script(turns=whole()))
    ask = agent.ask

    async def interrupt(asked, on_delta=None):
        if agent.state.cards:
            raise Stop("shutdown")

        return await ask(asked, on_delta)

    monkeypatch.setattr(agent, "ask", interrupt)

    with pytest.raises(Stop):
        await episode.run(agent, fronts.REACH)

    saved = agent.store.state()

    assert saved.tokens == 60
    assert saved.budget.spent == 240
    assert saved.cards == len(agent.store.cards(10)) == 1
    assert agent.store.episodes(0, 10) == []


@pytest.mark.asyncio
async def test_a_small_remaining_budget_caps_output_without_rounding_up():
    script = Script(turns=deque([[Say("0.5")]]))
    agent = build(script, tokens_per_day=8)

    await agent.ask(
        Ask(
            preamble="",
            history=[],
            prompt={"role": "user", "content": "?"},
            tools=[],
            max_tokens=24,
        )
    )

    assert script.requests[0]["max_tokens"] == 8


@pytest.mark.asyncio
async def test_cancelling_the_worker_saves_its_state(monkeypatch):
    agent = build(Script(turns=deque()))
    started = asyncio.Event()

    async def blocked(agent):
        agent.state.open_front = "reach"
        agent.state.tokens = 42
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(loop, "shift", blocked)
    task = asyncio.create_task(loop.run(agent))
    await asyncio.wait_for(started.wait(), timeout=1)
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert agent.store.state().tokens == 42
    assert agent.store.state().open_front == "reach"


@pytest.mark.asyncio
async def test_the_same_call_twice_is_refused_as_repeated():
    again = Ring("plan", {"aim": "a", "could_fail": "b"})
    script = Script(
        turns=deque(
            [
                [again],
                [again],
                [Ring("conclude", {"found": "done", "next": ""})],
            ]
        )
    )
    agent = build(script)

    await episode.run(agent, fronts.REACH)

    refusals = [
        row
        for row in agent.store.db.execute(
            "select summary from act where ok = false"
        ).fetchall()
    ]

    assert any("sent this before" in row[0] for row in refusals)


@pytest.mark.asyncio
async def test_a_dropped_turn_is_retried_and_the_episode_survives():
    script = Script(turns=whole(), drop_first=True)
    agent = build(script)
    record = await episode.run(agent, fronts.REACH)

    assert record["summary"] == "the core is never reached"


@pytest.mark.asyncio
async def test_spending_counts_output_plus_uncached_input():
    script = Script(turns=whole())
    agent = build(script)

    await episode.run(agent, fronts.REACH)

    assert agent.governor.ledger.spent == 4 * (20 + 60)
    assert agent.state.tokens == 4 * 20


@pytest.mark.asyncio
async def test_an_episode_a_restart_cut_off_is_closed_on_the_next_shift():
    script = Script(turns=whole())
    agent = build(script)
    agent.state.open_front = "reach"
    agent.state.open_since = 1

    loop.recover(agent)

    rows = agent.store.episodes(0, 10)

    assert len(rows) == 1
    assert rows[0]["summary"] == "cut off by a restart"
    assert agent.state.open_front == ""


@pytest.mark.asyncio
async def test_watched_mode_spends_nothing_with_nobody_watching():
    script = Script(turns=whole())
    agent = build(script, mode=Mode.WATCHED)
    agent.hub.close()

    await loop.shift(agent)

    assert script.requests == []
    assert agent.state.episodes == 0


@pytest.mark.asyncio
async def test_an_ungated_referee_pays_nothing_however_good_the_call():
    script = Script(turns=whole())
    agent = build(script)
    record = await episode.run(agent, fronts.REACH)

    rows = agent.store.cards(10)

    assert rows[0]["verdict"] == "broken"
    assert rows[0]["skill"] == 0.0
    assert record["reward"] == 0.0


@pytest.mark.asyncio
async def test_the_model_is_told_why_it_earned_nothing():
    script = Script(turns=whole())
    agent = build(script)

    await episode.run(agent, fronts.REACH)

    said = agent.store.db.execute(
        "select summary from act where tool = 'probe'"
    ).fetchone()[0]

    assert "not calibrated" in said
    assert "earns nothing" in said


def kill_probe() -> dict:
    return {
        "kernel": "kill",
        "question": "Is KRAS needed by most colorectal lines?",
        "probe": {"gene": "KRAS", "stratum": "all"},
        "field": "share_essential",
        "op": ">",
        "value": 0.5,
        "chance": 0.75,
        "low": 0.6,
        "high": 0.9,
    }


@pytest.mark.asyncio
async def test_a_calibrated_kill_card_is_graded_and_actually_earns():
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    script = Script(
        turns=deque(
            [
                [
                    Ring(
                        "plan",
                        {"aim": "test KRAS", "could_fail": "it may be rare"},
                    )
                ],
                [Ring("probe", kill_probe())],
                [Say("0.4")],
                [
                    Ring(
                        "conclude",
                        {"found": "KRAS is needed widely", "next": "try WRN"},
                    )
                ],
            ]
        )
    )
    agent = build(script)
    record = await episode.run(agent, fronts.SPARE)

    rows = agent.store.cards(10)

    assert len(rows) == 1
    assert rows[0]["verdict"] == "held"
    assert rows[0]["observed"] > 0.5
    assert rows[0]["skill"] > 0.0
    assert record["reward"] > 0.0


@pytest.mark.asyncio
async def test_a_gene_the_release_does_not_score_is_unresolved_not_wrong():
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    raw = kill_probe()
    raw["probe"] = {"gene": "NOTAREALGENE", "stratum": "all"}
    script = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [Ring("probe", raw)],
                [Say("0.5")],
                [Ring("conclude", {"found": "no verdict", "next": ""})],
            ]
        )
    )
    agent = build(script)
    record = await episode.run(agent, fronts.SPARE)

    rows = agent.store.cards(10)

    assert rows[0]["verdict"] == "unresolved"
    assert rows[0]["skill"] == 0.0
    assert record["reward"] == 0.0


@pytest.mark.asyncio
async def test_a_rule_change_runs_blind_in_paired_episodes(monkeypatch):
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    async def no_rest(agent, seconds):
        return None

    monkeypatch.setattr(loop, "rest", no_rest)

    clerk = Clerk()
    config = settings(trial_pairs=4)
    agent = Agent(
        config,
        Store(config.database),
        Hub(),
        Llm(config.llm_url, config.api_key, config.model, clerk.client()),
    )

    for _ in range(12):
        await loop.shift(agent)

        if agent.state.rules != 1:
            break

    assert agent.state.rules == 2, "a unanimous trial should have promoted"

    lineage = agent.store.lineage("playbook")
    winner = next(one for one in lineage if one["version"] == 2)

    assert winner["standing"] == "champion"
    assert winner["p"] <= 0.1
    assert winner["gain"] > 0
    assert len(winner["pairs"]) == 4
    assert all(p["front"] in fronts.ids() for p in winner["pairs"])
    assert all(p["challenger"] > p["champion"] for p in winner["pairs"]), (
        "the coached half should have won every pair"
    )

    for preamble in clerk.preambles:
        assert "v1" not in preamble
        assert "v2" not in preamble
        assert "challenger" not in preamble.lower()
        assert "on trial" not in preamble.lower()
        assert "version" not in preamble.lower()


@pytest.mark.asyncio
async def test_the_rules_the_agent_is_given_reach_its_preamble(monkeypatch):
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    async def no_rest(agent, seconds):
        return None

    monkeypatch.setattr(loop, "rest", no_rest)

    clerk = Clerk()
    config = settings(trial_pairs=4)
    agent = Agent(
        config,
        Store(config.database),
        Hub(),
        Llm(config.llm_url, config.api_key, config.model, clerk.client()),
    )

    for _ in range(4):
        await loop.shift(agent)

    coached = [p for p in clerk.preambles if "Your own rules" in p]
    plain = [p for p in clerk.preambles if "Your own rules" not in p]

    assert coached, "the challenger's rules should reach the preamble"
    assert plain, "the champion with no rules should run too"
    assert clerk.texts[0] in coached[0]


@pytest.mark.asyncio
async def test_a_question_the_referee_cannot_answer_does_not_cost_a_good_one():
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    good = {
        "kernel": "kill",
        "question": "Is KRAS needed by most colorectal lines?",
        "probe": {"gene": "KRAS", "stratum": "all"},
        "field": "share_essential",
        "op": ">",
        "value": 0.5,
        "chance": 0.8,
        "low": 0.6,
        "high": 0.9,
    }
    missing = good | {"probe": {"gene": "NOTAREALGENE", "stratum": "all"}}
    script = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [Ring("probe", good)],
                [Say("0.4")],
                [Ring("probe", missing)],
                [Say("0.5")],
                [Ring("conclude", {"found": "one of each", "next": ""})],
            ]
        )
    )
    agent = build(script)
    record = await episode.run(agent, fronts.SPARE)

    rows = agent.store.cards(10)
    verdicts = {row["verdict"] for row in rows}

    assert verdicts == {"held", "unresolved"}

    earned = next(row["skill"] for row in rows if row["verdict"] == "held")

    assert record["reward"] == pytest.approx(earned)


@pytest.mark.asyncio
async def test_a_kill_card_spends_alpha_and_a_strong_one_counts():
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    strong = {
        "kernel": "kill",
        "question": "Is RPL3 needed by colorectal lines?",
        "probe": {"gene": "RPL3", "stratum": "all"},
        "field": "median",
        "op": "<",
        "value": -0.5,
        "chance": 0.9,
        "low": -3.0,
        "high": -1.0,
    }
    script = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [Ring("probe", strong)],
                [Say("0.8")],
                [Ring("conclude", {"found": "needed", "next": ""})],
            ]
        )
    )
    agent = build(script)

    await episode.run(agent, fronts.SPARE)

    row = agent.store.cards(5)[0]

    assert row["p"] is not None
    assert row["p"] < 0.01, "a ribosomal gene should rank near the top"
    assert row["discovery"] is True
    assert agent.alpha.tested == 1
    assert agent.alpha.rejected == 1


@pytest.mark.asyncio
async def test_an_ordinary_gene_spends_alpha_without_counting():
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    dull = {
        "kernel": "kill",
        "question": "Is ABCG8 needed by colorectal lines?",
        "probe": {"gene": "ABCG8", "stratum": "all"},
        "field": "median",
        "op": "<",
        "value": -0.5,
        "chance": 0.3,
        "low": -0.2,
        "high": 0.1,
    }
    script = Script(
        turns=deque(
            [
                [Ring("plan", {"aim": "a", "could_fail": "b"})],
                [Ring("probe", dull)],
                [Say("0.3")],
                [Ring("conclude", {"found": "not needed", "next": ""})],
            ]
        )
    )
    agent = build(script)

    await episode.run(agent, fronts.SPARE)

    row = agent.store.cards(5)[0]

    assert row["discovery"] is False
    assert agent.alpha.tested == 1
    assert agent.alpha.rejected == 0

    said = agent.store.db.execute(
        "select summary from act where tool = 'probe'"
    ).fetchone()[0]

    assert "not unusual enough" in said


@pytest.mark.asyncio
async def test_the_alpha_ledger_survives_a_restart():
    if not gate.scores("kill"):
        pytest.skip("the dependency pack has not been built")

    config = settings(database=":memory:")
    store = Store(config.database)
    agent = Agent(config, store, Hub(), Llm(config.llm_url, "none", "t"))
    agent.alpha.spend(1e-9)
    agent.alpha.spend(0.9)
    agent.save()

    again = Agent(config, store, Hub(), Llm(config.llm_url, "none", "t"))

    assert again.alpha.tested == 2
    assert again.alpha.rejected == 1
    assert again.alpha.budget() == pytest.approx(agent.alpha.budget())
