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
