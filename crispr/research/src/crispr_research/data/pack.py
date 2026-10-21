import hashlib
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
        "AchillesCommonEssentialControls.csv",
        51063560,
        "9cc07e7ebc282984d8107341dfde8f26",
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

    if target.exists() and (not source.md5 or digest(target) == source.md5):
        return target

    urllib.request.urlretrieve(f"{DOWNLOAD}{source.file_id}", target)

    if source.md5 and digest(target) != source.md5:
        raise RuntimeError(
            f"{source.name} does not match its recorded md5; refusing it"
        )

    return target


def fetch_all() -> dict[str, str]:
    found = {}

    for source in SOURCES:
        try:
            path = fetch(source)
        except Exception as error:
            found[source.name] = f"failed: {error}"
            continue

        found[source.name] = digest(path)

    return found


PACK = DATA / "pack.duckdb"
CRC = "Colorectal Adenocarcinoma"
PERITONEAL = ("ascites", "abdomen")
PRIMARY = ("large_intestine", "Colon")


def build() -> dict[str, int]:
    PACK.unlink(missing_ok=True)
    db = duckdb.connect(str(PACK))
    model = str(DEPMAP / "Model.csv")
    effect = str(DEPMAP / "CRISPRGeneEffect.csv")
    essentials = str(DEPMAP / "CRISPRInferredCommonEssentials.csv")
    controls = str(DEPMAP / "AchillesNonessentialControls.csv")

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
                 when SampleCollectionSite in {PERITONEAL} then 'peritoneal'
                 when SampleCollectionSite in {PRIMARY}
                      and PrimaryOrMetastasis = 'Primary' then 'primary'
                 else 'other'
               end as panel
        from read_csv('{model}', all_varchar=true)
        where OncotreePrimaryDisease = '{CRC}'
        """
    )
    first = db.execute(
        f"select * from read_csv('{effect}', header=true) limit 0"
    ).description[0][0]
    db.execute(
        f"""
        create table effect as
        select "{first}" as model,
               trim(split_part(gene, '(', 1)) as gene,
               score
        from (
            unpivot (
                select * from read_csv('{effect}', header=true)
                where "{first}" in (select model from line)
            )
            on columns(* exclude ("{first}"))
            into name gene value score
        )
        where score is not null
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
        assert row is not None
        counts[name] = row[0]
    for name, column in (("genes", "gene"), ("scored_lines", "model")):
        row = db.execute(
            f"select count(distinct {column}) from effect"
        ).fetchone()
        assert row is not None
        counts[name] = row[0]
    db.close()

    return counts
