import pytest
from taps import Board, best_by_taps, cheapest_first, nearest_first

from capacity.solver import Edits, blocks, scenario, solve
from capacity.world import CITIES, LEVELS, SITES, UPGRADE_MW, rtt_ms


@pytest.mark.parametrize("level", LEVELS.values(), ids=list(LEVELS))
def test_every_level_reaches_a_verified_optimum(level):
    result = solve(level, optimize_build=bool(level.build))

    assert result.totals.total > 0
    assert result.stats.ms < 1000


def test_latency_follows_distance():
    assert 70 <= rtt_ms("newyork", "dublin") <= 80

    assert (
        rtt_ms("london", "dublin")
        < rtt_ms("london", "frankfurt")
        < rtt_ms("london", "madrid")
    )


@pytest.mark.parametrize(
    ("level", "strategies"),
    [
        ("atlantic", [cheapest_first]),
        ("asia", [cheapest_first, nearest_first]),
        ("training", [cheapest_first]),
        ("carbon", [cheapest_first, nearest_first]),
    ],
)
def test_the_obvious_plan_loses(level, strategies):
    lv = LEVELS[level]
    sc = scenario(lv, Edits())
    optimum = solve(lv).totals.total

    for strategy in strategies:
        assert strategy(sc) > 1.5 * optimum


@pytest.mark.parametrize("level", ["atlantic", "asia", "training"])
def test_the_optimum_is_reachable_by_taps(level):
    lv = LEVELS[level]

    assert best_by_taps(scenario(lv, Edits())) == pytest.approx(
        solve(lv).totals.total
    )


def test_the_carbon_optimum_is_reachable_with_steppers():
    lv = LEVELS["carbon"]
    board = Board(scenario(lv, Edits()))

    assert board.tap("london", "madrid")
    assert board.tap("paris", "lulea")
    assert board.tap("berlin", "dublin")

    for _ in range(5):
        assert board.step("berlin", "dublin", -5)

    assert board.tap("berlin", "warsaw")
    assert board.carbon() == pytest.approx(lv.carbon_cap)
    assert board.cost() == pytest.approx(solve(lv).totals.total)


def test_the_carbon_cap_has_a_price():
    result = solve(LEVELS["carbon"])

    assert result.totals.carbon == pytest.approx(LEVELS["carbon"].carbon_cap)
    assert result.carbon_price == pytest.approx(result.carbon_dual)

    warsaw, dublin = SITES["warsaw"], SITES["dublin"]
    swap = (dublin.price - warsaw.price) / (warsaw.carbon - dublin.carbon)

    assert result.carbon_price == pytest.approx(swap)


def test_upgrades_match_duals_away_from_degeneracy():
    result = solve(LEVELS["carbon"])

    for site in ("lulea", "madrid"):
        assert result.upgrades[site] == pytest.approx(
            result.duals[site] * UPGRADE_MW
        )


def test_the_outage_fix_is_moving_chicago():
    lv = LEVELS["outage"]
    sc = scenario(lv, Edits())
    board = Board(sc, {k: v for k, v in lv.start.items() if k[1] != lv.outage})

    board.tap("newyork", "quebec")

    naive = board.cost()
    result = solve(lv)

    assert result.plan.routes[("chicago", "abilene")] == 30
    assert not result.plan.dropped
    assert naive > 5 * result.totals.total
    board.tap("chicago", "quebec")
    board.tap("chicago", "abilene")
    board.tap("newyork", "quebec")
    board.tap("newyork", "quebec")
    assert board.cost() == pytest.approx(result.totals.total)


def test_the_solver_builds_better_than_intuition():
    lv = LEVELS["build"]
    best = solve(lv, optimize_build=True)

    assert 0 < sum(best.plan.build.values()) <= lv.build.blocks

    nothing = solve(lv).totals.total

    for guess in (
        {"keflavik": 4},
        {"inzai": 4},
        {"johor": 4},
        {"johor": 1, "inzai": 1, "keflavik": 1, "barueri": 1},
    ):
        assert (
            solve(lv, Edits(build=blocks(guess))).totals.total
            > best.totals.total
        )

    assert solve(lv, Edits(build=blocks({"johor": 4}))).totals.total > nothing


def test_offline_sites_carry_nothing():
    lv = LEVELS["training"]
    result = solve(lv, Edits(offline=frozenset({"keflavik"})))

    assert all(site != "keflavik" for _, site in result.plan.routes)
    assert "keflavik" not in result.plan.training
    assert "keflavik" not in result.upgrades


def test_site_and_city_ids_never_collide():
    assert not SITES.keys() & CITIES.keys()


@pytest.mark.parametrize(
    ("level", "demand", "site", "worth"),
    [
        ("atlantic", "london", "keflavik", 52480),
        ("asia", "singapore", "navimumbai", 26200),
        ("training", "training", "keflavik", 27480),
        ("outage", "chicago", "abilene", 40440),
    ],
)
def test_the_key_move_is_measured_by_banning_it(level, demand, site, worth):
    key = solve(LEVELS[level]).key

    assert key is not None
    assert (key.demand, key.site) == (demand, site)
    assert key.worth == pytest.approx(worth)


def test_the_key_move_disappears_when_the_solver_stops_using_it():
    assert solve(LEVELS["asia"], Edits(latency=50)).key is None


def test_the_solver_leaves_a_block_unbuilt_on_purpose():
    lv = LEVELS["build"]
    best = solve(lv, optimize_build=True)

    assert sum(best.plan.build.values()) < lv.build.blocks
    assert best.plan.dropped
    assert best.build_all_cost is not None
    assert best.build_all_cost > 0
