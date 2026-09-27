from dataclasses import dataclass, field, replace
from time import perf_counter

from ortools.linear_solver import pywraplp

from .grid import (
    CANDIDATES,
    HUBS,
    LINES,
    SHED_VALUE,
    SUBSTATIONS,
    GridLevel,
    Line,
    buses,
)
from .solver import SolverError

TIME_LIMIT_MS = 5000
MAX_STEPS = 24
PRICE_MW = 1.0
VERIFY_TOLERANCE = 1e-6
ZERO = 1e-6
DIGITS = 4
SWITCH_TIEBREAK = 0.01
REFERENCE = "goosecreek"


@dataclass(frozen=True, slots=True)
class Choice:
    placement: frozenset[tuple[str, str]] = frozenset()
    built: frozenset[str] = frozenset()
    opened: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class GridEdits:
    tripped: frozenset[str] = frozenset()
    demand: float = 1.0
    bump: tuple[tuple[str, float], ...] = ()


NO_GRID_EDITS = GridEdits()


@dataclass(frozen=True, slots=True)
class Flow:
    placement: dict[str, str] = field(default_factory=dict)
    built: tuple[str, ...] = ()
    opened: tuple[str, ...] = ()
    flows: dict[str, float] = field(default_factory=dict)
    supply: dict[str, float] = field(default_factory=dict)
    shed: dict[str, float] = field(default_factory=dict)
    binding: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class GridTotals:
    energy: float
    lost: float
    land: float
    build: float
    total: float
    served: float
    demand: float


@dataclass(frozen=True, slots=True)
class GridKey:
    kind: str
    campus: str | None
    substation: str | None
    line: str | None
    worth: float


@dataclass(frozen=True, slots=True)
class GridStats:
    engine: str
    variables: int
    constraints: int
    nodes: int
    ms: float


@dataclass(frozen=True, slots=True)
class Step:
    ms: float
    total: float
    bound: float | None
    nodes: int
    flow: Flow


@dataclass(frozen=True, slots=True)
class GridResult:
    flow: Flow
    totals: GridTotals
    key: GridKey | None
    candidates: dict[str, float]
    prices: dict[str, float]
    trace: tuple[Step, ...]
    stats: GridStats


def all_lines() -> dict[str, Line]:
    return {**LINES, **CANDIDATES}


def campus_load(level: GridLevel, edits: GridEdits) -> dict[str, float]:
    return {c.id: c.mw * edits.demand for c in level.campuses}


def base_load(edits: GridEdits) -> dict[str, float]:
    load = {s: sub.load * edits.demand for s, sub in SUBSTATIONS.items()}
    for s, mw in edits.bump:
        load[s] += mw
    return load


def fixed_placement(level: GridLevel) -> Choice:
    return Choice(placement=frozenset((level.placement or {}).items()))


@dataclass(slots=True)
class _Model:
    solver: pywraplp.Solver
    supply: dict[str, pywraplp.Variable]
    shed: dict[str, pywraplp.Variable]
    flows: dict[str, pywraplp.Variable]
    sited: dict[tuple[str, str], pywraplp.Variable]
    closed: dict[str, pywraplp.Variable]
    lines: dict[str, Line]

    def objective(self) -> float:
        return self.solver.Objective().Value()


def _angle_bound(lines: dict[str, Line]) -> float:
    return sum(ln.km * ln.limit for ln in lines.values())


def _new_solver(engine: str) -> pywraplp.Solver:
    solver = pywraplp.Solver.CreateSolver(engine)
    if solver is None:
        raise SolverError(f"{engine} is unavailable")
    solver.SuppressOutput()
    solver.SetTimeLimit(TIME_LIMIT_MS)
    return solver


def _site(
    solver: pywraplp.Solver,
    level: GridLevel,
    campuses: dict[str, float],
    choice: Choice | None,
):
    sites = list(SUBSTATIONS)
    if choice is None and level.placement is None:
        sited = {
            (c, s): solver.BoolVar(f"site[{c},{s}]")
            for c in campuses
            for s in sites
        }
        for c in campuses:
            solver.Add(solver.Sum(sited[c, s] for s in sites) == 1)
        return sited, {
            s: solver.Sum(campuses[c] * sited[c, s] for c in campuses)
            for s in sites
        }
    where = dict(
        choice.placement
        if choice and choice.placement
        else (level.placement or {}).items()
    )
    return {}, {
        s: sum(mw for c, mw in campuses.items() if where.get(c) == s)
        for s in sites
    }


def _state(
    solver: pywraplp.Solver,
    level: GridLevel,
    edits: GridEdits,
    choice: Choice | None,
    lid: str,
) -> float | pywraplp.Variable:
    if lid in edits.tripped:
        return 0.0
    candidate = lid in level.candidates
    if choice is None and (candidate or level.switching):
        return solver.BoolVar(f"closed[{lid}]")
    if candidate:
        return 1.0 if choice and lid in choice.built else 0.0
    return 0.0 if choice and lid in choice.opened else 1.0


def _wire(
    solver: pywraplp.Solver,
    level: GridLevel,
    edits: GridEdits,
    choice: Choice | None,
    lines: dict[str, Line],
):
    bound = _angle_bound(lines)
    big = 2 * bound
    theta = {b: solver.NumVar(-bound, bound, f"theta[{b}]") for b in buses()}
    solver.Add(theta[REFERENCE] == 0)
    flows: dict[str, pywraplp.Variable] = {}
    closed: dict[str, pywraplp.Variable] = {}
    for lid, ln in lines.items():
        flow = solver.NumVar(-ln.limit, ln.limit, f"flow[{lid}]")
        flows[lid] = flow
        drop = theta[ln.a] - theta[ln.b]
        state = _state(solver, level, edits, choice, lid)
        if isinstance(state, pywraplp.Variable):
            closed[lid] = state
            state_expr = pywraplp.VariableExpr(state)
            solver.Add(flow <= ln.limit * state_expr)
            solver.Add(flow >= -ln.limit * state_expr)
            solver.Add(flow * ln.km - drop <= big * (1 - state_expr))
            solver.Add(flow * ln.km - drop >= -big * (1 - state_expr))
        elif state == 0.0:
            flow.SetBounds(0, 0)
        else:
            solver.Add(flow * ln.km == drop)
    return flows, closed


def _formulate(
    level: GridLevel,
    edits: GridEdits,
    engine: str,
    choice: Choice | None,
) -> _Model:
    solver = _new_solver(engine)
    campuses = campus_load(level, edits)
    base = base_load(edits)
    sited, placed = _site(solver, level, campuses, choice)
    lines = {
        lid: ln
        for lid, ln in all_lines().items()
        if lid in LINES or lid in level.candidates
    }
    flows, closed = _wire(solver, level, edits, choice, lines)

    supply = {
        h: solver.NumVar(0, level.capacity(h), f"supply[{h}]") for h in HUBS
    }
    shed = {
        s: solver.NumVar(0, solver.infinity(), f"shed[{s}]")
        for s in SUBSTATIONS
    }
    for s in SUBSTATIONS:
        solver.Add(shed[s] <= base[s] + placed[s])
    for b in buses():
        out = solver.Sum(
            flows[lid] for lid, ln in lines.items() if ln.a == b
        ) - solver.Sum(flows[lid] for lid, ln in lines.items() if ln.b == b)
        inject = supply.get(b, 0) - base.get(b, 0) - placed.get(b, 0)
        solver.Add(inject + shed.get(b, 0) == out)

    built = {lid: v for lid, v in closed.items() if lid in CANDIDATES}
    switches = [v for lid, v in closed.items() if lid in LINES]
    if built:
        solver.Add(solver.Sum(built.values()) <= level.max_build)
    solver.Minimize(
        solver.Sum(HUBS[h].price * v for h, v in supply.items())
        + SHED_VALUE * solver.Sum(shed.values())
        + solver.Sum(
            SUBSTATIONS[s].land * campuses[c] * v
            for (c, s), v in sited.items()
        )
        + solver.Sum(
            CANDIDATES[lid].cost * pywraplp.VariableExpr(v)
            for lid, v in built.items()
        )
        + SWITCH_TIEBREAK
        * solver.Sum(1 - pywraplp.VariableExpr(v) for v in switches)
    )
    return _Model(solver, supply, shed, flows, sited, closed, lines)


def _run(solver: pywraplp.Solver) -> float:
    started = perf_counter()
    status = solver.Solve()
    elapsed_ms = (perf_counter() - started) * 1000
    if status != pywraplp.Solver.OPTIMAL:
        raise SolverError("no optimal solution")
    return elapsed_ms


def _decided(level: GridLevel, model: _Model) -> Choice:
    placement = (
        frozenset(
            k for k, v in model.sited.items() if v.solution_value() > 0.5
        )
        or fixed_placement(level).placement
    )
    built = frozenset(
        lid
        for lid, v in model.closed.items()
        if lid in CANDIDATES and v.solution_value() > 0.5
    )
    opened = frozenset(
        lid
        for lid, v in model.closed.items()
        if lid in LINES and v.solution_value() < 0.5
    )
    return Choice(placement, built, opened)


def _dispatch(
    level: GridLevel, edits: GridEdits, choice: Choice
) -> tuple[_Model, float]:
    model = _formulate(level, edits, "GLOP", choice)
    ms = _run(model.solver)
    if not model.solver.VerifySolution(VERIFY_TOLERANCE, False):
        raise SolverError("solution failed verification")
    return model, ms


def _positive(variables: dict[str, pywraplp.Variable]) -> dict[str, float]:
    values = {k: round(v.solution_value(), 6) for k, v in variables.items()}
    return {k: v for k, v in values.items() if v > ZERO}


def _flow(model: _Model, choice: Choice, edits: GridEdits) -> Flow:
    live = {
        lid
        for lid in model.lines
        if lid not in edits.tripped
        and lid not in choice.opened
        and (lid in LINES or lid in choice.built)
    }
    flows = {lid: round(model.flows[lid].solution_value(), 6) for lid in live}
    return Flow(
        placement=dict(sorted(choice.placement)),
        built=tuple(sorted(choice.built)),
        opened=tuple(sorted(choice.opened)),
        flows=flows,
        supply=_positive(model.supply),
        shed=_positive(model.shed),
        binding=tuple(
            lid
            for lid, mw in flows.items()
            if abs(mw) >= model.lines[lid].limit - 1e-4
        ),
    )


def grid_totals(level: GridLevel, edits: GridEdits, flow: Flow) -> GridTotals:
    campuses = campus_load(level, edits)
    energy = sum(HUBS[h].price * mw for h, mw in flow.supply.items())
    lost = SHED_VALUE * sum(flow.shed.values())
    land = sum(
        SUBSTATIONS[s].land * campuses[c] for c, s in flow.placement.items()
    )
    build = sum(CANDIDATES[lid].cost for lid in flow.built)
    demand = sum(base_load(edits).values()) + sum(
        campuses[c] for c in flow.placement
    )
    return GridTotals(
        energy=round(energy, DIGITS),
        lost=round(lost, DIGITS),
        land=round(land, DIGITS),
        build=round(build, DIGITS),
        total=round(energy + lost + land + build, DIGITS),
        served=round(demand - sum(flow.shed.values()), DIGITS),
        demand=round(demand, DIGITS),
    )


def evaluate(
    level: GridLevel, choice: Choice, edits: GridEdits = NO_GRID_EDITS
) -> tuple[Flow, GridTotals, float]:
    model, ms = _dispatch(level, edits, choice)
    flow = _flow(model, choice, edits)
    return flow, grid_totals(level, edits, flow), ms


def _optimum(
    level: GridLevel, edits: GridEdits, force: dict[str, str] | None = None
) -> tuple[Choice, float, int, _Model]:
    model = _formulate(level, edits, "SCIP", None)
    for campus, substation in (force or {}).items():
        model.sited[campus, substation].SetLb(1)
    ms = _run(model.solver)
    return _decided(level, model), ms, model.solver.nodes(), model


def _offset(level: GridLevel, edits: GridEdits) -> float:
    campuses = campus_load(level, edits)
    return sum(
        SUBSTATIONS[s].land * campuses[c]
        for c, s in (level.placement or {}).items()
    )


def _trace(level: GridLevel, edits: GridEdits) -> tuple[Step, ...]:
    steps: list[Step] = []
    offset = _offset(level, edits)
    for k in range(1, MAX_STEPS + 1):
        model = _formulate(level, edits, "SCIP", None)
        model.solver.SetSolverSpecificParametersAsString(
            f"limits/solutions = {k}"
        )
        started = perf_counter()
        status = model.solver.Solve()
        ms = (perf_counter() - started) * 1000
        if status not in (
            pywraplp.Solver.OPTIMAL,
            pywraplp.Solver.FEASIBLE,
        ):
            break
        choice = _decided(level, model)
        flow, totals, _ = evaluate(level, choice, edits)
        bound = model.solver.Objective().BestBound() + offset
        step = Step(
            ms=round(ms, 3),
            total=totals.total,
            bound=round(bound, DIGITS) if bound > 0 else None,
            nodes=model.solver.nodes(),
            flow=flow,
        )
        if steps and steps[-1].flow == flow:
            steps[-1] = replace(step, ms=steps[-1].ms)
        else:
            steps.append(step)
        if status == pywraplp.Solver.OPTIMAL:
            break
    return tuple(steps)


def _prices(
    level: GridLevel, edits: GridEdits, choice: Choice, total: float
) -> dict[str, float]:
    if not level.prices:
        return {}
    return {
        s: round(
            (
                evaluate(
                    level,
                    choice,
                    replace(edits, bump=((s, PRICE_MW),)),
                )[1].total
                - total
            )
            / PRICE_MW,
            DIGITS,
        )
        for s in SUBSTATIONS
    }


def _key(
    level: GridLevel, edits: GridEdits, choice: Choice, total: float
) -> GridKey | None:
    if level.switching:
        if not choice.opened:
            return None
        line = sorted(choice.opened)[0]
        kept = replace(choice, opened=choice.opened - {line})
        _, totals, _ = evaluate(level, kept, edits)
        return GridKey(
            "open", None, None, line, round(totals.total - total, DIGITS)
        )
    if level.lure is None:
        return None
    campus, lure = level.lure
    substation = dict(choice.placement).get(campus)
    if substation is None or substation == lure:
        return None
    lured, _, _, _ = _optimum(level, edits, {campus: lure})
    _, totals, _ = evaluate(level, lured, edits)
    return GridKey(
        "site", campus, substation, None, round(totals.total - total, DIGITS)
    )


def _candidates(
    level: GridLevel, edits: GridEdits, choice: Choice
) -> dict[str, float]:
    if not level.candidates:
        return {}
    plain = replace(choice, built=frozenset(), opened=frozenset())
    _, base, _ = evaluate(level, plain, edits)
    return {
        lid: round(
            evaluate(level, replace(plain, built=frozenset({lid})), edits)[
                1
            ].total
            - base.total,
            DIGITS,
        )
        for lid in level.candidates
        if lid not in edits.tripped
    }


def solve_grid(
    level: GridLevel,
    edits: GridEdits = NO_GRID_EDITS,
    choice: Choice | None = None,
) -> GridResult:
    optimized = choice is None and level.decides
    if optimized:
        decided, mip_ms, nodes, mip = _optimum(level, edits)
        engine = "SCIP + GLOP"
        variables = mip.solver.NumVariables()
        constraints = mip.solver.NumConstraints()
    else:
        decided = choice or fixed_placement(level)
        mip_ms, nodes, engine = 0.0, 0, "GLOP"
        model = _formulate(level, edits, "GLOP", decided)
        variables = model.solver.NumVariables()
        constraints = model.solver.NumConstraints()
    flow, totals, lp_ms = evaluate(level, decided, edits)
    return GridResult(
        flow=flow,
        totals=totals,
        key=_key(level, edits, decided, totals.total) if optimized else None,
        candidates=_candidates(level, edits, decided) if optimized else {},
        prices=_prices(level, edits, decided, totals.total),
        trace=_trace(level, edits) if optimized else (),
        stats=GridStats(
            engine=engine,
            variables=variables,
            constraints=constraints,
            nodes=nodes,
            ms=round(mip_ms + lp_ms, 3),
        ),
    )
