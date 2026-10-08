import argparse
from collections.abc import Callable

import duckdb

from . import db, gate, snapshot, translate
from .bench import genotype, markers, predict, response
from .cohort import biomarkers, courses, discovery
from .sources import chord, load, screens

COPY_GENES = {"STK11", "RB1", "BRCA1", "BRCA2", "ERBB2"}
GATE_REPORT = "gate-e7f3cc1adcd4.json"


def _status(row: dict) -> str:
    if row["met"]:
        return "MET"

    return "miss" if row["scored"] else "not scored"


def _show(body: dict) -> None:
    for k in body["known"]:
        effect = k["effect"] or {}
        ratio = effect.get("hazard_ratio")
        print(
            f"{k['cancer'][:12]:12} {k['drug_class']:14} "
            f"{k['biomarker']:16} {k['expected']:7} "
            f"n={effect.get('marked', 0)}/{effect.get('unmarked', 0)} "
            f"HR={f'{ratio:.2f}' if ratio else '  - '} "
            f"p={k['probability']:.3f} "
            f"{_status(k)}"
        )

    print(
        f"known {body['known_met']}/{body['known_scored']} met "
        f"({body['known_rate']:.2f}), {body['known_wrong']} wrong "
        f"(need <= 1); controls {body['control_signals']}/"
        f"{body['controls']} ({body['control_rate']:.3f}, need <= 0.10); "
        f"separation p={body['separation']:.1e} (need < 1e-3); "
        f"{'PASS' if body['passed'] else 'FAIL'}"
    )


def _summary(body: dict) -> None:
    for label in ("primary", "positive_controls"):
        rates = body[label]
        print(
            f"{label}: {rates['pairs']} pairs, {rates['confident']} confident "
            f"bench calls: {rates['held up']} held up, "
            f"{rates['reversed']} reversed, {rates['unresolved']} unresolved"
        )

    g0 = body["slopes"]["g0"]
    print(
        f"translation slope {g0['median']:+.2f} "
        f"[{g0['low']:+.2f}, {g0['high']:+.2f}], P(>0)={g0['positive']:.3f}"
    )

    for name, c in body["slopes"]["classes"].items():
        print(f"  {name:15} {c['median']:+.2f} P(>0)={c['positive']:.3f}")


def _fit(connection, plan: dict[str, list[str]]) -> None:
    gate.effects_many(
        connection, [(c, n) for c, names in plan.items() for n in names]
    )


def fetch() -> None:
    for path in [*chord.fetch(), *screens.fetch()]:
        print(path.name)


def load_chord(connection: duckdb.DuckDBPyConnection) -> None:
    print(load.run(connection))


def cohort(connection: duckdb.DuckDBPyConnection) -> None:
    print(f"{courses.build(connection)} eligible courses")
    print(biomarkers.build(connection))


def bench(connection: duckdb.DuckDBPyConnection) -> None:
    found = discovery.build(connection)
    genes = sorted({g for listed in found.values() for g in listed})
    print(genotype.load(connection, {*genes, *COPY_GENES}))
    print(markers.build(connection, genes))
    print(response.build(connection))


def seal(connection: duckdb.DuckDBPyConnection) -> None:
    found = discovery.genes(connection)
    allowed = {
        *markers.NAMED,
        *(f"altered:{g}" for listed in found.values() for g in listed),
    }
    names = predict.biomarkers(connection, allowed)
    digest = predict.run(connection, names, predict.PREDICTIONS)
    print(f"sealed {predict.PREDICTIONS} sha256 {digest}")


def explore_bench(connection: duckdb.DuckDBPyConnection) -> None:
    discovery.genes(connection)
    menu = discovery.menu(connection)
    discovery.mark(connection, menu)
    genotype.load(connection, {*menu, *COPY_GENES})
    markers.build(connection, menu)
    done = {p["biomarker"] for p in predict.sealed(predict.PREDICTIONS)}
    allowed = {f"altered:{g}" for g in menu}
    names = [
        n for n in predict.biomarkers(connection, allowed) if n not in done
    ]
    digest = predict.run(connection, names, predict.EXPLORE)
    print(f"sealed {predict.EXPLORE} sha256 {digest}")


def patients(connection: duckdb.DuckDBPyConnection) -> None:
    _fit(connection, translate.tested(connection))


def explore_patients(connection: duckdb.DuckDBPyConnection) -> None:
    _fit(connection, translate.explored(connection))
    print(f"{translate.explore(connection)} exploratory pairs scored")


def score(connection: duckdb.DuckDBPyConnection) -> None:
    _summary(translate.run(connection))


def known(connection: duckdb.DuckDBPyConnection) -> None:
    _show(gate.run(connection))


COMMANDS: dict[str, tuple[str, Callable]] = {
    "load": ("load MSK-CHORD into DuckDB", load_chord),
    "cohort": ("build treatment courses and biomarkers", cohort),
    "gate": ("run the known-answer test", known),
    "bench": ("build cell-line genotypes and responses", bench),
    "predict": ("fit and seal the bench predictions", seal),
    "patients": ("fit patients for every predicted pair", patients),
    "translate": ("score the sealed predictions", score),
    "explore-bench": ("seal bench predictions for the menu", explore_bench),
    "explore-patients": ("fit patients for the menu", explore_patients),
}


def main() -> None:
    parser = argparse.ArgumentParser(prog="bedside")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch", help="download MSK-CHORD, DepMap and PRISM")
    sub.add_parser("snapshot", help="write the page snapshot from reports")

    for name, (text, _) in COMMANDS.items():
        sub.add_parser(name, help=text)

    args = parser.parse_args()

    if args.command == "fetch":
        fetch()
        return

    if args.command == "snapshot":
        print(snapshot.build(GATE_REPORT))
        return

    with db.connect() as connection:
        COMMANDS[args.command][1](connection)
