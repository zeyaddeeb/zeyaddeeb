import pytest
from fastapi.testclient import TestClient

from capacity.app import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_world_uses_camel_case_and_lists_every_level():
    world = client.get("/world").json()
    ids = [lv["id"] for lv in world["levels"]]
    assert ids == ["atlantic", "asia", "training", "carbon", "outage", "build"]
    carbon = next(lv for lv in world["levels"] if lv["id"] == "carbon")
    assert carbon["carbonCap"] == 30
    assert world["values"]["upgradeMw"] == 10
    assert world["rtt"]["london"]["keflavik"] == 29


def test_solve_returns_the_optimum():
    body = client.post("/solve", json={"level": "atlantic"}).json()
    assert body["totals"]["total"] == 7800
    assert body["solver"]["engine"] == "GLOP"
    assert {"city": "london", "site": "keflavik", "mw": 40} in body["routes"]


def test_solve_accepts_edits():
    body = client.post(
        "/solve",
        json={
            "level": "training",
            "edits": {"offline": ["keflavik"], "latency": 60, "demand": 1.2},
        },
    ).json()
    assert all(p["site"] != "keflavik" for p in body["training"])
    assert body["totals"]["demand"] == pytest.approx(240 * 1.2)


def test_solve_optimizes_the_build_with_scip():
    body = client.post(
        "/solve", json={"level": "build", "optimizeBuild": True}
    ).json()
    assert body["solver"]["engine"] == "SCIP + GLOP"
    assert 0 < sum(body["build"].values()) <= 4


@pytest.mark.parametrize(
    "payload",
    [
        {"level": "nowhere"},
        {"level": "Atlantic"},
        {"level": "atlantic", "edits": {"offline": ["inzai"]}},
        {"level": "atlantic", "edits": {"latency": 5}},
        {"level": "atlantic", "edits": {"demand": 9}},
        {"level": "atlantic", "edits": {"build": {"ashburn": 1}}},
        {"level": "build", "edits": {"build": {"johor": 5}}},
        {"level": "build", "edits": {"build": {"singapore": 1}}},
        {"level": "atlantic", "optimizeBuild": True},
        {"level": "atlantic", "surprise": 1},
    ],
)
def test_solve_rejects_bad_requests(payload):
    assert client.post("/solve", json=payload).status_code == 422
