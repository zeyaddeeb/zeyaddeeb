from ..cards import BUILT, OPS
from ..kernels import kill, later, matter, reach

MATTER_UNITS = {
    "klass": "the drug class, for example checkpoint or egfr_antibody",
    "split": "which two groups to compare: abdominal or msi",
}

LATER_UNITS = {
    "trial": "the registry number, for example NCT07411599",
    "field": "which fact about it you are predicting",
}

KILL_UNITS = {
    "gene": "the gene symbol, for example KRAS",
    "stratum": f"which lines to look at: {', '.join(kill.STRATA)}",
}

PROBE_UNITS = {
    "weight": "molecular weight in g/mol, for example 300 for cisplatin",
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


def probe() -> dict:
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
                    "kernel": {"type": "string", "enum": list(BUILT)},
                    "question": {
                        "type": "string",
                        "description": "the case, in one sentence",
                    },
                    "probe": {
                        "type": "object",
                        "description": (
                            "the case. reach takes "
                            + ", ".join(reach.PROBE)
                            + "; kill takes "
                            + ", ".join(kill.PROBE)
                            + "; later takes "
                            + ", ".join(later.PROBE)
                            + "; matter takes "
                            + ", ".join(matter.PROBE)
                        ),
                        "properties": {
                            name: {"type": "number", "description": note}
                            for name, note in PROBE_UNITS.items()
                        }
                        | {
                            name: {"type": "string", "description": note}
                            for name, note in (
                                KILL_UNITS | LATER_UNITS | MATTER_UNITS
                            ).items()
                        },
                    },
                    "field": {
                        "type": "string",
                        "enum": list(reach.FIELDS)
                        + list(kill.FIELDS)
                        + list(later.FIELDS)
                        + list(matter.FIELDS),
                        "description": (
                            "what you are predicting. For reach: depth_mm "
                            "is how far the drug gets, core_mm how much of "
                            "the nodule it never reaches. For kill: median "
                            "is the gene effect across the lines, where zero "
                            "is no effect and minus one is as essential as "
                            "the average common essential, share_essential "
                            "the fraction of lines at or below minus a half"
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


def definitions() -> list[dict]:
    properties = probe()["function"]["parameters"]["properties"]
    inspect = {
        "type": "function",
        "function": {
            "name": "inspect",
            "description": "Inspect inputs, sources and available cases. "
            "An optional probe explores one case without earning a score.",
            "parameters": {
                "type": "object",
                "properties": {
                    "kernel": properties["kernel"],
                    "probe": properties["probe"],
                    "query": {
                        "type": "string",
                        "description": "Gene name filter",
                    },
                },
                "required": ["kernel"],
            },
        },
    }
    search = {
        "type": "function",
        "function": {
            "name": "search_trials",
            "description": "Find trial identifiers and records by condition.",
            "parameters": {
                "type": "object",
                "properties": {"condition": {"type": "string"}},
                "required": ["condition"],
            },
        },
    }
    return [PLAN, inspect, search, probe(), CONCLUDE]


def only(name: str) -> list[dict]:
    return [
        found for found in definitions() if found["function"]["name"] == name
    ]
