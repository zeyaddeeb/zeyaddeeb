from dataclasses import dataclass
from math import exp, expm1, log, sqrt

from scipy.special import erfcx

STEADY = 3.0
MM = 1_000.0
TOLERANCE = 1e-12
STEPS = 200
FIELDS = (
    "lambda_mm",
    "depth_mm",
    "touched",
    "core_mm",
    "thiele",
    "damkohler",
    "ratio",
    "margin",
    "steady",
)
PROBE = ("weight", "diffusivity", "ic50", "concentration", "dwell", "radius")


@dataclass(frozen=True, slots=True)
class Agent:
    name: str
    weight: float
    diffusivity: float
    ic50: float


@dataclass(frozen=True, slots=True)
class Cavity:
    concentration: float
    dwell: float
    clearance: float


@dataclass(frozen=True, slots=True)
class Nodule:
    radius: float


def decay(agent: Agent, cavity: Cavity) -> float:
    return sqrt(agent.diffusivity / cavity.clearance)


def damkohler(cavity: Cavity) -> float:
    return cavity.clearance * cavity.dwell


def settled(cavity: Cavity) -> bool:
    return damkohler(cavity) >= STEADY


def share_sphere(nodule: Nodule, depth: float, length: float) -> float:
    if depth <= 0.0:
        return 1.0

    depth = min(nodule.radius, depth)

    inner = nodule.radius - depth

    if inner <= 0.0:
        return nodule.radius / length / _sinh_ratio(nodule.radius, length)

    far = -expm1(-2.0 * inner / length)
    whole = -expm1(-2.0 * nodule.radius / length)

    return (nodule.radius / inner) * exp(-depth / length) * (far / whole)


def _sinh_ratio(radius: float, length: float) -> float:
    reach = radius / length

    if reach > 350.0:
        return float("inf")

    return (exp(reach) - exp(-reach)) / 2.0


def share_slab(agent: Agent, cavity: Cavity, depth: float) -> float:
    if depth <= 0.0:
        return 1.0

    spread = 2.0 * sqrt(agent.diffusivity * cavity.dwell)
    front = depth / spread
    decayed = sqrt(damkohler(cavity))
    weight = exp(-(front * front + decayed * decayed))

    return 0.5 * weight * (erfcx(front - decayed) + erfcx(front + decayed))


def share(agent: Agent, cavity: Cavity, nodule: Nodule, depth: float) -> float:
    if settled(cavity):
        return share_sphere(nodule, depth, decay(agent, cavity))

    return share_slab(agent, cavity, depth)


def killing(agent: Agent, cavity: Cavity) -> float:
    return agent.ic50 / cavity.concentration


def penetration(agent: Agent, cavity: Cavity, nodule: Nodule) -> float:
    target = killing(agent, cavity)

    if target >= 1.0:
        return 0.0

    if share(agent, cavity, nodule, nodule.radius) >= target:
        return nodule.radius

    low, high = 0.0, nodule.radius

    for _ in range(STEPS):
        middle = 0.5 * (low + high)

        if share(agent, cavity, nodule, middle) >= target:
            low = middle
        else:
            high = middle

        if high - low < TOLERANCE * nodule.radius:
            break

    return 0.5 * (low + high)


def touched(nodule: Nodule, depth: float) -> float:
    if depth >= nodule.radius:
        return 1.0

    if depth <= 0.0:
        return 0.0

    inner = (nodule.radius - depth) / nodule.radius

    return 1.0 - inner * inner * inner


def probe(values: dict[str, float], clearance: float) -> dict[str, float]:
    agent = Agent(
        name="probe",
        weight=values["weight"],
        diffusivity=values["diffusivity"],
        ic50=values["ic50"],
    )
    cavity = Cavity(
        concentration=values["concentration"],
        dwell=values["dwell"],
        clearance=clearance,
    )

    return reading(agent, cavity, Nodule(radius=values["radius"]))


def reading(agent: Agent, cavity: Cavity, nodule: Nodule) -> dict[str, float]:
    length = decay(agent, cavity)
    depth = penetration(agent, cavity, nodule)
    ratio = cavity.concentration / agent.ic50

    return {
        "lambda_mm": length * MM,
        "depth_mm": depth * MM,
        "touched": touched(nodule, depth),
        "core_mm": max(0.0, nodule.radius - depth) * MM,
        "thiele": nodule.radius / length,
        "damkohler": damkohler(cavity),
        "ratio": ratio,
        "margin": log(ratio) if ratio > 0.0 else 0.0,
        "steady": float(settled(cavity)),
    }
