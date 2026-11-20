from __future__ import annotations

import json
from pathlib import Path
from typing import Any

WIDTH = 80
STEP = 2


def _scalar(value: Any) -> bool:
    return not isinstance(value, dict | list)


def _fill(items: list[str], pad: str) -> list[str]:
    lines: list[str] = []
    line = ""
    for i, item in enumerate(items):
        piece = item + ("," if i < len(items) - 1 else "")
        candidate = f"{line} {piece}" if line else piece
        if line and len(pad) + len(candidate) > WIDTH:
            lines.append(pad + line)
            line = piece
        else:
            line = candidate
    if line:
        lines.append(pad + line)
    return lines


def _object(value: dict[str, Any], depth: int) -> str:
    if not value:
        return "{}"
    inner = " " * (STEP * (depth + 1))
    parts = []
    for key, item in value.items():
        head = f"{inner}{json.dumps(key, ensure_ascii=False)}: "
        parts.append(head + _format(item, depth + 1, len(head)))
    return "{\n" + ",\n".join(parts) + "\n" + " " * (STEP * depth) + "}"


def _array(value: list[Any], depth: int, used: int) -> str:
    if not value:
        return "[]"
    pad = " " * (STEP * depth)
    inner = " " * (STEP * (depth + 1))
    if all(_scalar(v) for v in value):
        items = [json.dumps(v, ensure_ascii=False) for v in value]
        flat = "[" + ", ".join(items) + "]"
        if used + len(flat) <= WIDTH:
            return flat
        return "[\n" + "\n".join(_fill(items, inner)) + f"\n{pad}]"
    parts = [inner + _format(v, depth + 1, len(inner)) for v in value]
    return "[\n" + ",\n".join(parts) + f"\n{pad}]"


def _format(value: Any, depth: int, used: int) -> str:
    if isinstance(value, dict):
        return _object(value, depth)
    if isinstance(value, list):
        return _array(value, depth, used)
    return json.dumps(value, ensure_ascii=False)


def dumps(value: Any) -> str:
    return _format(value, 0, 0) + "\n"


def format_file(path: Path) -> bool:
    before = path.read_text()
    data = json.loads(before)
    after = dumps(data)
    if json.loads(after) != data:
        raise ValueError(f"{path}: formatting changed the data")
    if after == before:
        return False
    path.write_text(after)
    return True


def format_tree(root: Path) -> list[Path]:
    return [p for p in sorted(root.rglob("*.json")) if format_file(p)]
