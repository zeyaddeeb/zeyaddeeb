import json
import sys

from .config import method_sha256
from .kernels import gate

USAGE = "usage: crispr-research gate"


def main() -> int:
    argv = sys.argv[1:]

    if not argv or argv[0] != "gate":
        print(USAGE, file=sys.stderr)

        return 2

    report = gate.run() | {"method": method_sha256()[:12]}
    print(json.dumps(report, indent=2))

    if not (report["replicated"] and report["limits_held"]):
        return 1

    return 0
