import json
import urllib.parse
import urllib.request
from dataclasses import dataclass

REGISTRY = "https://clinicaltrials.gov/api/v2/studies"
TIMEOUT = 20
FIELDS = (
    "has_results",
    "completed",
    "stopped",
    "recruiting",
    "years_to_report",
    "known",
)
PROBE = ("trial", "field")
STATES = {
    "COMPLETED": "completed",
    "TERMINATED": "stopped",
    "WITHDRAWN": "stopped",
    "SUSPENDED": "stopped",
    "RECRUITING": "recruiting",
    "NOT_YET_RECRUITING": "recruiting",
    "ACTIVE_NOT_RECRUITING": "recruiting",
    "ENROLLING_BY_INVITATION": "recruiting",
}


@dataclass(frozen=True, slots=True)
class Reading:
    fields: dict[str, float]
    ungraded: str | None = None
    detail: str = ""


def fetch(nct: str) -> dict | None:
    url = f"{REGISTRY}/{urllib.parse.quote(nct)}?format=json"

    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as answer:
            return json.load(answer)
    except Exception:
        return None


def search(condition: str, most: int = 40) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "query.cond": condition,
            "pageSize": most,
            "format": "json",
            "fields": "NCTId,BriefTitle,OverallStatus,HasResults,"
            "PrimaryCompletionDate",
        }
    )

    try:
        with urllib.request.urlopen(
            f"{REGISTRY}?{query}", timeout=TIMEOUT
        ) as answer:
            found = json.load(answer)
    except Exception:
        return []

    return found.get("studies", [])


def _when(study: dict) -> str:
    status = study.get("protocolSection", {}).get("statusModule", {})
    struct = status.get("primaryCompletionDateStruct") or {}

    return struct.get("date", "")


def _years(date: str, today: str) -> float:
    if not date or len(date) < 4:
        return 0.0

    try:
        year = int(date[:4])
        month = int(date[5:7]) if len(date) >= 7 else 6
    except ValueError:
        return 0.0

    now_year = int(today[:4])
    now_month = int(today[5:7])

    return (year - now_year) + (month - now_month) / 12.0


def reading(nct: str, today: str) -> Reading:
    study = fetch(nct)

    if study is None:
        return Reading({}, f"the registry did not answer for {nct}")

    section = study.get("protocolSection") or {}
    status = (section.get("statusModule") or {}).get("overallStatus", "")
    title = (section.get("identificationModule") or {}).get("briefTitle", "")
    results = bool(study.get("hasResults"))
    shape = STATES.get(status, "other")
    when = _when(study)

    return Reading(
        fields={
            "has_results": float(results),
            "completed": float(shape == "completed"),
            "stopped": float(shape == "stopped"),
            "recruiting": float(shape == "recruiting"),
            "years_to_report": _years(when, today),
            "known": float(results or shape in ("completed", "stopped")),
        },
        detail=f"{nct}: {title[:70]} — {status}, primary completion {when}",
    )


def probe(values: dict[str, object], today: str) -> Reading:
    return reading(str(values["trial"]).strip().upper(), today)


SETTLING = ("has_results", "completed", "stopped")


def open_bet(card_field: str, fields: dict[str, float]) -> bool:
    if card_field not in SETTLING:
        return False

    return fields.get("known", 0.0) == 0.0
