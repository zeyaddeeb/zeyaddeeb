import hashlib
import http.client
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

LAMBDA = "https://lambda.gsfc.nasa.gov/data/cobe"
EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2"
CHUNK = 1 << 20


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    size: int
    sha256: str
    offset: int = 0


SOURCES = [
    Source(
        "FIRAS_TEMPERATURE_MAP_LOWF.FITS",
        f"{LAMBDA}/firas/cmbr_temp_map/FIRAS_TEMPERATURE_MAP_LOWF.FITS",
        181440,
        "a49ec2af81d0890be9ad6781488bc9a27bd78b37c3be28c86c7eddb474ac2f6c",
    ),
    Source(
        "FIRAS_DESTRIPED_SKY_SPECTRA_LOWF.FITS",
        f"{LAMBDA}/firas/destriped_spectra/FIRAS_DESTRIPED_SKY_SPECTRA_LOWF.FITS",
        4538880,
        "42747c37c11451aee67cca1debe009a74337ac2b225874886bbe3a255c0fa304",
    ),
    Source(
        "FIRAS_DUST_SPECTRUM_MAP_LOWF.FITS",
        f"{LAMBDA}/firas/dust_map/FIRAS_DUST_SPECTRUM_MAP_LOWF.FITS",
        4527360,
        "ffa8cc7eceda3b5e8e823e80c8e4b6616eb8c956700a7252cf89d8238cd41726",
    ),
    Source(
        "firas_monopole_spec_v1.txt",
        f"{LAMBDA}/firas/monopole_spec/firas_monopole_spec_v1.txt",
        2388,
        "df793c3dca09ebfa7dbc5aa0ec1951daa8884431bc30eff28a710d7516cf50fa",
    ),
    Source(
        "DIRBE_SKYMAP_INFO.FITS",
        f"{LAMBDA}/dirbe/ancil/skyinfo/DIRBE_SKYMAP_INFO.FITS",
        12620160,
        "391a2f839e67c8b074c1666eeb29928c7dcfcaab5b12a10be1dedae75bb67cc4",
    ),
    Source(
        "DIRBE_BAND08_ZSMA.FITS",
        f"{LAMBDA}/dirbe/zsma/DIRBE_BAND08_ZSMA.FITS",
        6701760,
        "907a62a76f1347141affd2124af27c071ead27a0629689b578a3d0a1c1943eaa",
    ),
    Source(
        "ne_110m_coastline.geojson",
        f"{EARTH}/geojson/ne_110m_coastline.geojson",
        139907,
        "851f581ff5ffb844deed8ae1a9ce22e3c4bb3d74fa342cadb5d8e39b41ae7c3c",
    ),
]

TIME_ORDERED = [
    Source(
        "fdq_eng.h5",
        f"{LAMBDA}/firas/firas_tod/fdq_eng.h5",
        603210400,
        "d7cf2762763c1b1299ea1244a56d77ad90957867996b74caf91c1f7ba477bc22",
    ),
    Source(
        "fdq_sdf_ll.bin",
        f"{LAMBDA}/firas/firas_tod/fdq_sdf.h5",
        907662336,
        "5dc1cf7072b794c4787cc6ee11ce43474d272aed54633aed37f27c5562697ed2",
        offset=4272,
    ),
]


def _context() -> ssl.SSLContext:
    return ssl.create_default_context()


def _part(source: Source, part: Path, lo: int, hi: int) -> None:
    for _ in range(50):
        have = part.stat().st_size if part.exists() else 0
        if lo + have > hi:
            return
        start = source.offset + lo + have
        req = urllib.request.Request(
            source.url,
            headers={"Range": f"bytes={start}-{source.offset + hi}"},
        )
        try:
            with (
                urllib.request.urlopen(
                    req, context=_context(), timeout=120
                ) as r,
                part.open("ab") as f,
            ):
                if r.status != 206:
                    raise OSError(f"{source.url} ignored the byte range")
                while block := r.read(CHUNK):
                    f.write(block)
        except OSError, http.client.HTTPException:
            continue
    raise OSError(f"could not download {source.name}")


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(CHUNK):
            h.update(block)
    return h.hexdigest()


def download(source: Source, into: Path, parts: int = 8) -> Path:
    into.mkdir(parents=True, exist_ok=True)
    target = into / source.name
    if target.exists() and target.stat().st_size == source.size:
        return target

    work = into / f".{source.name}.parts"
    work.mkdir(exist_ok=True)
    step = -(-source.size // parts)
    spans = [
        (i, i * step, min(source.size, (i + 1) * step) - 1)
        for i in range(parts)
        if i * step < source.size
    ]
    with ThreadPoolExecutor(len(spans)) as pool:
        for job in [
            pool.submit(_part, source, work / str(i), lo, hi)
            for i, lo, hi in spans
        ]:
            job.result()

    with target.open("wb") as out:
        for i, _, _ in spans:
            out.write((work / str(i)).read_bytes())
    for i, _, _ in spans:
        (work / str(i)).unlink()
    work.rmdir()

    if target.stat().st_size != source.size:
        target.unlink()
        raise OSError(f"{source.name} has the wrong size")
    return target


def verify(source: Source, into: Path) -> None:
    if not source.sha256:
        return
    got = _digest(into / source.name)
    if got != source.sha256:
        raise OSError(f"{source.name} checksum mismatch: {got}")


def fetch(into: Path, time_ordered: bool) -> None:
    wanted = SOURCES + (TIME_ORDERED if time_ordered else [])
    for source in wanted:
        download(source, into, parts=8 if source.size > CHUNK else 1)
        verify(source, into)
