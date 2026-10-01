from itertools import product

import pytest

from capacity.grid import (
    CANDIDATES,
    GRID_LEVELS,
    HUBS,
    LINES,
    SUBSTATIONS,
    buses,
)
from capacity.power import (
    NO_GRID_EDITS,
    Choice,
    GridEdits,
    evaluate,
    solve_grid,
)
from capacity.world import CITIES, LEVELS, SITES

SITING = GRID_LEVELS["siting"]
WIRES = GRID_LEVELS["wires"]
PRICES = GRID_LEVELS["prices"]


def placed(**where: str) -> Choice:
    return Choice(placement=frozenset(where.items()))


def wired(built=(), opened=()) -> Choice:
    assert WIRES.placement is not None

    return Choice(
        placement=frozenset(WIRES.placement.items()),
        built=frozenset(built),
        opened=frozenset(opened),
    )


def total(level, choice, edits=NO_GRID_EDITS) -> float:
    return evaluate(level, choice, edits)[1].total


@pytest.mark.parametrize("level", GRID_LEVELS.values(), ids=list(GRID_LEVELS))
def test_every_grid_level_reaches_an_optimum_quickly(level):
    result = solve_grid(level)

    assert result.totals.total > 0
    assert result.stats.ms < 1000


def test_ids_never_collide_across_acts():
    ids = [*buses(), *SITES, *CITIES, *GRID_LEVELS, *LEVELS]

    assert len(ids) == len(set(ids))


def test_every_line_joins_known_buses():
    for line in [*LINES.values(), *CANDIDATES.values()]:
        assert {line.a, line.b} <= set(buses())


def test_today_everyone_is_served_and_goose_creek_is_full():
    flow, totals, _ = evaluate(SITING, Choice())

    assert not flow.shed

    assert flow.supply["goosecreek"] == pytest.approx(
        HUBS["goosecreek"].capacity
    )

    assert totals.served == sum(s.load for s in SUBSTATIONS.values())


def test_the_siting_mip_matches_every_placement_tried():
    tried = min(
        total(SITING, placed(alpha=a, beta=b))
        for a, b in product(SUBSTATIONS, repeat=2)
    )

    result = solve_grid(SITING)

    assert result.totals.total == pytest.approx(tried)
    assert result.flow.placement == {"alpha": "dulles", "beta": "yardley"}
    assert not result.flow.shed


@pytest.mark.parametrize(
    "trap",
    [
        {"alpha": "yardley", "beta": "yardley"},
        {"alpha": "brambleton", "beta": "brambleton"},
        {"alpha": "brambleton", "beta": "yardley"},
    ],
)
def test_cheap_land_next_to_the_hub_with_room_loses(trap):
    optimum = solve_grid(SITING).totals.total

    assert total(SITING, placed(**trap)) > 2.5 * optimum


def test_the_trap_darkens_a_neighborhood_with_no_new_campus():
    flow, _, _ = evaluate(SITING, placed(alpha="yardley", beta="yardley"))

    assert "loudoun-brambleton" in flow.binding
    assert flow.shed["brambleton"] > 0


def test_the_siting_key_is_forcing_the_big_campus_onto_cheap_land():
    key = solve_grid(SITING).key

    assert key is not None

    assert (key.kind, key.campus, key.substation) == (
        "site",
        "alpha",
        "dulles",
    )

    assert key.worth == pytest.approx(28096.5732)


def test_the_shortcut_line_makes_things_worse():
    nothing = total(WIRES, wired())
    shortcut = total(WIRES, wired(built=["goosecreek-waxpool"]))

    assert shortcut > nothing + 20000


def test_most_new_lines_help():
    deltas = solve_grid(WIRES).candidates

    assert deltas["goosecreek-waxpool"] > 0
    assert sum(1 for d in deltas.values() if d < 0) == 2


def test_opening_one_breaker_beats_every_line_you_could_build():
    best = solve_grid(WIRES)

    assert best.flow.opened == ("yardley-waxpool",)
    assert best.flow.built == ()
    assert not best.flow.shed

    for line in WIRES.candidates:
        assert total(WIRES, wired(built=[line])) > best.totals.total


def test_the_switching_optimum_is_reachable_by_taps():
    assert total(WIRES, wired(opened=["yardley-waxpool"])) == pytest.approx(
        solve_grid(WIRES).totals.total
    )


def test_the_breaker_is_worth_what_closing_it_costs():
    key = solve_grid(WIRES).key

    assert key is not None
    assert (key.kind, key.line) == ("open", "yardley-waxpool")

    assert key.worth == pytest.approx(
        total(WIRES, wired()) - total(WIRES, wired(opened=[key.line]))
    )


def test_a_tripped_line_carries_nothing_and_the_solver_replans():
    edits = GridEdits(tripped=frozenset({"dulles-loudoun"}))
    result = solve_grid(SITING, edits)

    assert "dulles-loudoun" not in result.flow.flows
    assert result.flow.placement["alpha"] != "dulles"


def test_partial_placements_only_count_placed_campuses():
    _, totals, _ = evaluate(SITING, placed(alpha="dulles"))

    assert totals.demand == sum(s.load for s in SUBSTATIONS.values()) + 300


def test_prices_escape_the_range_of_every_hub():
    result = solve_grid(PRICES)

    assert result.stats.engine == "GLOP"
    assert not result.flow.shed
    assert result.flow.binding == ("brambleton-belmont",)

    prices = result.prices
    cheapest = min(HUBS[h].price for h in HUBS)
    dearest = max(HUBS[h].price for h in HUBS)

    assert max(prices, key=prices.__getitem__) == "brambleton"
    assert min(prices, key=prices.__getitem__) == "belmont"
    assert prices["brambleton"] > dearest
    assert prices["belmont"] < cheapest


def test_prices_are_what_one_more_megawatt_costs():
    base = solve_grid(PRICES)

    bumped = solve_grid(
        PRICES, GridEdits(bump=(("brambleton", 1.0),))
    ).totals.total

    assert bumped - base.totals.total == pytest.approx(
        base.prices["brambleton"]
    )


@pytest.mark.parametrize("level", [SITING, WIRES], ids=["siting", "wires"])
def test_the_search_trace_improves_until_it_proves_the_optimum(level):
    result = solve_grid(level)
    trace = result.trace

    assert len(trace) >= 3
    assert trace[-1].total == pytest.approx(result.totals.total)
    assert trace[-1].bound == pytest.approx(result.totals.total, abs=0.01)
    assert trace[-1].flow == result.flow
    assert trace[0].total > 2 * result.totals.total


def test_the_siting_search_starts_where_players_do():
    first = solve_grid(SITING).trace[0].flow.placement

    assert first == {"alpha": "yardley", "beta": "yardley"}
