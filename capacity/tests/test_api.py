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


def test_grid_lists_every_act_two_chapter():
    world = client.get("/grid").json()
    ids = [lv["id"] for lv in world["levels"]]

    assert ids == ["siting", "wires", "prices"]
    assert world["levels"][2]["hubCapacity"] == {"goosecreek": 1200}
    assert {h["id"] for h in world["hubs"]} == {"goosecreek", "loudoun"}

    wires = world["levels"][1]

    assert wires["maxBuild"] == 1
    assert "goosecreek-waxpool" in wires["candidates"]


def test_grid_solve_scores_a_placement_with_glop():
    body = client.post(
        "/grid/solve",
        json={
            "level": "siting",
            "placement": {"alpha": "dulles", "beta": "yardley"},
        },
    ).json()

    assert body["totals"]["total"] == 95250
    assert body["solver"]["engine"] == "GLOP"
    assert body["key"] is None


def test_grid_solve_shows_today_before_any_campus_lands():
    body = client.post("/grid/solve", json={"level": "siting"}).json()

    assert body["placement"] == {}
    assert body["totals"]["demand"] == 1150
    assert body["supply"]["goosecreek"] == 850


def test_grid_solve_optimizes_with_scip():
    body = client.post(
        "/grid/solve", json={"level": "wires", "optimize": True}
    ).json()

    assert body["solver"]["engine"] == "SCIP + GLOP"
    assert body["opened"] == ["yardley-waxpool"]
    assert body["key"]["line"] == "yardley-waxpool"
    assert body["trace"][-1]["total"] == body["totals"]["total"]
    assert body["trace"][-1]["flow"]["opened"] == ["yardley-waxpool"]


@pytest.mark.parametrize(
    "payload",
    [
        {"level": "nowhere"},
        {"level": "siting", "placement": {"alpha": "tokyo"}},
        {"level": "siting", "placement": {"alpha": "dulles", "gamma": "x"}},
        {"level": "siting", "opened": ["yardley-waxpool"]},
        {"level": "wires", "placement": {"alpha": "dulles"}},
        {"level": "wires", "built": ["dulles-yardley"]},
        {
            "level": "wires",
            "built": ["goosecreek-waxpool", "loudoun-yardley"],
        },
        {"level": "wires", "opened": ["waxpool-mars"]},
        {"level": "wires", "optimize": True, "opened": ["yardley-waxpool"]},
        {"level": "wires", "edits": {"tripped": ["nowhere-else"]}},
        {"level": "wires", "edits": {"demand": 4}},
    ],
)
def test_grid_solve_rejects_bad_requests(payload):
    assert client.post("/grid/solve", json=payload).status_code == 422


def test_plans_list_acts_three_and_four():
    world = client.get("/plans").json()

    assert [lv["id"] for lv in world["levels"]] == [
        "lead",
        "bridge",
        "toolbox",
        "average",
        "worst",
        "knowing",
    ]

    assert world["levels"][3]["recourse"] is True


def test_plan_solve_scores_a_schedule_and_the_solver_replays():
    mine = client.post(
        "/plan/solve",
        json={
            "level": "lead",
            "schedule": {
                "starts": [{"project": "loudoun-brambleton", "period": 0}]
            },
        },
    ).json()

    best = client.post("/plan/solve", json={"level": "lead"}).json()

    assert mine["total"] > best["total"]
    assert best["trace"][-1]["total"] == best["total"]
    assert best["solver"]["engine"] == "SCIP + GLOP"


@pytest.mark.parametrize(
    "schedule",
    [
        {"starts": [{"project": "nowhere-line", "period": 0}]},
        {"starts": [{"project": "loudoun-brambleton", "period": 9}]},
        {
            "starts": [
                {"project": "loudoun-brambleton", "period": 0},
                {"project": "loudoun-yardley", "period": 0},
            ]
        },
        {
            "rentals": [
                {"project": "turbines-yardley", "case": "y2028", "blocks": 1}
            ]
        },
        {"opened": [{"line": "yardley-waxpool", "case": "y2028"}]},
    ],
)
def test_plan_solve_rejects_bad_schedules(schedule):
    response = client.post(
        "/plan/solve", json={"level": "lead", "schedule": schedule}
    )

    assert response.status_code == 422
