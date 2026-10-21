"""Capability checks, cached briefly and keyed to the mounted data."""

import time
from functools import lru_cache

from .evidence import fingerprint
from .kernels import gate, kill, matter


@lru_cache(maxsize=4)
def _status(bucket: int, dependency: str, patients: str, cohort: str) -> dict:
    result = {
        "reach": {
            "available": True,
            "scores": gate.measured(),
            "reason": "Model only; measurement gate is separate.",
        }
    }
    for name, ready, check in (
        ("kill", dependency != "missing", gate.kill_gate),
        (
            "matter",
            patients != "missing" and cohort != "missing",
            gate.matter_gate,
        ),
        ("later", True, gate.later_gate),
    ):
        if not ready:
            result[name] = {
                "available": False,
                "scores": False,
                "reason": "Required data files are not mounted.",
            }
            continue
        try:
            checked = check()
            result[name] = {
                "available": bool(checked.get("ran")),
                "scores": bool(checked.get("passed")),
                "reason": checked.get("why", "Gate checked."),
            }
        except Exception as error:
            result[name] = {
                "available": False,
                "scores": False,
                "reason": f"Readiness check failed: {type(error).__name__}",
            }
    return result


def status() -> dict:
    return _status(
        int(time.monotonic() // 300),
        fingerprint(kill.PACK),
        fingerprint(matter.bedside()),
        fingerprint(matter.chord() / "data_clinical_patient.txt"),
    )
