import asyncio

import duckdb
import httpx
import pytest
from fastapi.testclient import TestClient

import crispr_research.app as service
from crispr_research.app import app
from crispr_research.store import Store


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("RESEARCH_AGENT", "off")

    with TestClient(app) as made:
        yield made


def whole() -> dict:
    return {
        "weight": 300.0,
        "diffusivity": 2.5e-10,
        "ic50": 6.2e-3,
        "concentration": 0.8,
        "dwell": 1800.0,
        "radius": 0.002,
    }


def test_health_answers(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}


def test_about_names_the_referees_and_which_are_built(client: TestClient):
    found = client.get("/about").json()

    assert found["referees"] == ["reach", "kill", "matter", "later"]
    assert len(found["built"]) == 4
    assert sorted(found["built"]) == sorted(found["referees"])
    assert len(found["method"]) == 12


def test_a_probe_reads_in_camel_case(client: TestClient):
    found = client.post("/reach", json=whole()).json()

    assert found["depthMm"] > 0.0
    assert found["coreMm"] > 1.0
    assert found["steady"] == 1.0


def test_a_probe_with_a_missing_input_is_rejected(client: TestClient):
    body = whole()
    del body["dwell"]

    assert client.post("/reach", json=body).status_code == 422


def test_a_probe_with_an_extra_input_is_rejected(client: TestClient):
    assert (
        client.post("/reach", json=whole() | {"heat": 43.0}).status_code == 422
    )


def test_a_negative_radius_is_rejected(client: TestClient):
    assert (
        client.post("/reach", json=whole() | {"radius": -1.0}).status_code
        == 422
    )


def test_the_gate_is_served_and_says_it_does_not_score(client: TestClient):
    found = client.get("/reach/gate").json()

    assert found["replicated"]
    assert found["limitsHeld"]
    assert not found["scores"]
    assert len(found["replication"]) == 2


@pytest.mark.asyncio
async def test_shutdown_cancels_the_worker_saves_state_and_closes_resources(
    monkeypatch, tmp_path
):
    database = tmp_path / "research.duckdb"
    monkeypatch.setenv("RESEARCH_AGENT", "on")
    monkeypatch.setenv("RESEARCH_AGENT_DB", str(database))
    monkeypatch.setattr(service, "SHUTDOWN_SECONDS", 0.01)
    started = asyncio.Event()

    async def blocked(agent):
        agent.state.tokens = 42
        agent.state.open_front = "reach"
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(service.loop, "shift", blocked)

    async with service.lifespan(app):
        agent = app.state.agent
        task = app.state.task
        await asyncio.wait_for(started.wait(), timeout=1)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.get("/health")).status_code == 200

    assert task.cancelled()
    assert agent.hub.closing()
    assert agent.llm.client.is_closed

    with pytest.raises(duckdb.ConnectionException):
        agent.store.state()

    saved = Store(str(database))
    try:
        assert saved.state().tokens == 42
        assert saved.state().open_front == "reach"
    finally:
        saved.close()


@pytest.mark.asyncio
async def test_worker_failure_is_unhealthy_and_still_releases_resources(
    monkeypatch,
):
    monkeypatch.setenv("RESEARCH_AGENT", "on")
    monkeypatch.setenv("RESEARCH_AGENT_DB", ":memory:")

    async def broken(agent):
        raise RuntimeError("worker failed")

    monkeypatch.setattr(service.loop, "shift", broken)

    with pytest.raises(RuntimeError, match="worker failed"):
        async with service.lifespan(app):
            agent = app.state.agent
            with pytest.raises(RuntimeError, match="worker failed"):
                await app.state.task

            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                found = await client.get("/health")

            assert found.status_code == 503
            assert found.json()["detail"] == "the agent has stopped"

    assert agent.llm.client.is_closed
    with pytest.raises(duckdb.ConnectionException):
        agent.store.state()


@pytest.mark.asyncio
async def test_lifespan_cleanup_also_runs_when_the_context_raises(monkeypatch):
    monkeypatch.setenv("RESEARCH_AGENT", "off")

    with pytest.raises(RuntimeError, match="context failed"):
        async with service.lifespan(app):
            raise RuntimeError("context failed")

    assert app.state.hub.closing()
