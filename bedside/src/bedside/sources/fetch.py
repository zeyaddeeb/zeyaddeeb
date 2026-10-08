import hashlib
import json
import time
from collections.abc import Callable
from pathlib import Path

import httpx

CHUNK = 1 << 20
RETRYABLE = {429, 500, 502, 503, 504}


def retry[T](call: Callable[[], T], attempts: int = 8) -> T:
    for attempt in range(attempts):
        try:
            return call()
        except httpx.HTTPStatusError as error:
            if error.response.status_code not in RETRYABLE:
                raise

            if attempt == attempts - 1:
                raise
        except httpx.TransportError:
            if attempt == attempts - 1:
                raise

        time.sleep(min(60, 2**attempt))

    raise RuntimeError("unreachable")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as f:
        while block := f.read(CHUNK):
            digest.update(block)

    return digest.hexdigest()


def _stream(client: httpx.Client, url: str, part: Path) -> None:
    have = part.stat().st_size if part.exists() else 0
    headers = {"range": f"bytes={have}-"} if have else {}

    with client.stream("GET", url, headers=headers) as response:
        if response.status_code == 416:
            return

        response.raise_for_status()
        resumed = have and response.status_code == 206

        with part.open("ab" if resumed else "wb") as f:
            for block in response.iter_bytes(CHUNK):
                f.write(block)


def download(client: httpx.Client, url: str, dest: Path) -> Path:
    if dest.exists():
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    retry(lambda: _stream(client, url, part))
    part.rename(dest)

    return dest


def record(manifest: Path, name: str, url: str, path: Path) -> str:
    entries = json.loads(manifest.read_text()) if manifest.exists() else {}
    digest = sha256(path)

    entries[name] = {
        "url": url,
        "size": path.stat().st_size,
        "sha256": digest,
    }

    manifest.write_text(json.dumps(entries, indent=2, sort_keys=True))

    return digest


def client() -> httpx.Client:
    return httpx.Client(
        follow_redirects=True,
        timeout=httpx.Timeout(60.0, connect=20.0),
        headers={"user-agent": "audit/0.1 (research)"},
    )
