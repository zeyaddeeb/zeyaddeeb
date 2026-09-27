import re

import pytest

from capacity.planning import Schedule, evaluate, score, solve_plan
from capacity.plans import PLAN_LEVELS, PROJECTS

LEAD = PLAN_LEVELS["lead"]
BRIDGE = PLAN_LEVELS["bridge"]
TOOLBOX = PLAN_LEVELS["toolbox"]
AVERAGE = PLAN_LEVELS["average"]
WORST = PLAN_LEVELS["worst"]
KNOWING = PLAN_LEVELS["knowing"]


def cost(level, *starts, rentals=(), opened=()):
    schedule = Schedule(
        frozenset(starts), frozenset(rentals), frozenset(opened)
    )
    return score(level, evaluate(level, schedule)[1])


@pytest.mark.parametrize("level", PLAN_LEVELS.values(), ids=list(PLAN_LEVELS))
def test_every_plan_level_solves_quickly_with_a_trace(level):
    result = solve_plan(level)
    assert result.stats.ms < 1000
    assert result.trace[-1].total == pytest.approx(score(level, result.cases))


@pytest.mark.parametrize("level", PLAN_LEVELS.values(), ids=list(PLAN_LEVELS))
def test_case_and_project_ids_fit_the_api(level):
    ids = [c.id for c in level.cases]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r"[a-z0-9]{2,16}", i) for i in ids)
    for p in (*level.projects, *level.rentals):
        assert re.fullmatch(r"[a-z]{2,16}(-[a-z]{2,16}){0,2}", p)
        assert p in PROJECTS


def test_the_solver_starts_the_slow_transformer_first():
    best = solve_plan(LEAD)
    assert sorted(best.schedule.starts) == [
        ("goosecreek-transformer", 0, 1),
        ("loudoun-brambleton", 1, 1),
    ]
    assert best.cases[1].flow.shed
    assert best.key is not None
    assert best.key.project == "goosecreek-transformer"
    assert best.key.worth > 30000


def test_fixing_next_year_first_loses():
    greedy = cost(LEAD, ("loudoun-brambleton", 0, 1))
    assert greedy > 1.3 * solve_plan(LEAD).total


def test_turbines_bridge_only_the_gap_year():
    best = solve_plan(BRIDGE)
    assert best.schedule.rentals == frozenset(
        {("turbines-yardley", "y2028", 1)}
    )
    assert not any(c.flow.shed for c in best.cases)
    every_year = cost(
        BRIDGE,
        *best.schedule.starts,
        rentals=[("turbines-yardley", c.id, 1) for c in BRIDGE.cases],
    )
    assert every_year > best.total + 2000
    assert best.key is not None
    assert best.key.worth == pytest.approx(
        solve_plan(LEAD).total - best.total, abs=1
    )


def test_the_cheapest_bridge_is_a_breaker():
    best = solve_plan(TOOLBOX)
    assert not best.schedule.rentals
    assert ("yardley-waxpool", "y2028") in best.schedule.opened
    assert best.total < solve_plan(BRIDGE).total
    assert best.key is not None
    assert (best.key.kind, best.key.project) == ("open", "yardley-waxpool")
    assert best.key.worth > 20000


def test_planning_for_the_average_under_orders():
    best = solve_plan(AVERAGE)
    hedge = best.hedge
    assert hedge is not None
    assert sum(n for *_, n in best.schedule.starts) == 3
    assert hedge.mean_size == 1
    assert hedge.vss > 30000
    assert cost(AVERAGE, ("preorder-yardley", 0, 1)) == pytest.approx(
        hedge.mean_total
    )


def test_planning_for_the_worst_buys_insurance():
    robust = solve_plan(WORST)
    stochastic = solve_plan(AVERAGE)
    assert sum(n for *_, n in robust.schedule.starts) == 5
    assert robust.worst < stochastic.worst - 10000
    hedge = robust.hedge
    assert hedge is not None
    assert hedge.other_total == pytest.approx(stochastic.total)
    assert 0 < robust.total - stochastic.total < 3000


def test_knowing_who_signs_has_a_price():
    hedge = solve_plan(KNOWING).hedge
    assert hedge is not None
    assert hedge.evpi == pytest.approx(7100)
    assert hedge.evpi == pytest.approx(
        solve_plan(KNOWING).total - hedge.perfect
    )
