from dataclasses import asdict
from functools import cache, lru_cache

from fastapi import FastAPI, HTTPException, status

from .schemas import (
    BuildOut,
    CityOut,
    EditsIn,
    KeyOut,
    LevelOut,
    Placement,
    Route,
    SiteOut,
    SolveIn,
    SolveOut,
    StatsOut,
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
