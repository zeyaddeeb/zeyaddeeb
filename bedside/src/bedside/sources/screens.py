import hashlib
from pathlib import Path

import httpx

from ..config import DATA, method
from .fetch import CHUNK, client, download, record

MANIFEST = DATA / "manifest.json"
SOURCES = ["depmap", "prism"]


def _md5(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)

    with path.open("rb") as f:
        while block := f.read(CHUNK):
            digest.update(block)

    return digest.hexdigest()


def _source(http: httpx.Client, name: str) -> list[Path]:
    settings = method()["data"][name]
    found = []

    for entry in settings["files"]:
        url = f"{settings['download']}{entry['id']}"
        dest = download(http, url, DATA / name / entry["name"])

        if _md5(dest) != entry["md5"]:
            dest.unlink()
            message = f"{entry['name']} does not match its published md5"
            raise ValueError(message)

        record(MANIFEST, f"{name}/{entry['name']}", url, dest)
        found.append(dest)

    return found


def fetch() -> list[Path]:
    with client() as http:
        return [p for name in SOURCES for p in _source(http, name)]
