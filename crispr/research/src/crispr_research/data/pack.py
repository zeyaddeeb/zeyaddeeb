import csv
import hashlib
import shutil
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import duckdb

from ..config import DATA

RELEASE = "DepMap Public 24Q4"
LICENCE = "CC BY 4.0"
CITATION = (
    "DepMap, Broad Institute. DepMap 24Q4 Public. figshare+ 2024, "
    "doi:10.25452/figshare.plus.27993248.v1"
)
DOWNLOAD = "https://ndownloader.figshare.com/files/"
CHUNK = 1 << 20
TIMEOUT = 60
MEMORY = "512MB"


@dataclass(frozen=True, slots=True)
class Source:
    name: str
    file_id: int
    md5: str


SOURCES = (
    Source("Model.csv", 51065297, "675210d17675f3517b0ce39a3c274f16"),
    Source(
        "CRISPRGeneEffect.csv",
        51064667,
        "6edf7ade09b9b34199210b559d4745d3",
    ),
    Source(
        "CRISPRInferredCommonEssentials.csv",
        51064916,
        "545edef0d377f252db6e5e675201bd77",
    ),
    Source(
        "AchillesNonessentialControls.csv",
        51063566,
        "ca6a757db1cae49b913423ce73b818cf",
    ),
)

DEPMAP = DATA / "depmap"


def digest(path: Path) -> str:
    found = hashlib.md5()

    with path.open("rb") as handle:
        while block := handle.read(CHUNK):
            found.update(block)

    return found.hexdigest()


def fetch(source: Source) -> Path:
    DEPMAP.mkdir(parents=True, exist_ok=True)
    target = DEPMAP / source.name

    if target.exists() and digest(target) == source.md5:
        return target

    partial = target.with_name(f"{target.name}.part")

    with (
        urllib.request.urlopen(
            f"{DOWNLOAD}{source.file_id}", timeout=TIMEOUT
        ) as answer,
        partial.open("wb") as written,
    ):
        shutil.copyfileobj(answer, written, CHUNK)

    if digest(partial) != source.md5:
        partial.unlink(missing_ok=True)

        raise RuntimeError(
            f"{source.name} does not match its recorded md5; refusing it"
        )

    partial.replace(target)

    return target


def prepare() -> dict[str, object]:
    if PACK.exists():
        return {"pack": str(PACK), "built": False}

    for source in SOURCES:
        fetch(source)

    report: dict[str, object] = {"pack": str(PACK), "built": True}
    report.update(build())
    shutil.rmtree(DEPMAP, ignore_errors=True)

    return report


PACK = DATA / "pack.duckdb"
CRC = "Colorectal Adenocarcinoma"
PERITONEAL = ("ascites", "abdomen")
PRIMARY = ("large_intestine", "Colon")


def _sql_path(path: Path) -> str:
    return str(path).replace("'", "''")


def build() -> dict[str, int]:
    partial = PACK.with_name(f"{PACK.name}.part")
    partial.unlink(missing_ok=True)
    spill = DATA / "spill"
    lengthwise = DEPMAP / "effect-long.csv"
    db = duckdb.connect(str(partial))
    completed = False
    try:
        db.execute(f"set memory_limit = '{MEMORY}'")
        db.execute(f"set temp_directory = '{_sql_path(spill)}'")
        model = _sql_path(DEPMAP / "Model.csv")
        effect = DEPMAP / "CRISPRGeneEffect.csv"
        essentials = _sql_path(DEPMAP / "CRISPRInferredCommonEssentials.csv")
        controls = _sql_path(DEPMAP / "AchillesNonessentialControls.csv")

        db.execute(
            f"""
            create table line as
            select ModelID as model,
                   StrippedCellLineName as name,
                   PatientID as patient,
                   SampleCollectionSite as site,
                   GrowthPattern as growth,
                   PrimaryOrMetastasis as stage,
                   case
                     when SampleCollectionSite in {PERITONEAL}
                          then 'peritoneal'
                     when SampleCollectionSite in {PRIMARY}
                          and PrimaryOrMetastasis = 'Primary' then 'primary'
                     else 'other'
                   end as panel
            from read_csv('{model}', all_varchar=true)
            where OncotreePrimaryDisease = '{CRC}'
            """
        )
        screened = {
            row[0] for row in db.execute("select model from line").fetchall()
        }
        lengthen(effect, screened, lengthwise)
        db.execute(
            f"""
            create table effect as
            select model, gene, score
            from read_csv(
                '{_sql_path(lengthwise)}',
                header = true,
                columns = {{
                    'model': 'VARCHAR',
                    'gene': 'VARCHAR',
                    'score': 'DOUBLE'
                }}
            )
            """
        )

        db.execute(
            f"""
            create table essential as
            select distinct trim(split_part(Essentials, '(', 1)) as gene
            from read_csv('{essentials}', all_varchar=true)
            """
        )
        db.execute(
            f"""
            create table nonessential as
            select distinct trim(split_part(Gene, '(', 1)) as gene
            from read_csv('{controls}', all_varchar=true)
            """
        )

        counts = {}
        for name in ("line", "effect", "essential", "nonessential"):
            row = db.execute(f"select count(*) from {name}").fetchone()
            counts[name] = _count(row)
        for name, column in (("genes", "gene"), ("scored_lines", "model")):
            row = db.execute(
                f"select count(distinct {column}) from effect"
            ).fetchone()
            counts[name] = _count(row)
        db.close()
        partial.replace(PACK)
        completed = True
    finally:
        if not completed:
            db.close()
            partial.unlink(missing_ok=True)
        lengthwise.unlink(missing_ok=True)
        shutil.rmtree(spill, ignore_errors=True)

    return counts


def lengthen(wide: Path, models: set[str], target: Path) -> None:
    with (
        wide.open(newline="") as source,
        target.open("w", newline="") as written,
    ):
        rows = csv.reader(source)
        genes = [name.split("(", 1)[0].strip() for name in next(rows)[1:]]
        out = csv.writer(written)
        out.writerow(("model", "gene", "score"))

        for row in rows:
            if row[0] not in models:
                continue

            out.writerows(
                (row[0], gene, score)
                for gene, score in zip(genes, row[1:], strict=True)
                if score
            )


def _count(row: tuple | None) -> int:
    if row is None:
        raise RuntimeError("a count returned no row")

    return int(row[0])
