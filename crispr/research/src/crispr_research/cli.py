import http.client
import json
import sys

import duckdb

from .config import method_sha256
from .data import pack
from .kernels import gate

USAGE = "usage: crispr-research gate | pack [--optional]"


def main() -> int:
    match sys.argv[1:]:
        case ["gate"]:
            return _gate()
        case ["pack"]:
            return _pack(optional=False)
        case ["pack", "--optional"]:
            return _pack(optional=True)
        case _:
            print(USAGE, file=sys.stderr)

            return 2


def _gate() -> int:
    report = gate.run() | {"method": method_sha256()[:12]}
    print(json.dumps(report, indent=2))

    if not (report["replicated"] and report["limits_held"]):
        return 1

    return 0


def _pack(*, optional: bool) -> int:
    try:
        report = pack.prepare()
    except (
        OSError,
        RuntimeError,
        http.client.HTTPException,
        duckdb.Error,
    ) as error:
        why = f"{type(error).__name__}: {error}"
        print(json.dumps({"pack": "unavailable", "why": why}), file=sys.stderr)

        return 0 if optional else 1

    print(json.dumps(report, indent=2))

    return 0
