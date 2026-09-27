from dataclasses import dataclass, field

from .grid import CANDIDATES, LINES


@dataclass(frozen=True, slots=True)
class Project:
    id: str
    kind: str
    target: str
    mw: float
    lead: int
    cost: float
    fuel: float = 0.0
    blocks: int = 0

    @property
    def size(self) -> int:
        return max(1, self.blocks) if self.kind != "turbine" else 0

    @property
    def sized(self) -> bool:
        return self.blocks > 0 and self.kind != "turbine"


@dataclass(frozen=True, slots=True)
class Case:
    id: str
    label: str
    weight: float
    period: int
    campuses: tuple[tuple[str, float], ...]


@dataclass(frozen=True, slots=True)
class PlanLevel:
    id: str
    cases: tuple[Case, ...]
    projects: tuple[str, ...]
    periods: int
    crews: int = 1
    budget: int | None = None
    objective: str = "expected"
    rentals: tuple[str, ...] = ()
    recourse: bool = False
    switching: bool = False
    hub_capacity: dict[str, float] = field(default_factory=dict)

    @property
    def futures(self) -> bool:
        return self.periods == 1 and len(self.cases) > 1


TURBINE_FUEL = 140.0
TURBINE_RENT = 3500.0
TURBINE_MW = 100.0
PREORDER_RENT = 2500.0
RUSH_RENT = 9000.0

PROJECTS: dict[str, Project] = {
    p.id: p
    for p in [
        Project(
            "goosecreek-transformer",
            "hub",
            "goosecreek",
            300,
            lead=3,
            cost=900,
        ),
        Project(
            "loudoun-brambleton",
            "upgrade",
            "loudoun-brambleton",
            250,
            lead=1,
            cost=300,
        ),
        Project(
            "loudoun-yardley",
            "line",
            "loudoun-yardley",
            CANDIDATES["loudoun-yardley"].limit,
            lead=2,
            cost=CANDIDATES["loudoun-yardley"].cost,
        ),
        Project(
            "turbines-yardley",
            "turbine",
            "yardley",
            TURBINE_MW,
            lead=0,
            cost=TURBINE_RENT,
            fuel=TURBINE_FUEL,
            blocks=3,
        ),
        Project(
            "preorder-yardley",
            "plant",
            "yardley",
            TURBINE_MW,
            lead=0,
            cost=PREORDER_RENT,
            fuel=TURBINE_FUEL,
            blocks=6,
        ),
        Project(
            "rush-yardley",
            "turbine",
            "yardley",
            TURBINE_MW,
            lead=0,
            cost=RUSH_RENT,
            fuel=TURBINE_FUEL,
            blocks=2,
        ),
    ]
}

YEARS = (2027, 2028, 2029, 2030)
ARRIVALS: tuple[tuple[str, float], ...] = (
    ("waxpool", 300),
    ("yardley", 200),
    ("sterling", 200),
    ("belmont", 200),
)


def growing(years: tuple[int, ...] = YEARS) -> tuple[Case, ...]:
    return tuple(
        Case(
            f"y{year}",
            str(year),
            1 / len(years),
            i,
            ARRIVALS[: i + 1],
        )
        for i, year in enumerate(years)
    )


SIGNINGS = (
    Case("one", "One signs", 0.5, 0, (("yardley", 200),)),
    Case(
        "two",
        "Two sign",
        0.3,
        0,
        (("yardley", 200), ("brambleton", 300)),
    ),
    Case(
        "three",
        "Three sign",
        0.2,
        0,
        (("yardley", 500), ("brambleton", 300)),
    ),
)


def signing_level(id: str, objective: str = "expected") -> PlanLevel:
    return PlanLevel(
        id,
        cases=SIGNINGS,
        projects=("preorder-yardley",),
        periods=1,
        crews=6,
        objective=objective,
        rentals=("rush-yardley",),
        recourse=True,
    )


PLAN_LEVELS: dict[str, PlanLevel] = {
    lv.id: lv
    for lv in [
        PlanLevel(
            "lead",
            cases=growing(),
            projects=(
                "goosecreek-transformer",
                "loudoun-brambleton",
                "loudoun-yardley",
            ),
            periods=3,
        ),
        PlanLevel(
            "bridge",
            cases=growing(),
            projects=(
                "goosecreek-transformer",
                "loudoun-brambleton",
                "loudoun-yardley",
            ),
            periods=3,
            rentals=("turbines-yardley",),
        ),
        PlanLevel(
            "toolbox",
            cases=growing(),
            projects=(
                "goosecreek-transformer",
                "loudoun-brambleton",
                "loudoun-yardley",
            ),
            periods=3,
            rentals=("turbines-yardley",),
            switching=True,
        ),
        signing_level("average"),
        signing_level("worst", "worst"),
        signing_level("knowing"),
    ]
}


def line_of(project: Project):
    if project.kind == "line":
        return CANDIDATES[project.target]
    if project.kind == "upgrade":
        return LINES[project.target]
    return None
