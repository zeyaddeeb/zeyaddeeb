from dataclasses import dataclass, field

from .world import INFERENCE_VALUE

SHED_VALUE = INFERENCE_VALUE
BUILD_COST_PER_KM = 30.0


@dataclass(frozen=True, slots=True)
class Hub:
    id: str
    name: str
    lat: float
    lon: float
    price: float
    capacity: float


@dataclass(frozen=True, slots=True)
class Substation:
    id: str
    name: str
    place: str
    lat: float
    lon: float
    load: float
    land: float


@dataclass(frozen=True, slots=True)
class Line:
    a: str
    b: str
    km: float
    limit: float

    @property
    def id(self) -> str:
        return f"{self.a}-{self.b}"

    @property
    def cost(self) -> float:
        return round(BUILD_COST_PER_KM * self.km, 4)


@dataclass(frozen=True, slots=True)
class Campus:
    id: str
    mw: float


@dataclass(frozen=True, slots=True)
class GridLevel:
    id: str
    campuses: tuple[Campus, ...]
    placement: dict[str, str] | None = None
    candidates: tuple[str, ...] = ()
    max_build: int = 0
    switching: bool = False
    lure: tuple[str, str] | None = None
    hub_capacity: dict[str, float] = field(default_factory=dict)
    prices: bool = False

    def capacity(self, hub: str) -> float:
        return self.hub_capacity.get(hub, HUBS[hub].capacity)

    @property
    def decides(self) -> bool:
        return (
            self.placement is None or bool(self.candidates) or self.switching
        )


HUBS: dict[str, Hub] = {
    h.id: h
    for h in [
        Hub("goosecreek", "Goose Creek", 39.0751, -77.5318, 45, 850),
        Hub("loudoun", "Loudoun", 38.8948, -77.5682, 62, 1000),
    ]
}

SUBSTATIONS: dict[str, Substation] = {
    s.id: s
    for s in [
        Substation(
            "belmont", "Belmont", "Lansdowne", 39.0583, -77.5401, 150, 18
        ),
        Substation(
            "beaumeade", "Beaumeade", "Ashburn", 39.0260, -77.4564, 300, 34
        ),
        Substation(
            "waxpool", "Waxpool", "Ashburn", 39.0161, -77.4803, 250, 30
        ),
        Substation(
            "sterling", "Sterling Park", "Sterling", 38.9947, -77.4208, 150, 24
        ),
        Substation("dulles", "Dulles", "Dulles", 38.9453, -77.4312, 100, 20),
        Substation(
            "brambleton", "Brambleton", "Brambleton", 38.9639, -77.5490, 100, 9
        ),
        Substation(
            "yardley", "Yardley Ridge", "Arcola", 38.9502, -77.5184, 100, 7
        ),
    ]
}

LINES: dict[str, Line] = {
    ln.id: ln
    for ln in [
        Line("goosecreek", "belmont", 2.0, 600),
        Line("goosecreek", "beaumeade", 8.5, 1000),
        Line("beaumeade", "waxpool", 2.3, 800),
        Line("beaumeade", "sterling", 4.6, 400),
        Line("sterling", "dulles", 5.6, 700),
        Line("dulles", "loudoun", 13.1, 700),
        Line("loudoun", "brambleton", 7.8, 400),
        Line("brambleton", "belmont", 10.5, 300),
        Line("brambleton", "yardley", 3.0, 800),
        Line("yardley", "waxpool", 8.0, 600),
    ]
}

CANDIDATES: dict[str, Line] = {
    ln.id: ln
    for ln in [
        Line("goosecreek", "waxpool", 7.9, 500),
        Line("loudoun", "yardley", 7.5, 500),
        Line("waxpool", "sterling", 5.7, 500),
    ]
}

CAMPUSES = (Campus("alpha", 300), Campus("beta", 200))

GRID_LEVELS: dict[str, GridLevel] = {
    lv.id: lv
    for lv in [
        GridLevel("siting", campuses=CAMPUSES, lure=("alpha", "yardley")),
        GridLevel(
            "wires",
            campuses=CAMPUSES,
            placement={"alpha": "waxpool", "beta": "yardley"},
            candidates=tuple(CANDIDATES),
            max_build=1,
            switching=True,
        ),
        GridLevel(
            "prices",
            campuses=CAMPUSES,
            placement={"alpha": "dulles", "beta": "yardley"},
            hub_capacity={"goosecreek": 1200},
            prices=True,
        ),
    ]
}


def buses() -> list[str]:
    return [*HUBS, *SUBSTATIONS]
