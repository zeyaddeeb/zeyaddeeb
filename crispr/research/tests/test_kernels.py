import io
import json
from concurrent.futures import ThreadPoolExecutor

import duckdb
import pytest

from crispr_research.kernels import gate, kill, later, matter


def test_the_dependency_gate_separates_known_essentials_from_controls():
    if not kill.ready():
        pytest.skip("the dependency pack has not been built")

    found = gate.kill_gate()

    assert found["ran"]
    assert found["auroc"] >= 0.95
    assert found["median_essential"] <= -0.5
    assert found["control_noise"] <= 0.05
    assert found["passed"]


def test_a_ribosomal_gene_is_needed_and_a_control_gene_is_not():
    if not kill.ready():
        pytest.skip("the dependency pack has not been built")

    needed = kill.reading("RPL3", "all")
    spare = kill.reading("ABCG8", "all")

    assert needed.fields["median"] < -1.0
    assert needed.fields["share_essential"] > 0.9
    assert spare.fields["median"] > -0.2
    assert spare.fields["share_essential"] < 0.1


def test_the_peritoneal_stratum_is_refused_by_name():
    assert "peritoneal" not in kill.STRATA


def test_a_bet_on_a_trial_that_has_not_reported_is_left_open():
    found = later.reading("NCT07411599", "2026-10-21")

    if found.ungraded:
        pytest.skip("the registry did not answer")

    assert found.fields["known"] == 0.0
    assert later.open_bet("has_results", found.fields)
    assert not later.open_bet("recruiting", found.fields)


def test_a_settled_trial_can_be_graded():
    found = later.reading("NCT00002527", "2026-10-21")

    if found.ungraded:
        pytest.skip("the registry did not answer")

    assert found.fields["known"] == 1.0
    assert found.fields["completed"] == 1.0
    assert not later.open_bet("completed", found.fields)


def test_the_patient_gate_sees_a_known_effect_and_stays_quiet_otherwise():
    if not matter.ready():
        pytest.skip("the patient data is not on this machine")

    found = gate.matter_gate()

    assert found["ran"]
    assert found["known"]["ratio"] >= 2.0
    assert found["known"]["p"] <= 1e-3
    assert found["control"]["quiet"]
    assert found["passed"]


def test_a_thin_patient_comparison_is_refused_not_guessed():
    if not matter.ready():
        pytest.skip("the patient data is not on this machine")

    found = matter.reading("parp", "abdominal")

    assert found.ungraded is not None or found.fields["exposed_courses"] >= 15


def test_matter_only_compares_groups_it_is_allowed_to_name():
    assert matter.SPLITS == ("abdominal", "msi")


def _build_bedside(tmp_path):
    bed = tmp_path / "bedside.duckdb"
    cohort = tmp_path / "chord"
    cohort.mkdir()
    patients_file = cohort / "data_clinical_patient.txt"

    conn = duckdb.connect(str(bed))
    conn.execute(
        "create table sample (patient varchar, cancer varchar, msi varchar)"
    )
    conn.execute(
        "create table first_sample "
        "(patient varchar, cancer varchar, msi varchar, day integer)"
    )
    conn.execute(
        "create table course "
        "(patient varchar, class varchar, start integer, stop integer)"
    )
    conn.execute(
        "create table eligible "
        "(patient varchar, cancer varchar, class varchar, "
        "start integer, stop integer)"
    )

    lines = [
        "#a",
        "#b",
        "#c",
        "#d",
        "PATIENT_ID\tINTRA_ABDOMINAL\tSTAGE_HIGHEST_RECORDED",
    ]
    for idx in range(16):
        pid = f"E{idx}"
        conn.execute(
            "insert into first_sample values (?, ?, 'Instable', 100)",
            [pid, matter.CANCER],
        )
        conn.execute(
            "insert into sample values (?, ?, 'Instable'), (?, ?, 'Instable')",
            [pid, matter.CANCER, pid, matter.CANCER],
        )
        duration = 100 if idx < 8 else 200
        conn.execute(
            "insert into eligible values (?, ?, 'checkpoint', 110, ?)",
            [pid, matter.CANCER, 110 + duration],
        )
        conn.execute(
            "insert into course values (?, 'checkpoint', 10, 20), "
            "(?, 'checkpoint', 110, ?)",
            [pid, pid, 110 + duration],
        )
        lines.append(f"{pid}\tYes\tStage 4")

    for idx in range(16):
        pid = f"P{idx}"
        conn.execute(
            "insert into first_sample values (?, ?, 'Stable', 100)",
            [pid, matter.CANCER],
        )
        conn.execute(
            "insert into sample values (?, ?, 'Stable')",
            [pid, matter.CANCER],
        )
        duration = 10 if idx < 8 else 30
        conn.execute(
            "insert into eligible values (?, ?, 'checkpoint', 110, ?)",
            [pid, matter.CANCER, 110 + duration],
        )
        conn.execute(
            "insert into course values (?, 'checkpoint', 110, ?)",
            [pid, 110 + duration],
        )
        lines.append(f"{pid}\tNo\tStage 4")

    conn.close()
    patients_file.write_text("\n".join(lines) + "\n")
    return bed, cohort


def test_matter_uses_eligible_first_sample_and_true_median(
    tmp_path, monkeypatch
):
    bed, cohort = _build_bedside(tmp_path)
    monkeypatch.setenv("RESEARCH_BEDSIDE", str(bed))
    monkeypatch.setenv("RESEARCH_CHORD", str(cohort))

    msi = matter.reading("checkpoint", "msi")
    assert msi.ungraded is None
    assert msi.fields["exposed_courses"] == 16.0
    assert msi.fields["plain_courses"] == 16.0
    assert msi.fields["exposed_days"] == 150.0
    assert msi.fields["plain_days"] == 20.0
    assert msi.fields["ratio"] == pytest.approx(7.5)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda split: matter.reading("checkpoint", split),
                ["msi", "abdominal"],
            )
        )
    assert all(
        r.ungraded is None and r.fields["exposed_courses"] == 16.0
        for r in results
    )


def test_kill_caches_ranks_and_supports_concurrent_reads(
    tmp_path, monkeypatch
):
    pack_path = tmp_path / "pack.duckdb"
    conn = duckdb.connect(str(pack_path))
    conn.execute(
        "create table line (model varchar, patient varchar, panel varchar)"
    )
    conn.execute(
        "create table effect (model varchar, gene varchar, score double)"
    )
    conn.execute("create table essential (gene varchar)")
    conn.execute("create table nonessential (gene varchar)")
    for idx in range(10):
        conn.execute(
            "insert into line values (?, ?, 'primary')",
            [f"M{idx}", f"P{idx}"],
        )
        conn.execute(
            "insert into effect values (?, 'ESS1', -1.2), (?, 'ESS2', -0.8), "
            "(?, 'CTRL1', 0.1), (?, 'CTRL2', 0.2)",
            [f"M{idx}", f"M{idx}", f"M{idx}", f"M{idx}"],
        )
    conn.execute("insert into essential values ('ESS1'), ('ESS2')")
    conn.execute("insert into nonessential values ('CTRL1'), ('CTRL2')")
    conn.close()

    monkeypatch.setattr(kill, "PACK", pack_path)

    with ThreadPoolExecutor(max_workers=2) as pool:
        reads = list(
            pool.map(lambda g: kill.reading(g, "all"), ["ESS1", "CTRL2"])
        )
    assert reads[0].fields["rank"] == 0.0
    assert reads[1].fields["rank"] == 0.75
    checked = gate.kill_gate()
    assert checked["passed"]
    assert checked["median_essential"] == -1.0


def test_later_treats_suspended_as_open_and_unknown_as_ungraded(monkeypatch):
    def fake_study(status, results=False, date="2026-10"):
        return {
            "hasResults": results,
            "protocolSection": {
                "identificationModule": {"briefTitle": "Study"},
                "statusModule": {
                    "overallStatus": status,
                    "primaryCompletionDateStruct": {"date": date},
                },
            },
        }

    monkeypatch.setattr(
        later, "fetch", lambda nct: fake_study("SUSPENDED", False)
    )
    suspended = later.reading("NCT00000001", "2026-11-22")
    assert suspended.ungraded is None
    assert suspended.fields["known"] == 0.0
    assert suspended.fields["stopped"] == 0.0
    assert later.open_bet("stopped", suspended.fields)

    monkeypatch.setattr(
        later, "fetch", lambda nct: fake_study("UNKNOWN", False)
    )
    unknown = later.reading("NCT00000002", "2026-11-22")
    assert unknown.ungraded is not None


def test_later_has_results_waits_for_reporting_window():
    recent = later.Reading(
        fields={
            "has_results": 0.0,
            "completed": 1.0,
            "known": 1.0,
            "years_to_report": -0.25,
        },
        status="COMPLETED",
        date="2026-08",
    )
    assert not later.settled("has_results", recent)
    assert later.settled("completed", recent)

    posted = later.Reading(
        fields={
            "has_results": 1.0,
            "completed": 1.0,
            "known": 1.0,
            "years_to_report": -0.25,
        },
        status="COMPLETED",
        date="2026-08",
    )
    assert later.settled("has_results", posted)

    overdue = later.Reading(
        fields={
            "has_results": 0.0,
            "completed": 1.0,
            "known": 1.0,
            "years_to_report": -1.5,
        },
        status="COMPLETED",
        date="2025-05",
    )
    assert later.settled("has_results", overdue)

    withdrawn = later.Reading(
        fields={
            "has_results": 0.0,
            "stopped": 1.0,
            "known": 1.0,
            "years_to_report": 0.0,
        },
        status="WITHDRAWN",
        date="2026-11",
    )
    assert later.settled("has_results", withdrawn)


def test_later_search_filters_active_trials_by_default(monkeypatch):
    urls = []

    def fake_open(url, timeout):
        urls.append(url)
        return io.BytesIO(json.dumps({"studies": []}).encode())

    monkeypatch.setattr(later.urllib.request, "urlopen", fake_open)
    later.search("colorectal cancer", 5)
    assert "filter.overallStatus=RECRUITING" in urls[0]
