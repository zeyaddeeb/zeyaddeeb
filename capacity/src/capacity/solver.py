from dataclasses import dataclass, field, replace
from time import perf_counter

from ortools.linear_solver import pywraplp

from .world import (
    INFERENCE_VALUE,
    SITES,
    TRAINING,
    TRAINING_VALUE,
    UPGRADE_MW,
    Build,
    Level,
    rtt_ms,
)

TIME_LIMIT_MS = 5000
VERIFY_TOLERANCE = 1e-6
ZERO = 1e-6
DIGITS = 4


class SolverError(RuntimeError):
    pass


Blocks = frozenset[tuple[str, int]]


def blocks(placed: dict[str, int]) -> Blocks:
    return frozenset((site, n) for site, n in placed.items() if n)


@dataclass(frozen=True, slots=True)
class Edits:
    offline: frozenset[str] = frozenset()
    latency: float | None = None
    demand: float = 1.0
    build: Blocks = frozenset()


NO_EDITS = Edits()


@dataclass(frozen=True, slots=True)
class Scenario:
    capacity: dict[str, float]
    demand: dict[str, float]
    training: float
    latency: float
    carbon_cap: float | None


@dataclass(frozen=True, slots=True)
class Plan:
    routes: dict[tuple[str, str], float] = field(default_factory=dict)
    training: dict[str, float] = field(default_factory=dict)
    dropped: dict[str, float] = field(default_factory=dict)
    dropped_training: float = 0.0
    build: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Totals:
    energy: float
    lost: float
    build: float
    total: float
    carbon: float
    served: float
    demand: float


@dataclass(frozen=True, slots=True)
class Stats:
    engine: str
    variables: int
    constraints: int
    iterations: int
    ms: float


@dataclass(frozen=True, slots=True)
class Key:
    demand: str
    site: str
    mw: float
    worth: float


@dataclass(frozen=True, slots=True)
class Result:
    plan: Plan
    totals: Totals
    key: Key | None
    upgrades: dict[str, float]
    duals: dict[str, float]
    carbon_price: float | None
    carbon_dual: float | None
    build_all_cost: float | None
    stats: Stats


def scenario(level: Level, edits: Edits) -> Scenario:
    offline = set(edits.offline) | ({level.outage} if level.outage else set())
    capacity = {
        s: 0.0 if s in offline else float(mw)
        for s, mw in level.capacity.items()
    }
    if level.build:
        for site, n in edits.build:
            if capacity.get(site, 0) > 0:
                capacity[site] += n * level.build.block
    return Scenario(
        capacity=capacity,
        demand={c: mw * edits.demand for c, mw in level.demand.items()},
        training=level.training * edits.demand,
        latency=level.latency if edits.latency is None else edits.latency,
        carbon_cap=level.carbon_cap,
    )


@dataclass(slots=True)
class _Model:
    solver: pywraplp.Solver
    routes: dict[tuple[str, str], pywraplp.Variable]
    training: dict[str, pywraplp.Variable]
    unmet: dict[str, pywraplp.Variable]
    unmet_training: pywraplp.Variable | None
    blocks: dict[str, pywraplp.Variable]
    site_rows: dict[str, pywraplp.Constraint]
    carbon_row: pywraplp.Constraint | None

    def objective(self) -> float:
        return self.solver.Objective().Value()

    def variable(self, demand: str, site: str) -> pywraplp.Variable | None:
        if demand == TRAINING:
            return self.training.get(site)
        return self.routes.get((demand, site))

    def chosen_blocks(self) -> dict[str, int]:
        return {
            s: round(v.solution_value())
            for s, v in self.blocks.items()
            if v.solution_value() > 0.5
        }


def _formulate(
    sc: Scenario, engine: str, build: Build | None = None
) -> _Model:
    solver = pywraplp.Solver.CreateSolver(engine)
    if solver is None:
        raise SolverError(f"{engine} is unavailable")
    solver.SetTimeLimit(TIME_LIMIT_MS)
    inf = solver.infinity()

    routes = {
        (c, s): solver.NumVar(0, inf, f"route[{c},{s}]")
        for c in sc.demand
        for s in sc.capacity
        if rtt_ms(c, s) <= sc.latency
    }
    training = (
        {s: solver.NumVar(0, inf, f"train[{s}]") for s in sc.capacity}
        if sc.training
        else {}
    )
    unmet = {c: solver.NumVar(0, inf, f"unmet[{c}]") for c in sc.demand}
    unmet_training = (
        solver.NumVar(0, inf, "unmet[training]") if sc.training else None
    )
    blocks = (
        {
            s: solver.IntVar(0, build.blocks, f"blocks[{s}]")
            for s, cap in sc.capacity.items()
            if cap
        }
        if build
        else {}
    )

    def load(site: str):
        return sum(
            routes[c, site] for c in sc.demand if (c, site) in routes
        ) + training.get(site, 0)

    def added(site: str):
        return blocks[site] * build.block if build and site in blocks else 0

    for city, mw in sc.demand.items():
        solver.Add(
            sum(routes[city, s] for s in sc.capacity if (city, s) in routes)
            + unmet[city]
            == mw
        )
    if unmet_training is not None:
        solver.Add(sum(training.values()) + unmet_training == sc.training)
    site_rows = {
        s: solver.Add(load(s) - added(s) <= cap)
        for s, cap in sc.capacity.items()
    }
    carbon_row = (
        solver.Add(
            sum(SITES[s].carbon * load(s) for s in sc.capacity)
            <= sc.carbon_cap
        )
        if sc.carbon_cap is not None
        else None
    )

    cost = sum(
        SITES[s].price * load(s) for s in sc.capacity
    ) + INFERENCE_VALUE * sum(unmet.values())
    if unmet_training is not None:
        cost += TRAINING_VALUE * unmet_training
    if build and blocks:
        solver.Add(sum(blocks.values()) <= build.blocks)
        cost += build.cost * build.block * sum(blocks.values())
    solver.Minimize(cost)
    return _Model(
        solver,
        routes,
        training,
        unmet,
        unmet_training,
        blocks,
        site_rows,
        carbon_row,
    )


def _run(model: _Model) -> float:
    started = perf_counter()
    status = model.solver.Solve()
    elapsed_ms = (perf_counter() - started) * 1000
    if status != pywraplp.Solver.OPTIMAL:
        raise SolverError("no optimal solution")
    is_lp = model.solver.SolverVersion().startswith("Glop")
    if is_lp and not model.solver.VerifySolution(VERIFY_TOLERANCE, False):
        raise SolverError("solution failed verification")
    return elapsed_ms


def _lp(sc: Scenario) -> tuple[_Model, float]:
    model = _formulate(sc, "GLOP")
    return model, _run(model)


def _objective(sc: Scenario) -> float:
    return _lp(sc)[0].objective()


def _positive(variables: dict) -> dict:
    values = {k: round(v.solution_value(), 6) for k, v in variables.items()}
    return {k: v for k, v in values.items() if v > ZERO}


def _plan(model: _Model, build: dict[str, int]) -> Plan:
    unmet_training = (
        model.unmet_training.solution_value() if model.unmet_training else 0.0
    )
    return Plan(
        routes=_positive(model.routes),
        training=_positive(model.training),
        dropped=_positive(model.unmet),
        dropped_training=round(unmet_training, 6)
        if unmet_training > ZERO
        else 0.0,
        build=build,
    )


def totals(sc: Scenario, plan: Plan, level: Level) -> Totals:
    load: dict[str, float] = {}
    for (_, site), mw in plan.routes.items():
        load[site] = load.get(site, 0.0) + mw
    for site, mw in plan.training.items():
        load[site] = load.get(site, 0.0) + mw
    energy = sum(SITES[s].price * mw for s, mw in load.items())
    lost = (
        INFERENCE_VALUE * sum(plan.dropped.values())
        + TRAINING_VALUE * plan.dropped_training
    )
    build = (
        level.build.cost * level.build.block * sum(plan.build.values())
        if level.build
        else 0.0
    )
    return Totals(
        energy=round(energy, DIGITS),
        lost=round(lost, DIGITS),
        build=round(build, DIGITS),
        total=round(energy + lost + build, DIGITS),
        carbon=round(
            sum(SITES[s].carbon * mw for s, mw in load.items()), DIGITS
        ),
        served=round(sum(load.values()), DIGITS),
        demand=round(sum(sc.demand.values()) + sc.training, DIGITS),
    )


@dataclass(frozen=True, slots=True)
class _Choice:
    blocks: dict[str, int]
    ms: float = 0.0
    build_all_cost: float | None = None


def _choose_blocks(level: Level, edits: Edits, optimize: bool) -> _Choice:
    if not level.build:
        return _Choice({})
    if not optimize:
        return _Choice(dict(edits.build))
    sc = scenario(level, edits)
    mip = _formulate(sc, "SCIP", level.build)
    ms = _run(mip)
    chosen = mip.chosen_blocks()
    if sum(chosen.values()) >= level.build.blocks:
        return _Choice(chosen, ms)
    forced = _formulate(sc, "SCIP", level.build)
    forced.solver.Add(sum(forced.blocks.values()) == level.build.blocks)
    ms += _run(forced)
    return _Choice(
        chosen, ms, round(forced.objective() - mip.objective(), DIGITS)
    )


def _upgrades(
    sc: Scenario, base: float, online: list[str]
) -> dict[str, float]:
    def with_more(site: str) -> Scenario:
        return replace(
            sc, capacity={**sc.capacity, site: sc.capacity[site] + UPGRADE_MW}
        )

    return {s: round(base - _objective(with_more(s)), DIGITS) for s in online}


def _key(sc: Scenario, model: _Model, level: Level) -> Key | None:
    if level.key is None:
        return None
    demand, site = level.key
    used = model.variable(demand, site)
    if used is None or used.solution_value() <= ZERO:
        return None
    banned = _formulate(sc, "GLOP")
    banned_var = banned.variable(demand, site)
    if banned_var is None:
        return None
    banned_var.SetUb(0)
    _run(banned)
    return Key(
        demand=demand,
        site=site,
        mw=round(used.solution_value(), 6),
        worth=round(banned.objective() - model.objective(), DIGITS),
    )


def _carbon_price(sc: Scenario, base: float) -> float | None:
    if sc.carbon_cap is None:
        return None
    return round(
        base - _objective(replace(sc, carbon_cap=sc.carbon_cap + 1)), DIGITS
    )


def solve(
    level: Level, edits: Edits = NO_EDITS, optimize_build: bool = False
) -> Result:
    choice = _choose_blocks(level, edits, optimize_build)
    build = choice.blocks
    sc = scenario(level, replace(edits, build=blocks(build)))
    model, lp_ms = _lp(sc)
    base = model.objective()
    online = [s for s, cap in sc.capacity.items() if cap > 0]
    plan = _plan(model, build)
    return Result(
        plan=plan,
        totals=totals(sc, plan, level),
        key=_key(sc, model, level),
        upgrades=_upgrades(sc, base, online),
        duals={
            s: round(-model.site_rows[s].dual_value(), DIGITS) for s in online
        },
        carbon_price=_carbon_price(sc, base),
        carbon_dual=round(-model.carbon_row.dual_value(), DIGITS)
        if model.carbon_row
        else None,
        build_all_cost=choice.build_all_cost,
        stats=Stats(
            engine="SCIP + GLOP" if optimize_build and level.build else "GLOP",
            variables=model.solver.NumVariables(),
            constraints=model.solver.NumConstraints(),
            iterations=model.solver.iterations(),
            ms=round(lp_ms + choice.ms, 3),
        ),
    )
