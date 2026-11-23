import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass

log = logging.getLogger("crispr_research.later")

REGISTRY = "https://clinicaltrials.gov/api/v2/studies"
TIMEOUT = 20
RESULTS_GRACE_YEARS = 1.0
FIELDS = (
    "has_results",
    "completed",
    "stopped",
    "recruiting",
    "years_to_report",
    "known",
)
PROBE = ("trial",)
STATES = {
    "COMPLETED": "completed",
    "TERMINATED": "stopped",
    "WITHDRAWN": "stopped",
    "SUSPENDED": "suspended",
    "RECRUITING": "recruiting",
    "NOT_YET_RECRUITING": "recruiting",
    "ACTIVE_NOT_RECRUITING": "recruiting",
    "ENROLLING_BY_INVITATION": "recruiting",
}
ACTIVE_FILTERS = (
    "RECRUITING",
    "NOT_YET_RECRUITING",
    "ACTIVE_NOT_RECRUITING",
    "ENROLLING_BY_INVITATION",
)


@dataclass(frozen=True, slots=True)
class Reading:
    fields: dict[str, float]
    ungraded: str | None = None
    detail: str = ""
    status: str = ""
    date: str = ""


def fetch(nct: str) -> dict | None:
    url = f"{REGISTRY}/{urllib.parse.quote(nct)}?format=json"

    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as answer:
            return json.load(answer)
    except Exception as error:
        log.warning("registry fetch failed for %s: %s", nct, error)
        return None


def search(
    condition: str, most: int = 40, *, active_only: bool = True
) -> list[dict]:
    params: dict[str, object] = {
        "query.cond": condition,
        "pageSize": most,
        "format": "json",
        "fields": "NCTId,BriefTitle,OverallStatus,HasResults,"
        "PrimaryCompletionDate",
    }
    if active_only:
        params["filter.overallStatus"] = ",".join(ACTIVE_FILTERS)
    query = urllib.parse.urlencode(params)

    try:
        with urllib.request.urlopen(
            f"{REGISTRY}?{query}", timeout=TIMEOUT
        ) as answer:
            found = json.load(answer)
    except Exception as error:
        log.warning("registry search failed for %r: %s", condition, error)
        return []

    return found.get("studies", [])


def _when(study: dict) -> str:
    status = study.get("protocolSection", {}).get("statusModule", {})
    struct = (
        status.get("primaryCompletionDateStruct")
        or status.get("completionDateStruct")
        or {}
    )

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

    if not results and shape == "other":
        return Reading(
            {},
            f"{nct} has status {status or 'unknown'}, so its outcome cannot "
            "be tracked as an active or settled trial",
            detail=f"{nct}: {title[:70]} — {status}",
            status=status,
            date=when,
        )

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
        status=status,
        date=when,
    )


def probe(values: dict[str, object], today: str) -> Reading:
    return reading(str(values["trial"]).strip().upper(), today)


SETTLING = ("has_results", "completed", "stopped")


def open_bet(card_field: str, fields: dict[str, float]) -> bool:
    if card_field not in SETTLING:
        return False

    return fields.get("known", 0.0) == 0.0


def _results_settled(found: Reading) -> bool:
    if found.fields.get("has_results", 0.0) >= 1.0:
        return True
    if found.fields.get("known", 0.0) == 0.0:
        return False
    if found.status == "WITHDRAWN":
        return True
    return not (
        found.date
        and found.fields.get("years_to_report", -RESULTS_GRACE_YEARS)
        > -RESULTS_GRACE_YEARS
    )


def settled(card_field: str, found: Reading) -> bool:
    if found.ungraded or card_field not in SETTLING:
        return False
    if card_field == "has_results":
        return _results_settled(found)
    return found.fields.get("known", 0.0) != 0.0
