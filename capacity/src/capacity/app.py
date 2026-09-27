from dataclasses import asdict
from functools import cache, lru_cache

from fastapi import FastAPI, HTTPException, status

from .grid import (
    BUILD_COST_PER_KM,
    CANDIDATES,
    GRID_LEVELS,
    HUBS,
    LINES,
    SHED_VALUE,
    SUBSTATIONS,
    GridLevel,
    Line,
)
from .planning import CaseResult, PlanResult, Schedule, solve_plan
from .plans import PLAN_LEVELS, PROJECTS, PlanLevel
from .power import Choice, Flow, GridEdits, GridResult, solve_grid
from .schemas import (
    BuildOut,
    CampusOut,
    CaseOut,
    CaseResultOut,
    CityOut,
    EditsIn,
    FlowOut,
    GridEditsIn,
    GridKeyOut,
    GridLevelOut,
    GridSolveIn,
    GridSolveOut,
    GridStatsOut,
    GridTotalsOut,
    GridValues,
    GridWorld,
    HedgeOut,
    HubOut,
    KeyOut,
    LevelOut,
    LineOut,
    OpenIn,
    Placement,
    PlanKeyOut,
    PlanLevelOut,
    PlanSolveIn,
    PlanSolveOut,
    PlanStepOut,
    PlansWorld,
    ProjectOut,
    RentalIn,
    Route,
    ScheduleIn,
    SiteOut,
    SolveIn,
    SolveOut,
    StartIn,
    StatsOut,
    StepOut,
    SubstationOut,
    TotalsOut,
    Values,
    World,
)
from .solver import Edits, Result, SolverError, blocks, solve
from .world import (
    CITIES,
    INFERENCE_VALUE,
    LEVELS,
    SITES,
    TRAINING_VALUE,
    UPGRADE_MW,
    Level,
    rtt_ms,
)

SOLVE_CACHE_SIZE = 512

app = FastAPI(
    title="capacity", docs_url=None, redoc_url=None, openapi_url=None
)


def _level_out(level: Level) -> LevelOut:
    return LevelOut(
        id=level.id,
        capacity=level.capacity,
        demand=level.demand,
        latency=level.latency,
        training=level.training,
        carbon_cap=level.carbon_cap,
        outage=level.outage,
        start=[
            Route(city=c, site=s, mw=mw)
            for (c, s), mw in (level.start or {}).items()
        ],
        build=BuildOut(**asdict(level.build)) if level.build else None,
    )


@cache
def world() -> World:
    return World(
        sites=[SiteOut(**asdict(s)) for s in SITES.values()],
        cities=[CityOut(**asdict(c)) for c in CITIES.values()],
        levels=[_level_out(lv) for lv in LEVELS.values()],
        rtt={c: {s: rtt_ms(c, s) for s in SITES} for c in CITIES},
        values=Values(
            inference=INFERENCE_VALUE,
            training=TRAINING_VALUE,
            upgrade_mw=UPGRADE_MW,
        ),
    )


def _response(result: Result) -> SolveOut:
    plan = result.plan
    return SolveOut(
        routes=[
            Route(city=c, site=s, mw=mw) for (c, s), mw in plan.routes.items()
        ],
        training=[Placement(site=s, mw=mw) for s, mw in plan.training.items()],
        dropped=plan.dropped,
        dropped_training=plan.dropped_training,
        build=plan.build,
        totals=TotalsOut(**asdict(result.totals)),
        key=KeyOut(**asdict(result.key)) if result.key else None,
        upgrades=result.upgrades,
        duals=result.duals,
        carbon_price=result.carbon_price,
        carbon_dual=result.carbon_dual,
        build_all_cost=result.build_all_cost,
        solver=StatsOut(**asdict(result.stats)),
    )


@lru_cache(maxsize=SOLVE_CACHE_SIZE)
def _cached_solve(
    level_id: str, edits: Edits, optimize_build: bool
) -> SolveOut:
    return _response(solve(LEVELS[level_id], edits, optimize_build))


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _validated(level: Level, edits: EditsIn, optimize_build: bool) -> Edits:
    unknown = set(edits.offline) - level.capacity.keys()
    if unknown:
        raise _invalid(f"unknown sites {sorted(unknown)}")
    build = {s: n for s, n in edits.build.items() if n}
    if (build or optimize_build) and level.build is None:
        raise _invalid("this level has nothing to build")
    if not build.keys() <= level.capacity.keys():
        raise _invalid("blocks must go on sites in this level")
    if level.build and sum(build.values()) > level.build.blocks:
        raise _invalid(f"at most {level.build.blocks} blocks")
    return Edits(
        offline=frozenset(edits.offline),
        latency=edits.latency,
        demand=edits.demand,
        build=blocks(build),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/world", response_model_by_alias=True)
def get_world() -> World:
    return world()


@app.post("/solve", response_model_by_alias=True)
def post_solve(body: SolveIn) -> SolveOut:
    level = LEVELS.get(body.level)
    if level is None:
        raise _invalid(f"unknown level {body.level}")
    edits = _validated(level, body.edits, body.optimize_build)
    try:
        return _cached_solve(level.id, edits, body.optimize_build)
    except SolverError as error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, str(error)
        ) from error


def _line_out(line: Line) -> LineOut:
    return LineOut(
        id=line.id,
        a=line.a,
        b=line.b,
        km=line.km,
        limit=line.limit,
        cost=line.cost,
    )


def _grid_level_out(level: GridLevel) -> GridLevelOut:
    return GridLevelOut(
        id=level.id,
        campuses=[CampusOut(**asdict(c)) for c in level.campuses],
        placement=level.placement,
        candidates=list(level.candidates),
        max_build=level.max_build,
        switching=level.switching,
        lure=level.lure,
        hub_capacity=level.hub_capacity,
        prices=level.prices,
    )


@cache
def grid() -> GridWorld:
    return GridWorld(
        hubs=[HubOut(**asdict(h)) for h in HUBS.values()],
        substations=[SubstationOut(**asdict(s)) for s in SUBSTATIONS.values()],
        lines=[_line_out(ln) for ln in LINES.values()],
        candidates=[_line_out(ln) for ln in CANDIDATES.values()],
        levels=[_grid_level_out(lv) for lv in GRID_LEVELS.values()],
        values=GridValues(shed=SHED_VALUE, build_per_km=BUILD_COST_PER_KM),
    )


def _flow_fields(flow: Flow) -> dict:
    return {
        "placement": flow.placement,
        "built": list(flow.built),
        "opened": list(flow.opened),
        "flows": flow.flows,
        "supply": flow.supply,
        "shed": flow.shed,
        "binding": list(flow.binding),
    }


def _grid_response(result: GridResult) -> GridSolveOut:
    return GridSolveOut(
        **_flow_fields(result.flow),
        totals=GridTotalsOut(**asdict(result.totals)),
        key=GridKeyOut(**asdict(result.key)) if result.key else None,
        candidates=result.candidates,
        prices=result.prices,
        trace=[
            StepOut(
                ms=step.ms,
                total=step.total,
                bound=step.bound,
                nodes=step.nodes,
                flow=FlowOut(**_flow_fields(step.flow)),
            )
            for step in result.trace
        ],
        solver=GridStatsOut(**asdict(result.stats)),
    )


@lru_cache(maxsize=SOLVE_CACHE_SIZE)
def _cached_grid_solve(
    level_id: str, edits: GridEdits, choice: Choice | None
) -> GridSolveOut:
    return _grid_response(solve_grid(GRID_LEVELS[level_id], edits, choice))


def _grid_edits(level: GridLevel, edits: GridEditsIn) -> GridEdits:
    unknown = set(edits.tripped) - LINES.keys() - set(level.candidates)
    if unknown:
        raise _invalid(f"unknown lines {sorted(unknown)}")
    return GridEdits(tripped=frozenset(edits.tripped), demand=edits.demand)


def _grid_choice(level: GridLevel, body: GridSolveIn) -> Choice | None:
    if body.optimize:
        if body.placement or body.built or body.opened:
            raise _invalid("the solver makes its own choices")
        return None
    campuses = {c.id for c in level.campuses}
    if level.placement is None:
        if not body.placement.keys() <= campuses:
            raise _invalid("unknown campuses")
        if not set(body.placement.values()) <= SUBSTATIONS.keys():
            raise _invalid("campuses go on substations")
    elif body.placement:
        raise _invalid("this level's campuses are already placed")
    if not set(body.built) <= set(level.candidates):
        raise _invalid("that line is not on offer")
    if len(set(body.built)) > level.max_build:
        raise _invalid(f"at most {level.max_build} new lines")
    if body.opened and not level.switching:
        raise _invalid("this level has no breakers to open")
    if not set(body.opened) <= LINES.keys():
        raise _invalid("unknown lines to open")
    return Choice(
        placement=frozenset(
            body.placement.items() or (level.placement or {}).items()
        ),
        built=frozenset(body.built),
        opened=frozenset(body.opened),
    )


@app.get("/grid", response_model_by_alias=True)
def get_grid() -> GridWorld:
    return grid()


@app.post("/grid/solve", response_model_by_alias=True)
def post_grid_solve(body: GridSolveIn) -> GridSolveOut:
    level = GRID_LEVELS.get(body.level)
    if level is None:
        raise _invalid(f"unknown level {body.level}")
    edits = _grid_edits(level, body.edits)
    choice = _grid_choice(level, body)
    try:
        return _cached_grid_solve(level.id, edits, choice)
    except SolverError as error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, str(error)
        ) from error


@cache
def plans() -> PlansWorld:
    return PlansWorld(
        projects=[ProjectOut(**asdict(p)) for p in PROJECTS.values()],
        levels=[
            PlanLevelOut(
                id=lv.id,
                cases=[
                    CaseOut(
                        id=c.id,
                        label=c.label,
                        weight=c.weight,
                        period=c.period,
                        campuses=list(c.campuses),
                    )
                    for c in lv.cases
                ],
                projects=list(lv.projects),
                periods=lv.periods,
                crews=lv.crews,
                budget=lv.budget,
                objective=lv.objective,
                rentals=list(lv.rentals),
                recourse=lv.recourse,
                switching=lv.switching,
            )
            for lv in PLAN_LEVELS.values()
        ],
    )


def _schedule_out(schedule: Schedule) -> ScheduleIn:
    return ScheduleIn(
        starts=[
            StartIn(project=p, period=t, count=n)
            for p, t, n in sorted(schedule.starts)
        ],
        rentals=[
            RentalIn(project=p, case=c, blocks=n)
            for p, c, n in sorted(schedule.rentals)
        ],
        opened=[OpenIn(line=ln, case=c) for ln, c in sorted(schedule.opened)],
    )


def _case_out(result: CaseResult) -> CaseResultOut:
    return CaseResultOut(
        case=result.case,
        flow=FlowOut(**_flow_fields(result.flow)),
        rentals=result.rentals,
        energy=result.energy,
        lost=result.lost,
        turbines=result.turbines,
        build=result.build,
        total=result.total,
    )


def _plan_response(result: PlanResult) -> PlanSolveOut:
    return PlanSolveOut(
        schedule=_schedule_out(result.schedule),
        cases=[_case_out(c) for c in result.cases],
        total=result.total,
        worst=result.worst,
        key=PlanKeyOut(**asdict(result.key)) if result.key else None,
        hedge=HedgeOut(**asdict(result.hedge)) if result.hedge else None,
        trace=[
            PlanStepOut(
                ms=step.ms,
                total=step.total,
                bound=step.bound,
                nodes=step.nodes,
                schedule=_schedule_out(step.schedule),
                cases=[_case_out(c) for c in step.cases],
            )
            for step in result.trace
        ],
        solver=GridStatsOut(**asdict(result.stats)),
    )


def _plan_schedule(level: PlanLevel, body: ScheduleIn) -> Schedule:
    cases = {c.id for c in level.cases}
    per_period: dict[int, int] = {}
    seen: set[str] = set()
    for s in body.starts:
        project = PROJECTS.get(s.project)
        if s.project not in level.projects or project is None:
            raise _invalid(f"{s.project} is not on offer")
        if s.period >= level.periods:
            raise _invalid("that start is outside the plan")
        if s.count > project.size or s.project in seen:
            raise _invalid(f"too much {s.project}")
        seen.add(s.project)
        per_period[s.period] = per_period.get(s.period, 0) + s.count
    if any(n > level.crews for n in per_period.values()):
        raise _invalid(f"at most {level.crews} starts a year")
    if level.budget is not None and len(body.starts) > level.budget:
        raise _invalid(f"at most {level.budget} projects")
    if body.rentals and level.recourse:
        raise _invalid("the solver rents on the day")
    for r in body.rentals:
        if r.project not in level.rentals or r.case not in cases:
            raise _invalid("that rental is not on offer")
        if r.blocks > PROJECTS[r.project].blocks:
            raise _invalid("too many blocks")
    for o in body.opened:
        if not level.switching or o.line not in LINES or o.case not in cases:
            raise _invalid("that breaker is not on offer")
    return Schedule(
        starts=frozenset((s.project, s.period, s.count) for s in body.starts),
        rentals=frozenset((r.project, r.case, r.blocks) for r in body.rentals),
        opened=frozenset((o.line, o.case) for o in body.opened),
    )


@lru_cache(maxsize=SOLVE_CACHE_SIZE)
def _cached_plan_solve(
    level_id: str, schedule: Schedule | None
) -> PlanSolveOut:
    return _plan_response(solve_plan(PLAN_LEVELS[level_id], schedule))


@app.get("/plans", response_model_by_alias=True)
def get_plans() -> PlansWorld:
    return plans()


@app.post("/plan/solve", response_model_by_alias=True)
def post_plan_solve(body: PlanSolveIn) -> PlanSolveOut:
    level = PLAN_LEVELS.get(body.level)
    if level is None:
        raise _invalid(f"unknown level {body.level}")
    schedule = _plan_schedule(level, body.schedule) if body.schedule else None
    try:
        return _cached_plan_solve(level.id, schedule)
    except SolverError as error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, str(error)
        ) from error
