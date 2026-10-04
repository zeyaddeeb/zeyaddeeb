import importlib.util
import site
import sys
from pathlib import Path

if importlib.util.find_spec("rerun") is None:
    for root in site.getsitepackages():
        sdk = Path(root) / "rerun_sdk"
        if sdk.is_dir():
            sys.path.append(str(sdk))
