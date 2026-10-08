import json
from pathlib import Path

import httpx

from ..config import CHORD, DATA, method
from .fetch import client, download, record, retry

MANIFEST = DATA / "manifest.json"


def _post(http: httpx.Client, url: str, body: dict, dest: Path) -> Path:
    if dest.exists():
        return dest

    def fetch() -> httpx.Response:
        response = http.post(url, json=body, timeout=600)
        response.raise_for_status()

        return response

    dest.write_bytes(retry(fetch).content)

    return dest


def _panels(http: httpx.Client, api: str, names: list[str]) -> Path:
    dest = CHORD / "panels.json"

    if dest.exists():
        return dest

    found = {}

    for name in names:
        response = retry(lambda n=name: http.get(f"{api}/gene-panels/{n}"))
        response.raise_for_status()
        found[name] = [g["hugoGeneSymbol"] for g in response.json()["genes"]]

    dest.write_text(json.dumps(found))

    return dest


def fetch() -> list[Path]:
    settings = method()["data"]["chord"]
    api = settings["api"]
    CHORD.mkdir(parents=True, exist_ok=True)
    found = []

    with client() as http:
        for name in settings["files"]:
            url = f"{settings['media']}/{name}"
            found.append(download(http, url, CHORD / name))
            record(MANIFEST, name, url, found[-1])

        study = settings["study"]
        found.append(
            _post(
                http,
                f"{api}/molecular-profiles/{study}_mutations/mutations/fetch"
                "?projection=DETAILED",
                {"sampleListId": f"{study}_all"},
                CHORD / "mutations.json",
            )
        )
        found.append(
            _post(
                http,
                f"{api}/structural-variant/fetch",
                {"molecularProfileIds": [f"{study}_structural_variants"]},
                CHORD / "structural.json",
            )
        )
        found.append(_panels(http, api, settings["panels"]))

        for path in found[-3:]:
            record(MANIFEST, path.name, api, path)

    return found
