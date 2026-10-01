from dataclasses import dataclass
from functools import cache
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0
FIBER_KM_PER_MS = 200.0
PATH_STRETCH = 1.4
SWITCHING_MS = 2.0

INFERENCE_VALUE = 1400.0
TRAINING_VALUE = 500.0
UPGRADE_MW = 10.0
TRAINING = "training"


@dataclass(frozen=True, slots=True)
class Site:
    id: str
    name: str
    place: str
    lat: float
    lon: float
    price: float
    carbon: float


@dataclass(frozen=True, slots=True)
class City:
    id: str
    name: str
    lat: float
    lon: float


@dataclass(frozen=True, slots=True)
class Build:
    block: float
    cost: float
    blocks: int


@dataclass(frozen=True, slots=True)
class Level:
    id: str
    capacity: dict[str, float]
    demand: dict[str, float]
    latency: float
    training: float = 0.0
    carbon_cap: float | None = None
    outage: str | None = None
    start: dict[tuple[str, str], float] | None = None
    key: tuple[str, str] | None = None
    build: Build | None = None


SITES: dict[str, Site] = {
    s.id: s
    for s in [
        Site("ashburn", "Ashburn", "Virginia", 39.04, -77.49, 88, 0.34),
        Site("dalles", "The Dalles", "Oregon", 45.60, -121.18, 58, 0.12),
        Site("abilene", "Abilene", "Texas", 32.45, -99.73, 52, 0.37),
        Site("quebec", "Beauharnois", "Quebec", 45.31, -73.87, 48, 0.01),
        Site("keflavik", "Keflavík", "Iceland", 63.99, -22.62, 42, 0.01),
        Site("dublin", "Dublin", "Ireland", 53.35, -6.26, 155, 0.26),
        Site("frankfurt", "Frankfurt", "Germany", 50.11, 8.68, 165, 0.36),
        Site("madrid", "Madrid", "Spain", 40.42, -3.70, 95, 0.12),
        Site("warsaw", "Warsaw", "Poland", 52.23, 21.01, 120, 0.66),
        Site("lulea", "Luleå", "Sweden", 65.58, 22.15, 45, 0.025),
        Site("johor", "Johor", "Malaysia", 1.49, 103.74, 85, 0.55),
        Site("jurong", "Jurong", "Singapore", 1.33, 103.70, 145, 0.41),
        Site("navimumbai", "Navi Mumbai", "India", 19.03, 73.03, 90, 0.71),
        Site("inzai", "Inzai", "Japan", 35.83, 140.15, 150, 0.45),
        Site(
            "westsydney",
            "Western Sydney",
            "Australia",
            -33.80,
            150.85,
            120,
            0.62,
        ),
        Site("barueri", "Barueri", "Brazil", -23.51, -46.88, 85, 0.08),
    ]
}

CITIES: dict[str, City] = {
    c.id: c
    for c in [
        City("newyork", "New York", 40.71, -74.01),
        City("toronto", "Toronto", 43.65, -79.38),
        City("chicago", "Chicago", 41.88, -87.63),
        City("sanfrancisco", "San Francisco", 37.77, -122.42),
        City("london", "London", 51.51, -0.13),
        City("paris", "Paris", 48.86, 2.35),
        City("berlin", "Berlin", 52.52, 13.40),
        City("tokyo", "Tokyo", 35.68, 139.69),
        City("seoul", "Seoul", 37.57, 126.98),
        City("singapore", "Singapore", 1.29, 103.85),
        City("jakarta", "Jakarta", -6.21, 106.85),
        City("mumbai", "Mumbai", 19.08, 72.88),
        City("delhi", "Delhi", 28.61, 77.21),
        City("sydney", "Sydney", -33.87, 151.21),
        City("saopaulo", "São Paulo", -23.55, -46.63),
        City("lagos", "Lagos", 6.52, 3.38),
    ]
}

LEVELS: dict[str, Level] = {
    lv.id: lv
    for lv in [
        Level(
            "atlantic",
            capacity={"ashburn": 60, "keflavik": 60},
            demand={"newyork": 50, "toronto": 30, "london": 40},
            latency=80,
            key=("london", "keflavik"),
        ),
        Level(
            "asia",
            capacity={"johor": 60, "navimumbai": 30, "inzai": 50},
            demand={"singapore": 30, "jakarta": 50, "tokyo": 20, "seoul": 20},
            latency=60,
            key=("singapore", "navimumbai"),
        ),
        Level(
            "training",
            capacity={
                "ashburn": 80,
                "abilene": 60,
                "dalles": 40,
                "keflavik": 60,
            },
            demand={"newyork": 60, "chicago": 40, "sanfrancisco": 40},
            latency=45,
            key=(TRAINING, "keflavik"),
            training=100,
        ),
        Level(
            "carbon",
            capacity={
                "lulea": 40,
                "dublin": 60,
                "frankfurt": 70,
                "madrid": 50,
                "warsaw": 60,
            },
            demand={"london": 50, "paris": 40, "berlin": 50},
            latency=40,
            carbon_cap=30,
        ),
        Level(
            "outage",
            capacity={"ashburn": 80, "quebec": 100, "abilene": 50},
            demand={"newyork": 70, "toronto": 30, "chicago": 30},
            latency=30,
            key=("chicago", "abilene"),
            outage="ashburn",
            start={
                ("newyork", "ashburn"): 70,
                ("toronto", "quebec"): 30,
                ("chicago", "quebec"): 30,
            },
        ),
        Level(
            "build",
            capacity={
                "ashburn": 60,
                "dalles": 30,
                "abilene": 40,
                "keflavik": 30,
                "dublin": 30,
                "frankfurt": 30,
                "johor": 40,
                "inzai": 30,
                "navimumbai": 30,
                "barueri": 20,
                "westsydney": 20,
            },
            demand={
                "newyork": 80,
                "sanfrancisco": 50,
                "london": 60,
                "berlin": 40,
                "lagos": 20,
                "tokyo": 60,
                "singapore": 40,
                "mumbai": 50,
                "sydney": 20,
                "saopaulo": 30,
            },
            latency=80,
            build=Build(block=25, cost=900, blocks=4),
        ),
    ]
}


def distance_km(a: Site | City, b: Site | City) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (a.lat, a.lon, b.lat, b.lon))

    h = (
        sin((lat2 - lat1) / 2) ** 2
        + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


@cache
def rtt_ms(city: str, site: str) -> float:
    km = distance_km(CITIES[city], SITES[site])

    return round(SWITCHING_MS + 2 * km * PATH_STRETCH / FIBER_KM_PER_MS)
