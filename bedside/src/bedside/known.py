import tomllib
from dataclasses import dataclass
from functools import cache

from .config import LABELS

CANCERS = [
    "Non-Small Cell Lung Cancer",
    "Colorectal Cancer",
    "Breast Cancer",
    "Prostate Cancer",
    "Pancreatic Cancer",
]
ANY = "any"
SIGNS = {"positive": "benefit", "negative": "harm"}


@dataclass(frozen=True, slots=True)
class Pair:
    cancer: str
    drug_class: str
    biomarker: str
    expected: str
    drugs: tuple[str, ...]


@cache
def labels() -> list[dict]:
    return tomllib.loads(LABELS.read_text())["label"]


def _applies(row: dict, cancer: str) -> bool:
    return row["cancer"] in (cancer, ANY)


def _carries(
    rows: list[dict], drug: str, cancer: str, biomarker: str, sign: str
) -> bool:
    return any(
        r["drug"] == drug
        and _applies(r, cancer)
        and biomarker in r.get(sign, [])
        for r in rows
    )


def _counts(
    rows: list[dict],
    row: dict,
    *,
    cancer: str,
    biomarker: str,
    sign: str,
    drugs: set[str],
) -> bool:
    partners = row.get("partners", [])

    if any(p not in drugs for p in partners):
        return False

    return not any(
        _carries(rows, p, cancer, biomarker, sign) for p in partners
    )


def direction(
    rows: list[dict],
    drug: str,
    *,
    cancer: str,
    biomarker: str,
    drugs: set[str],
) -> str | None:
    signs = {
        sign
        for r in rows
        if r["drug"] == drug and _applies(r, cancer)
        for sign in SIGNS
        if biomarker in r.get(sign, [])
        and _counts(
            rows,
            r,
            cancer=cancer,
            biomarker=biomarker,
            sign=sign,
            drugs=drugs,
        )
    }

    return SIGNS[signs.pop()] if len(signs) == 1 else None


def derive(rows: list[dict], classes: dict[str, list[str]]) -> list[Pair]:
    drugs = {d for members in classes.values() for d in members}
    markers = sorted({b for r in rows for s in SIGNS for b in r.get(s, [])})
    pairs = []

    for cancer in CANCERS:
        for name, members in classes.items():
            for biomarker in markers:
                pointing = {
                    d: v
                    for d in members
                    if (
                        v := direction(
                            rows,
                            d,
                            cancer=cancer,
                            biomarker=biomarker,
                            drugs=drugs,
                        )
                    )
                }

                if len(set(pointing.values())) == 1:
                    pairs.append(
                        Pair(
                            cancer=cancer,
                            drug_class=name,
                            biomarker=biomarker,
                            expected=next(iter(pointing.values())),
                            drugs=tuple(sorted(pointing)),
                        )
                    )

    return pairs
