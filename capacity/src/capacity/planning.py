from dataclasses import dataclass, replace
from time import perf_counter
from typing import TypeIs

from ortools.linear_solver import pywraplp

from .grid import HUBS, LINES, SHED_VALUE, SUBSTATIONS, Line, buses
from .plans import PROJECTS, Case, PlanLevel, line_of
from .power import (
    DIGITS,
    MAX_STEPS,
    REFERENCE,
    ZERO,
    Flow,
    _new_solver,
    _run,
)

WORST_TIEBREAK = 1e-4
RENTAL_TIEBREAK = 0.01

Expr = float | pywraplp.LinearExpr


@dataclass(frozen=True, slots=True)
class Schedule:
    starts: frozenset[tuple[str, int, int]] = frozenset()
    rentals: frozenset[tuple[str, str, int]] = frozenset()
    opened: frozenset[tuple[str, str]] = frozenset()


NO_SCHEDULE = Schedule()


@dataclass(frozen=True, slots=True)
class CaseResult:
    case: str
    flow: Flow
    rentals: dict[str, int]
    energy: float
    lost: float
    turbines: float
    build: float
    total: float


@dataclass(frozen=True, slots=True)
class PlanStep:
    ms: float
    total: float
    bound: float | None
    nodes: int
    schedule: Schedule
    cases: tuple[CaseResult, ...]


@dataclass(frozen=True, slots=True)
class PlanKey:
    kind: str
    project: str
    period: int | None
    worth: float


@dataclass(frozen=True, slots=True)
class PlanStats:
    engine: str
    variables: int
    constraints: int
    nodes: int
    ms: float


@dataclass(frozen=True, slots=True)
class Hedge:
    mean_size: int
    mean_total: float
    vss: float
    perfect: float
    evpi: float
    other_size: int
    other_total: float
    other_worst: float


@dataclass(frozen=True, slots=True)
class PlanResult:
    schedule: Schedule
    cases: tuple[CaseResult, ...]
    total: float
    worst: float
    key: PlanKey | None
    hedge: Hedge | None
    trace: tuple[PlanStep, ...]
    stats: PlanStats


@dataclass(slots=True)
class _Case:
    case: Case
    supply: dict[str, pywraplp.Variable]
    shed: dict[str, pywraplp.Variable]
    flows: dict[str, pywraplp.Variable]
    gen: dict[str, pywraplp.Variable]
    blocks: dict[str, Expr]
    live: dict[str, Expr]
    committed: dict[str, Expr]


@dataclass(slots=True)
class _Plan:
    solver: pywraplp.Solver
    level: PlanLevel
    schedule: Schedule | None
    starts: dict[tuple[str, int], pywraplp.Variable]
    rented: dict[tuple[str, str], pywraplp.Variable]
    closed: dict[tuple[str, str], pywraplp.Variable]
    cases: list[_Case]


def _value(expr: Expr) -> float:
    if isinstance(expr, int | float):
        return float(expr)
    return expr.solution_value()


def _constant(expr: Expr) -> TypeIs[float]:
    return isinstance(expr, int | float)


def load_of(case: Case) -> dict[str, float]:
    load = {s: sub.load for s, sub in SUBSTATIONS.items()}
    for s, mw in case.campuses:
        load[s] += mw
    return load


def _start(plan: _Plan, project: str, period: int) -> Expr:
    if plan.schedule is None:
        return pywraplp.VariableExpr(plan.starts[project, period])
    return float(
        sum(
            n
            for p, t, n in plan.schedule.starts
            if p == project and t == period
        )
    )


def _started_by(plan: _Plan, project: str, period: int) -> Expr:
    terms = [
        _start(plan, project, t)
        for t in range(min(period + 1, plan.level.periods))
    ]
    return sum(terms) if terms else 0.0


def _rented(plan: _Plan, rental: str, case: Case, optimize: bool) -> Expr:
    if optimize:
        count = plan.solver.IntVar(0, PROJECTS[rental].blocks, "")
        plan.rented[rental, case.id] = count
        return pywraplp.VariableExpr(count)
    chosen = plan.schedule.rentals if plan.schedule else frozenset()
    return float(sum(n for p, c, n in chosen if p == rental and c == case.id))


def _in_service(plan: _Plan, line: str, case: Case) -> Expr:
    if not plan.level.switching:
        return 1.0
    if plan.schedule is None:
        closed = plan.solver.BoolVar(f"closed[{line},{case.id}]")
        plan.closed[line, case.id] = closed
        return pywraplp.VariableExpr(closed)
    return 0.0 if (line, case.id) in plan.schedule.opened else 1.0


def _network(plan: _Plan, case: Case):
    lines: dict[str, Line] = dict(LINES)
    live: dict[str, Expr] = {
        lid: _in_service(plan, lid, case) for lid in LINES
    }
    extra: dict[str, tuple[Expr, float]] = {}
    boost: dict[str, tuple[Expr, float]] = {}
    plants: dict[str, Expr] = {}
    committed: dict[str, Expr] = {}
    for pid in plan.level.projects:
        p = PROJECTS[pid]
        active = _started_by(plan, pid, case.period - p.lead)
        committed[pid] = _started_by(plan, pid, case.period)
        line = line_of(p)
        if p.kind == "line" and line:
            lines[line.id] = line
            live[line.id] = active
        elif p.kind == "upgrade" and line:
            extra[line.id] = (p.mw * active, p.mw)
        elif p.kind == "hub":
            boost[p.target] = (p.mw * active, p.mw)
        elif p.kind == "plant":
            plants[pid] = active
    return lines, live, extra, boost, plants, committed


def _supply(
    plan: _Plan, boost: dict[str, tuple[Expr, float]]
) -> dict[str, pywraplp.Variable]:
    supply: dict[str, pywraplp.Variable] = {}
    for h, hub in HUBS.items():
        base = plan.level.hub_capacity.get(h, hub.capacity)
        added, most = boost.get(h, (0.0, 0.0))
        top = base + (added if _constant(added) else most)
        v = plan.solver.NumVar(0, top, "")
        if not _constant(added):
            plan.solver.Add(v <= base + added)
        supply[h] = v
    return supply


def _generation(
    plan: _Plan, case: Case, plants: dict[str, Expr], optimize_rentals: bool
) -> tuple[dict[str, pywraplp.Variable], dict[str, Expr]]:
    solver = plan.solver
    gen: dict[str, pywraplp.Variable] = {}
    blocks: dict[str, Expr] = {}
    for pid, active in plants.items():
        p = PROJECTS[pid]
        g = solver.NumVar(0, p.mw * p.size, "")
        solver.Add(g <= p.mw * active)
        gen[pid] = g
    for rid in plan.level.rentals:
        r = PROJECTS[rid]
        blocks[rid] = _rented(plan, rid, case, optimize_rentals)
        g = solver.NumVar(0, r.mw * r.blocks, "")
        solver.Add(g <= r.mw * blocks[rid])
        gen[rid] = g
    return gen, blocks


def _case(
    plan: _Plan, case: Case, optimize_rentals: bool
) -> tuple[_Case, Expr]:
    solver = plan.solver
    level = plan.level
    load = load_of(case)
    lines, live, extra, boost, plants, committed = _network(plan, case)

    bound = sum(
        ln.km * (ln.limit + extra.get(lid, (0.0, 0.0))[1])
        for lid, ln in lines.items()
    )
    big = 2 * bound
    theta = {b: solver.NumVar(-bound, bound, "") for b in buses()}
    solver.Add(theta[REFERENCE] == 0)
    flows: dict[str, pywraplp.Variable] = {}
    for lid, ln in lines.items():
        added, most = extra.get(lid, (0.0, 0.0))
        top = ln.limit + (added if _constant(added) else most)
        flow = solver.NumVar(-top, top, "")
        flows[lid] = flow
        if not _constant(added):
            solver.Add(flow <= ln.limit + added)
            solver.Add(flow >= -ln.limit - added)
        drop = theta[ln.a] - theta[ln.b]
        state = live[lid]
        if _constant(state) and state > 0.5:
            solver.Add(flow * ln.km == drop)
        elif _constant(state):
            flow.SetBounds(0, 0)
        else:
            solver.Add(flow <= ln.limit * state)
            solver.Add(flow >= -ln.limit * state)
            solver.Add(flow * ln.km - drop <= big * (1 - state))
            solver.Add(flow * ln.km - drop >= -big * (1 - state))

    supply = _supply(plan, boost)
    gen, blocks = _generation(plan, case, plants, optimize_rentals)

    shed = {s: solver.NumVar(0, load[s], "") for s in SUBSTATIONS}
    for b in buses():
        out = solver.Sum(
            flows[lid] for lid, ln in lines.items() if ln.a == b
        ) - solver.Sum(flows[lid] for lid, ln in lines.items() if ln.b == b)
        inject = supply.get(b, 0) + solver.Sum(
            g for rid, g in gen.items() if PROJECTS[rid].target == b
        )
        solver.Add(inject - load.get(b, 0) + shed.get(b, 0) == out)

    cost = (
        sum(
            HUBS[h].price * pywraplp.VariableExpr(v) for h, v in supply.items()
        )
        + SHED_VALUE * solver.Sum(shed.values())
        + sum(
            PROJECTS[rid].fuel * pywraplp.VariableExpr(g)
            for rid, g in gen.items()
        )
        + sum(PROJECTS[rid].cost * n for rid, n in blocks.items())
        + sum(PROJECTS[p].cost * committed[p] for p in level.projects)
    )
    return _Case(case, supply, shed, flows, gen, blocks, live, committed), cost


def _formulate(
    level: PlanLevel, schedule: Schedule | None, engine: str
) -> _Plan:
    solver = _new_solver(engine)
    plan = _Plan(solver, level, schedule, {}, {}, {}, [])
    if schedule is None:
        for p in level.projects:
            size = PROJECTS[p].size
            for t in range(level.periods):
                plan.starts[p, t] = solver.IntVar(0, size, f"start[{p},{t}]")
            solver.Add(
                solver.Sum(plan.starts[p, t] for t in range(level.periods))
                <= size
            )
        for t in range(level.periods):
            solver.Add(
                solver.Sum(plan.starts[p, t] for p in level.projects)
                <= level.crews
            )
        if level.budget is not None:
            solver.Add(solver.Sum(plan.starts.values()) <= level.budget)
    rentals = schedule is None or level.recourse
    costs: dict[str, Expr] = {}
    for case in level.cases:
        block, cost = _case(plan, case, rentals)
        plan.cases.append(block)
        costs[case.id] = cost
    expected = sum(c.weight * costs[c.id] for c in level.cases)
    tie = RENTAL_TIEBREAK * (
        solver.Sum(plan.rented.values())
        + sum(1 - pywraplp.VariableExpr(v) for v in plan.closed.values())
    )
    if level.objective == "worst":
        worst = solver.NumVar(0, solver.infinity(), "worst")
        for c in level.cases:
            solver.Add(worst >= costs[c.id])
        solver.Minimize(worst + WORST_TIEBREAK * expected + tie)
    else:
        solver.Minimize(expected + tie)
    return plan


def _engine(level: PlanLevel, schedule: Schedule | None) -> str:
    if schedule is None or (level.recourse and level.rentals):
        return "SCIP"
    return "GLOP"


def _positive(values: dict[str, float]) -> dict[str, float]:
    rounded = {k: round(v, 6) for k, v in values.items()}
    return {k: v for k, v in rounded.items() if v > ZERO}


def _decided(plan: _Plan) -> Schedule:
    if plan.schedule is not None and not plan.level.recourse:
        return plan.schedule
    starts = (
        frozenset(
            (p, t, round(v.solution_value()))
            for (p, t), v in plan.starts.items()
            if v.solution_value() > 0.5
        )
        if plan.schedule is None
        else plan.schedule.starts
    )
    rentals = frozenset(
        (rid, cid, round(v.solution_value()))
        for (rid, cid), v in plan.rented.items()
        if v.solution_value() > 0.5
    )
    opened = (
        frozenset(
            k for k, v in plan.closed.items() if v.solution_value() < 0.5
        )
        if plan.schedule is None
        else plan.schedule.opened
    )
    return Schedule(starts, rentals, opened)


def _read(plan: _Plan) -> tuple[CaseResult, ...]:
    out = []
    for c in plan.cases:
        live = {lid for lid, s in c.live.items() if _value(s) > 0.5}
        flows = {
            lid: round(v.solution_value(), 6)
            for lid, v in c.flows.items()
            if lid in live
        }
        binding = tuple(
            lid
            for lid, mw in flows.items()
            if abs(mw) >= _limit(plan, c, lid) - 1e-4
        )
        built = tuple(
            lid
            for lid, s in c.live.items()
            if lid not in LINES and lid in live
        )
        opened = tuple(sorted(lid for lid in LINES if lid not in live))
        flow = Flow(
            placement={},
            built=built,
            opened=opened,
            flows=flows,
            supply=_positive(
                {h: v.solution_value() for h, v in c.supply.items()}
            ),
            shed=_positive({s: v.solution_value() for s, v in c.shed.items()}),
            binding=binding,
        )
        energy = sum(
            HUBS[h].price * v.solution_value() for h, v in c.supply.items()
        )
        lost = SHED_VALUE * sum(v.solution_value() for v in c.shed.values())
        turbines = sum(
            PROJECTS[rid].fuel * g.solution_value() for rid, g in c.gen.items()
        ) + sum(PROJECTS[rid].cost * _value(n) for rid, n in c.blocks.items())
        build = sum(
            PROJECTS[p].cost * _value(n) for p, n in c.committed.items()
        )
        out.append(
            CaseResult(
                case=c.case.id,
                flow=flow,
                rentals={
                    rid: round(_value(n))
                    for rid, n in c.blocks.items()
                    if _value(n) > 0.5
                },
                energy=round(energy, DIGITS),
                lost=round(lost, DIGITS),
                turbines=round(turbines, DIGITS),
                build=round(build, DIGITS),
                total=round(energy + lost + turbines + build, DIGITS),
            )
        )
    return tuple(out)


def _limit(plan: _Plan, c: _Case, lid: str) -> float:
    line = {**LINES, **{ln.id: ln for ln in _candidate_lines(plan)}}[lid]
    extra = sum(
        PROJECTS[p].mw
        * _value(_started_by(plan, p, c.case.period - PROJECTS[p].lead))
        for p in plan.level.projects
        if PROJECTS[p].kind == "upgrade" and PROJECTS[p].target == lid
    )
    return line.limit + extra


def _candidate_lines(plan: _Plan) -> list[Line]:
    return [
        ln
        for p in plan.level.projects
        if PROJECTS[p].kind == "line" and (ln := line_of(PROJECTS[p]))
    ]


def _totals(
    level: PlanLevel, cases: tuple[CaseResult, ...]
) -> tuple[float, float]:
    weights = {c.id: c.weight for c in level.cases}
    total = sum(weights[c.case] * c.total for c in cases)
    return round(total, DIGITS), round(max(c.total for c in cases), DIGITS)


def score(level: PlanLevel, cases: tuple[CaseResult, ...]) -> float:
    total, worst = _totals(level, cases)
    return worst if level.objective == "worst" else total


def evaluate(
    level: PlanLevel, schedule: Schedule
) -> tuple[Schedule, tuple[CaseResult, ...], float]:
    plan = _formulate(level, schedule, _engine(level, schedule))
    ms = _run(plan.solver)
    return _decided(plan), _read(plan), ms


def _optimum(
    level: PlanLevel, fix: dict[tuple[str, int], int] | None = None
) -> tuple[_Plan, float]:
    plan = _formulate(level, None, "SCIP")
    for key, value in (fix or {}).items():
        plan.starts[key].SetBounds(value, value)
    return plan, _run(plan.solver)


def _trace(level: PlanLevel) -> tuple[PlanStep, ...]:
    steps: list[PlanStep] = []
    for k in range(1, MAX_STEPS + 1):
        plan = _formulate(level, None, "SCIP")
        plan.solver.SetSolverSpecificParametersAsString(
            f"limits/solutions = {k}"
        )
        started = perf_counter()
        status = plan.solver.Solve()
        ms = (perf_counter() - started) * 1000
        if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
            break
        schedule = _decided(plan)
        _, cases, _ = evaluate(level, schedule)
        bound = plan.solver.Objective().BestBound()
        step = PlanStep(
            ms=round(ms, 3),
            total=score(level, cases),
            bound=round(bound, DIGITS) if bound > 0 else None,
            nodes=plan.solver.nodes(),
            schedule=schedule,
            cases=cases,
        )
        if steps and steps[-1].schedule == schedule:
            steps[-1] = replace(step, ms=steps[-1].ms)
        else:
            steps.append(step)
        if status == pywraplp.Solver.OPTIMAL:
            break
    return tuple(steps)


def size_of(schedule: Schedule) -> int:
    return sum(n for _, _, n in schedule.starts)


def _mean_case(level: PlanLevel) -> Case:
    load: dict[str, float] = {}
    for c in level.cases:
        for s, mw in c.campuses:
            load[s] = load.get(s, 0.0) + c.weight * mw
    return Case(
        "mean", "Average", 1.0, level.cases[0].period, tuple(load.items())
    )


def _best(level: PlanLevel) -> Schedule:
    plan, _ = _optimum(level)
    return _decided(plan)


def _hedge(level: PlanLevel, total: float) -> Hedge | None:
    if not level.futures:
        return None
    mean = _best(
        replace(level, cases=(_mean_case(level),), objective="expected")
    )
    first = Schedule(mean.starts)
    _, mean_cases, _ = evaluate(level, first)
    mean_total, _ = _totals(level, mean_cases)
    perfect = sum(
        c.weight
        * solve_plan(
            replace(
                level, cases=(replace(c, weight=1.0),), objective="expected"
            ),
            hedge=False,
        ).total
        for c in level.cases
    )
    flip = "expected" if level.objective == "worst" else "worst"
    other = _best(replace(level, objective=flip))
    _, other_cases, _ = evaluate(level, Schedule(other.starts))
    other_total, other_worst = _totals(level, other_cases)
    expected = (
        total
        if level.objective != "worst"
        else _totals(
            level,
            evaluate(level, _best(replace(level, objective="expected")))[1],
        )[0]
    )
    return Hedge(
        mean_size=size_of(mean),
        mean_total=mean_total,
        vss=round(mean_total - expected, DIGITS),
        perfect=round(perfect, DIGITS),
        evpi=round(expected - perfect, DIGITS),
        other_size=size_of(other),
        other_total=other_total,
        other_worst=other_worst,
    )


def _key(level: PlanLevel, schedule: Schedule, best: float) -> PlanKey | None:
    if level.futures:
        return None
    if level.switching and schedule.opened:
        line, case = sorted(schedule.opened, key=lambda o: (o[1], o[0]))[0]
        kept = replace(schedule, opened=schedule.opened - {(line, case)})
        _, cases, _ = evaluate(level, kept)
        return PlanKey(
            "open",
            line,
            next(c.period for c in level.cases if c.id == case),
            round(score(level, cases) - best, DIGITS),
        )
    if level.rentals and schedule.rentals:
        rid = sorted(schedule.rentals)[0][0]
        banned = replace(level, rentals=())
        plan, _ = _optimum(banned)
        _, cases, _ = evaluate(banned, _decided(plan))
        return PlanKey(
            "rent", rid, None, round(score(banned, cases) - best, DIGITS)
        )
    first = sorted(schedule.starts, key=lambda s: (s[1], s[0]))
    if not first:
        return None
    project, period, _ = first[0]
    plan, _ = _optimum(level, {(project, period): 0})
    _, cases, _ = evaluate(level, _decided(plan))
    return PlanKey(
        "start", project, period, round(score(level, cases) - best, DIGITS)
    )


def solve_plan(
    level: PlanLevel, schedule: Schedule | None = None, hedge: bool = True
) -> PlanResult:
    if schedule is None:
        plan, mip_ms = _optimum(level)
        decided = _decided(plan)
        stats_plan, nodes, engine = plan, plan.solver.nodes(), "SCIP + GLOP"
    else:
        decided, mip_ms, nodes = schedule, 0.0, 0
        stats_plan, engine = None, _engine(level, schedule)
    decided, cases, lp_ms = evaluate(level, decided)
    total, worst = _totals(level, cases)
    best = score(level, cases)
    model = stats_plan or _formulate(level, decided, _engine(level, decided))
    return PlanResult(
        schedule=decided,
        cases=cases,
        total=total,
        worst=worst,
        key=_key(level, decided, best) if schedule is None else None,
        hedge=_hedge(level, total) if schedule is None and hedge else None,
        trace=_trace(level) if schedule is None and hedge else (),
        stats=PlanStats(
            engine=engine,
            variables=model.solver.NumVariables(),
            constraints=model.solver.NumConstraints(),
            nodes=nodes,
            ms=round(mip_ms + lp_ms, 3),
        ),
    )
