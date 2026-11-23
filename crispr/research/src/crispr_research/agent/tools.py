from ..cards import BUILT, OPS
from ..kernels import kill, later, matter, reach
from . import fronts

MATTER_UNITS = {
    "klass": "the drug class, for example checkpoint or egfr_antibody",
    "split": "which two groups to compare: abdominal or msi",
}

LATER_UNITS = {
    "trial": "the registry number of a trial that has not reported yet",
}

KILL_UNITS = {
    "gene": "the gene symbol, for example KRAS",
    "stratum": f"which lines to look at: {', '.join(kill.STRATA)}",
}

PROBE_UNITS = {
    "diffusivity": (
        "diffusivity in tumour tissue in m2/s, for example 2.5e-10 for "
        "cisplatin and 0.77e-10 for paclitaxel; heavier molecules are slower"
    ),
    "ic50": (
        "the concentration that half kills, in mol/m3, for example 6.2e-3 "
        "for cisplatin and 1.4e-6 for paclitaxel"
    ),
    "concentration": (
        "what the cavity is held at, in mol/m3, for example 0.8 for "
        "cisplatin at 120 mg/m2"
    ),
    "dwell": "how long the bath stays in, in seconds, for example 1800",
    "radius": "the nodule's radius in metres, for example 0.002 for 2 mm",
}

KERNEL_PROBES: dict[str, tuple[str, ...]] = {
    "reach": reach.PROBE,
    "kill": kill.PROBE,
    "later": later.PROBE,
    "matter": matter.PROBE,
}

KERNEL_FIELDS: dict[str, tuple[str, ...]] = {
    "reach": reach.FIELDS,
    "kill": kill.FIELDS,
    "later": later.SETTLING,
    "matter": matter.FIELDS,
}

FIELD_NOTES: dict[str, str] = {
    "reach": (
        "For reach: depth_mm is how far into the nodule the drug still "
        "kills, and core_mm is the radius it never reaches, so a bigger "
        "core_mm means a worse drug."
    ),
    "kill": (
        "For kill: median is the gene effect across the lines, where zero "
        "is no effect and minus one is as essential as the average common "
        "essential; share_essential is the fraction of lines at or below "
        "minus a half."
    ),
    "later": (
        "For later: has_results, completed or stopped, on a trial that has "
        "not reported, where one means it will."
    ),
    "matter": (
        "For matter: ratio is exposed over other median course length, and "
        "p is the two-sided Mann-Whitney p-value."
    ),
}

PLAN = {
    "type": "function",
    "function": {
        "name": "plan",
        "description": (
            "Say in one sentence what you are about to test and how it could "
            "fail. Call this once, first."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "aim": {"type": "string"},
                "could_fail": {"type": "string"},
            },
            "required": ["aim", "could_fail"],
        },
    },
}

CONCLUDE = {
    "type": "function",
    "function": {
        "name": "conclude",
        "description": (
            "End the episode: what you found and what to seal next."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "found": {"type": "string"},
                "next": {"type": "string"},
            },
            "required": ["found", "next"],
        },
    },
}


def _probe_properties(kernels: tuple[str, ...]) -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    if "reach" in kernels:
        found |= {
            name: {"type": "number", "description": note}
            for name, note in PROBE_UNITS.items()
        }
    if "kill" in kernels:
        found |= {
            name: {"type": "string", "description": note}
            for name, note in KILL_UNITS.items()
        }
    if "later" in kernels:
        found |= {
            name: {"type": "string", "description": note}
            for name, note in LATER_UNITS.items()
        }
    if "matter" in kernels:
        found |= {
            name: {"type": "string", "description": note}
            for name, note in MATTER_UNITS.items()
        }
    return found


def probe(kernels: tuple[str, ...] = BUILT) -> dict:
    probe_desc = "; ".join(
        f"{kernel} takes {', '.join(KERNEL_PROBES[kernel])}"
        for kernel in kernels
    )
    fields = [field for kernel in kernels for field in KERNEL_FIELDS[kernel]]
    field_notes = " ".join(FIELD_NOTES[kernel] for kernel in kernels)

    return {
        "type": "function",
        "function": {
            "name": "probe",
            "description": (
                "Seal a prediction and run a referee on one case. The "
                "prediction is sealed before the referee runs and the "
                "verdict is permanent. Predicting something certain earns "
                "nothing, so pick a case that could go either way."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "kernel": {"type": "string", "enum": list(kernels)},
                    "question": {
                        "type": "string",
                        "description": "the case, in one sentence",
                    },
                    "probe": {
                        "type": "object",
                        "description": f"the case. {probe_desc}",
                        "properties": _probe_properties(kernels),
                    },
                    "field": {
                        "type": "string",
                        "enum": fields,
                        "description": (
                            f"what you are predicting. {field_notes}"
                        ),
                    },
                    "op": {"type": "string", "enum": list(OPS)},
                    "value": {"type": "number"},
                    "chance": {
                        "type": "number",
                        "description": (
                            "your probability that it holds, between 0 and 1"
                        ),
                    },
                    "low": {
                        "type": "number",
                        "description": (
                            "the bottom of your 80% interval on the field"
                        ),
                    },
                    "high": {
                        "type": "number",
                        "description": (
                            "the top of your 80% interval on the field"
                        ),
                    },
                },
                "required": [
                    "kernel",
                    "question",
                    "probe",
                    "field",
                    "op",
                    "value",
                    "chance",
                    "low",
                    "high",
                ],
            },
        },
    }


def definitions(
    front: fronts.Front | None = None, *, evaluation: bool = False
) -> list[dict]:
    kernels = front.kernels if front is not None else BUILT
    probe_tool = probe(kernels)
    if evaluation:
        return [PLAN, probe_tool, CONCLUDE]

    properties = probe_tool["function"]["parameters"]["properties"]
    inspect_props: dict[str, object] = {
        "kernel": properties["kernel"],
        "probe": properties["probe"],
    }
    if "kill" in kernels:
        inspect_props["query"] = {
            "type": "string",
            "description": "Gene name filter",
        }
    inspect = {
        "type": "function",
        "function": {
            "name": "inspect",
            "description": "Inspect inputs, sources and available cases. "
            "An optional probe explores one case without earning a score.",
            "parameters": {
                "type": "object",
                "properties": inspect_props,
                "required": ["kernel"],
            },
        },
    }
    found = [PLAN, inspect]
    if "later" in kernels:
        found.append(
            {
                "type": "function",
                "function": {
                    "name": "search_trials",
                    "description": (
                        "Find active trial identifiers by condition."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {"condition": {"type": "string"}},
                        "required": ["condition"],
                    },
                },
            }
        )
    found.extend([probe_tool, CONCLUDE])
    return found


def only(name: str) -> list[dict]:
    return [
        found for found in definitions() if found["function"]["name"] == name
    ]
