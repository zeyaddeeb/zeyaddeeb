from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Id = Annotated[str, Field(pattern=r"^[a-z]{2,16}$")]
Megawatts = Annotated[float, Field(ge=0)]


class Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        allow_inf_nan=False,
        frozen=True,
    )


class SiteOut(Model):
    id: str
    name: str
    place: str
    lat: float
    lon: float
    price: float
    carbon: float


class CityOut(Model):
    id: str
    name: str
    lat: float
    lon: float


class Route(Model):
    city: str
    site: str
    mw: Megawatts


class Placement(Model):
    site: str
    mw: Megawatts


class BuildOut(Model):
    block: float
    cost: float
    blocks: int


class LevelOut(Model):
    id: str
    capacity: dict[str, float]
    demand: dict[str, float]
    latency: float
    training: float
    carbon_cap: float | None
    outage: str | None
    start: list[Route]
    build: BuildOut | None


class Values(Model):
    inference: float
    training: float
    upgrade_mw: float


class World(Model):
    sites: list[SiteOut]
    cities: list[CityOut]
    levels: list[LevelOut]
    rtt: dict[str, dict[str, float]]
    values: Values


class EditsIn(Model):
    offline: Annotated[list[Id], Field(max_length=16)] = []
    latency: Annotated[float | None, Field(ge=10, le=300)] = None
    demand: Annotated[float, Field(ge=0.25, le=3)] = 1.0
    build: Annotated[
        dict[Id, Annotated[int, Field(ge=0, le=8)]], Field(max_length=16)
    ] = {}


class SolveIn(Model):
    level: Id
    edits: EditsIn = EditsIn()
    optimize_build: bool = False


class TotalsOut(Model):
    energy: float
    lost: float
    build: float
    total: float
    carbon: float
    served: float
    demand: float


class StatsOut(Model):
    engine: str
    variables: int
    constraints: int
    iterations: int
    ms: float


class KeyOut(Model):
    demand: str
    site: str
    mw: Megawatts
    worth: float


class SolveOut(Model):
    routes: list[Route]
    training: list[Placement]
    dropped: dict[str, float]
    dropped_training: float
    build: dict[str, int]
    totals: TotalsOut
    key: KeyOut | None
    upgrades: dict[str, float]
    duals: dict[str, float]
    carbon_price: float | None
    carbon_dual: float | None
    build_all_cost: float | None
    solver: StatsOut


LineId = Annotated[str, Field(pattern=r"^[a-z]{2,16}-[a-z]{2,16}$")]


class HubOut(Model):
    id: str
    name: str
    lat: float
    lon: float
    price: float
    capacity: float


class SubstationOut(Model):
    id: str
    name: str
    place: str
    lat: float
    lon: float
    load: float
    land: float


class LineOut(Model):
    id: str
    a: str
    b: str
    km: float
    limit: float
    cost: float


class CampusOut(Model):
    id: str
    mw: float


class GridLevelOut(Model):
    id: str
    campuses: list[CampusOut]
    placement: dict[str, str] | None
    candidates: list[str]
    max_build: int
    switching: bool
    lure: tuple[str, str] | None
    hub_capacity: dict[str, float]
    prices: bool


class GridValues(Model):
    shed: float
    build_per_km: float


class GridWorld(Model):
    hubs: list[HubOut]
    substations: list[SubstationOut]
    lines: list[LineOut]
    candidates: list[LineOut]
    levels: list[GridLevelOut]
    values: GridValues


class GridEditsIn(Model):
    tripped: Annotated[list[LineId], Field(max_length=16)] = []
    demand: Annotated[float, Field(ge=0.5, le=1.5)] = 1.0


class GridSolveIn(Model):
    level: Id
    placement: Annotated[dict[Id, Id], Field(max_length=8)] = {}
    built: Annotated[list[LineId], Field(max_length=8)] = []
    opened: Annotated[list[LineId], Field(max_length=16)] = []
    edits: GridEditsIn = GridEditsIn()
    optimize: bool = False


class GridTotalsOut(Model):
    energy: float
    lost: float
    land: float
    build: float
    total: float
    served: float
    demand: float


class GridKeyOut(Model):
    kind: str
    campus: str | None
    substation: str | None
    line: str | None
    worth: float


class GridStatsOut(Model):
    engine: str
    variables: int
    constraints: int
    nodes: int
    ms: float


class FlowOut(Model):
    placement: dict[str, str]
    built: list[str]
    opened: list[str]
    flows: dict[str, float]
    supply: dict[str, float]
    shed: dict[str, float]
    binding: list[str]


class StepOut(Model):
    ms: float
    total: float
    bound: float | None
    nodes: int
    flow: FlowOut


class GridSolveOut(FlowOut):
    totals: GridTotalsOut
    key: GridKeyOut | None
    candidates: dict[str, float]
    prices: dict[str, float]
    trace: list[StepOut]
    solver: GridStatsOut


ProjectId = Annotated[str, Field(pattern=r"^[a-z]{2,16}(-[a-z]{2,16}){0,2}$")]
CaseId = Annotated[str, Field(pattern=r"^[a-z0-9]{2,16}$")]


class ProjectOut(Model):
    id: str
    kind: str
    target: str
    mw: float
    lead: int
    cost: float
    fuel: float
    blocks: int


class CaseOut(Model):
    id: str
    label: str
    weight: float
    period: int
    campuses: list[tuple[str, float]]


class PlanLevelOut(Model):
    id: str
    cases: list[CaseOut]
    projects: list[str]
    periods: int
    crews: int
    budget: int | None
    objective: str
    rentals: list[str]
    recourse: bool
    switching: bool


class PlansWorld(Model):
    projects: list[ProjectOut]
    levels: list[PlanLevelOut]


class StartIn(Model):
    project: ProjectId
    period: Annotated[int, Field(ge=0, le=8)]
    count: Annotated[int, Field(ge=1, le=8)] = 1


class RentalIn(Model):
    project: ProjectId
    case: CaseId
    blocks: Annotated[int, Field(ge=1, le=8)]


class OpenIn(Model):
    line: LineId
    case: CaseId


class ScheduleIn(Model):
    starts: Annotated[list[StartIn], Field(max_length=16)] = []
    rentals: Annotated[list[RentalIn], Field(max_length=32)] = []
    opened: Annotated[list[OpenIn], Field(max_length=48)] = []


class PlanSolveIn(Model):
    level: Id
    schedule: ScheduleIn | None = None


class CaseResultOut(Model):
    case: str
    flow: FlowOut
    rentals: dict[str, int]
    energy: float
    lost: float
    turbines: float
    build: float
    total: float


class PlanKeyOut(Model):
    kind: str
    project: str
    period: int | None
    worth: float


class HedgeOut(Model):
    mean_size: int
    mean_total: float
    vss: float
    perfect: float
    evpi: float
    other_size: int
    other_total: float
    other_worst: float


class PlanStepOut(Model):
    ms: float
    total: float
    bound: float | None
    nodes: int
    schedule: ScheduleIn
    cases: list[CaseResultOut]


class PlanSolveOut(Model):
    schedule: ScheduleIn
    cases: list[CaseResultOut]
    total: float
    worst: float
    key: PlanKeyOut | None
    hedge: HedgeOut | None
    trace: list[PlanStepOut]
    solver: GridStatsOut
