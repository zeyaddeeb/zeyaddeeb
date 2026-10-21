import tomllib
from dataclasses import dataclass

from ..config import DEPTHS, method
from . import kill, later, matter, reach


def tables(section: dict) -> dict[str, dict]:
    return {
        name: body for name, body in section.items() if isinstance(body, dict)
    }


@dataclass(frozen=True, slots=True)
class Row:
    name: str
    observed: float
    low: float
    high: float

    @property
    def inside(self) -> bool:
        return self.low <= self.observed <= self.high


@dataclass(frozen=True, slots=True)
class Check:
    name: str
    held: bool
    detail: str


def sink() -> float:
    return float(method()["reach"]["sink"]["total"])


def agents() -> dict[str, reach.Agent]:
    found = {}

    for name, body in tables(method()["reach"]["agents"]).items():
        found[name] = reach.Agent(
            name=name,
            weight=float(body["weight"]),
            diffusivity=float(body["diffusivity"]),
            ic50=float(body["ic50"]),
        )

    return found


def replication() -> list[Row]:
    gate = method()["reach"]["gate"]
    bands = gate["replication"]
    nodule = reach.Nodule(radius=float(gate["radius"]))
    known = agents()
    rows = []

    for name, body in tables(bands).items():
        cavity = reach.Cavity(
            concentration=float(body["concentration"]),
            dwell=float(gate["dwell"]),
            clearance=sink(),
        )
        low, high = (float(x) for x in body["band"])
        rows.append(
            Row(
                name=name,
                observed=reach.reading(known[name], cavity, nodule)[
                    "depth_mm"
                ],
                low=low,
                high=high,
            )
        )

    return rows


def limits() -> list[Check]:
    gate = method()["reach"]["gate"]
    radius = float(gate["radius"])
    drug = agents()["cisplatin"]
    nodule = reach.Nodule(radius=radius)
    cavity = reach.Cavity(
        concentration=0.8, dwell=float(gate["dwell"]), clearance=sink()
    )
    length = reach.decay(drug, cavity)
    base = reach.penetration(drug, cavity, nodule)

    brief = reach.Cavity(concentration=0.8, dwell=1.0, clearance=sink())
    long = reach.Cavity(concentration=0.8, dwell=86_400.0, clearance=sink())
    near = reach.penetration(drug, long, nodule)

    small = reach.Nodule(radius=length / 50.0)
    quiet = reach.Cavity(concentration=0.8, dwell=1e7, clearance=1e-9)
    hurried = reach.Cavity(concentration=0.8, dwell=60.0, clearance=1e-9)

    quicker = reach.Agent(
        name="quicker",
        weight=drug.weight,
        diffusivity=drug.diffusivity * 4.0,
        ic50=drug.ic50,
    )
    swept = reach.Cavity(
        concentration=0.8,
        dwell=float(gate["dwell"]),
        clearance=sink() * 4.0,
    )

    return [
        Check(
            "the transient tends to the steady state",
            abs(near - base) / base < 0.01,
            f"{near * reach.MM:.4f} mm against {base * reach.MM:.4f} mm",
        ),
        Check(
            "a short dwell is not reported as steady",
            not reach.settled(brief) and reach.settled(cavity),
            f"damkohler {reach.damkohler(brief):.3g} then "
            f"{reach.damkohler(cavity):.3g}",
        ),
        Check(
            "a nodule smaller than lambda is treated throughout",
            reach.reading(drug, cavity, small)["touched"] > 0.99,
            f"touched {reach.reading(drug, cavity, small)['touched']:.4f}",
        ),
        Check(
            "a nodule larger than lambda keeps an untreated core",
            reach.reading(drug, cavity, nodule)["core_mm"] > 0.0,
            f"core {reach.reading(drug, cavity, nodule)['core_mm']:.3f} mm",
        ),
        Check(
            "depth scales as the square root of diffusivity",
            _close(
                reach.penetration(quicker, cavity, nodule) / base, 2.0, 0.02
            ),
            f"ratio {reach.penetration(quicker, cavity, nodule) / base:.4f}",
        ),
        Check(
            "depth scales as the inverse square root of the sink",
            _close(reach.penetration(drug, swept, nodule) / base, 0.5, 0.02),
            f"ratio {reach.penetration(drug, swept, nodule) / base:.4f}",
        ),
        Check(
            "no sink, given time, leaves the nodule fully exposed",
            reach.reading(drug, quiet, nodule)["touched"] > 0.99,
            f"touched {reach.reading(drug, quiet, nodule)['touched']:.4f}",
        ),
        Check(
            "with no sink a short dwell is limited by the front, not the core",
            reach.reading(drug, hurried, nodule)["touched"] < 0.2,
            f"touched {reach.reading(drug, hurried, nodule)['touched']:.4f}",
        ),
    ]


def _close(found: float, want: float, slack: float) -> bool:
    return abs(found - want) <= slack * want


def depths() -> list[dict]:
    if not DEPTHS.exists():
        return []

    return tomllib.loads(DEPTHS.read_text()).get("row", [])


def comparable() -> list[dict]:
    return [row for row in depths() if row.get("comparable")]


def measured() -> bool:
    return bool(comparable())


def scores(kernel: str) -> bool:
    if kernel == "reach":
        return measured()

    if kernel == "kill":
        return bool(kill_gate().get("passed"))

    if kernel == "later":
        return bool(later_gate().get("passed"))

    if kernel == "matter":
        return bool(matter_gate().get("passed"))

    return False


def run() -> dict:
    rows = replication()
    checks = limits()

    return {
        "replication": [
            {
                "agent": r.name,
                "depth_mm": round(r.observed, 4),
                "band": [r.low, r.high],
                "inside": r.inside,
            }
            for r in rows
        ],
        "limits": [
            {"check": c.name, "held": c.held, "detail": c.detail}
            for c in checks
        ],
        "replicated": all(r.inside for r in rows),
        "limits_held": all(c.held for c in checks),
        "measured": measured(),
        "depths": len(depths()),
        "comparable": len(comparable()),
        "scores": False,
    }


KILL_AUROC = 0.95
KILL_ESSENTIAL = -0.5
KILL_NOISE = 0.05


def kill_gate() -> dict:
    found = kill.db()

    if found is None:
        return {"ran": False, "why": "the dependency pack has not been built"}

    rows = found.execute(
        """
        with med as (select gene, median(score) as m from effect group by gene)
        select med.m,
               case when e.gene is not null then 1 else 0 end,
               case when x.gene is not null then 1 else 0 end
        from med
        left join essential e on e.gene = med.gene
        left join nonessential x on x.gene = med.gene
        """
    ).fetchall()
    essential = [r[0] for r in rows if r[1] == 1]
    control = [r[0] for r in rows if r[2] == 1]

    if not essential or not control:
        return {"ran": False, "why": "the control lists are missing"}

    auroc = _auroc(essential, control)
    middle = sorted(essential)[len(essential) // 2]
    noise = sum(1 for v in control if v <= KILL_ESSENTIAL) / len(control)
    held = (
        auroc >= KILL_AUROC
        and middle <= KILL_ESSENTIAL
        and noise <= KILL_NOISE
    )

    return {
        "ran": True,
        "essentials": len(essential),
        "controls": len(control),
        "auroc": round(auroc, 4),
        "median_essential": round(middle, 4),
        "control_noise": round(noise, 4),
        "passed": held,
    }


def _auroc(essential: list[float], control: list[float]) -> float:
    ranked = sorted(
        [(v, 1) for v in essential] + [(v, 0) for v in control],
        key=lambda pair: pair[0],
    )
    seen = 0
    better = 0

    for _, kind in ranked:
        if kind == 1:
            seen += 1
        else:
            better += seen

    return better / (len(essential) * len(control))


SETTLED = (
    ("NCT00002527", "completed"),
    ("NCT00364013", "completed"),
)
TODAY = "2026-10-21"


def later_gate() -> dict:
    checked = []

    for nct, expected in SETTLED:
        found = later.reading(nct, TODAY)

        if found.ungraded:
            return {"ran": False, "why": found.ungraded}

        checked.append(
            {
                "trial": nct,
                "expected": expected,
                "held": found.fields.get(expected, 0.0) == 1.0,
                "known": found.fields.get("known", 0.0) == 1.0,
            }
        )

    return {
        "ran": True,
        "checked": checked,
        "passed": all(one["held"] and one["known"] for one in checked),
    }


MATTER_KNOWN = ("checkpoint", "msi")
MATTER_CONTROL = ("antimetabolite", "msi")
MATTER_RATIO = 2.0
MATTER_P = 1e-3
MATTER_QUIET = 1.5


def matter_gate() -> dict:
    if not matter.ready():
        return {"ran": False, "why": "the patient data is not on this machine"}

    known = matter.reading(*MATTER_KNOWN)
    control = matter.reading(*MATTER_CONTROL)

    if known.ungraded or control.ungraded:
        return {"ran": False, "why": known.ungraded or control.ungraded}

    found = known.fields["ratio"] >= MATTER_RATIO
    found = found and known.fields["p"] <= MATTER_P
    quiet = control.fields["ratio"] < MATTER_QUIET

    return {
        "ran": True,
        "known": {
            "pair": " x ".join(MATTER_KNOWN),
            "ratio": round(known.fields["ratio"], 3),
            "p": known.fields["p"],
            "met": found,
        },
        "control": {
            "pair": " x ".join(MATTER_CONTROL),
            "ratio": round(control.fields["ratio"], 3),
            "quiet": quiet,
        },
        "passed": found and quiet,
    }
