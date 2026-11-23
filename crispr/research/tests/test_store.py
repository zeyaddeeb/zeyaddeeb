from concurrent.futures import ThreadPoolExecutor
from threading import Event

import duckdb
import pytest

from crispr_research.store import Store


def test_worker_queries_do_not_block_api_reads():
    store = Store(":memory:")
    entered = Event()
    release = Event()

    def hold() -> int:
        entered.set()
        if not release.wait(5):
            raise TimeoutError("the API read did not finish")
        return 1

    def query():
        return store.db.execute("select hold_query()").fetchall()

    store.db.create_function("hold_query", hold)
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            worker = pool.submit(query)
            try:
                assert entered.wait(5)
                assert store.tally()["cards"] == 0
            finally:
                release.set()
            assert worker.result() == [(1,)]
    finally:
        store.close()


def test_worker_reads_do_not_join_the_writers_transaction():
    store = Store(":memory:")
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            store.db.execute("begin transaction")
            store.put_meta("pending", 42)
            assert pool.submit(store.meta, "pending").result() is None
            store.db.execute("commit")
            assert pool.submit(store.meta, "pending").result() == 42
    finally:
        store.close()


def test_close_releases_every_threads_cursor():
    store = Store(":memory:")
    with ThreadPoolExecutor(max_workers=1) as pool:
        worker = pool.submit(lambda: store.db).result()
    owner = store.db
    store.close()

    for connection in (owner, worker):
        with pytest.raises(duckdb.ConnectionException):
            connection.execute("select 1")

    with (
        ThreadPoolExecutor(max_workers=1) as pool,
        pytest.raises(duckdb.ConnectionException),
    ):
        pool.submit(store.tally).result()


def test_store_migrates_legacy_card_table_columns(tmp_path):
    path = str(tmp_path / "legacy.duckdb")
    conn = duckdb.connect(path)
    conn.execute(
        """
        create table card (
            episode bigint,
            seal varchar,
            kernel varchar,
            question varchar,
            field varchar,
            op varchar,
            value double,
            chance double,
            low double,
            high double,
            reference double,
            observed double,
            held boolean,
            skill double,
            spread double,
            covered boolean,
            verdict varchar,
            made bigint
        )
        """
    )
    conn.close()

    store = Store(path)
    try:
        store.put_card(
            {
                "episode": 1,
                "seal": "abc",
                "kernel": "reach",
                "question": "q",
                "field": "core_mm",
                "op": "<",
                "value": 0.1,
                "chance": 0.5,
                "low": 0.0,
                "high": 1.0,
                "reference": 0.5,
                "observed": 0.2,
                "held": False,
                "skill": 0.0,
                "spread": 1.0,
                "covered": True,
                "verdict": "broken",
                "at": 100,
                "claim": "untouched core < 0.1 mm",
                "context": "2 mm nodule",
                "unit": "mm",
                "paid": False,
                "reason": "",
            }
        )
        assert len(store.cards(10)) == 1
    finally:
        store.close()


def test_put_rules_is_atomic_across_concurrent_readers():
    store = Store(":memory:")
    base = {
        "version": 1,
        "layer": "playbook",
        "parent": 0,
        "lines": ["first rule"],
        "standing": "champion",
        "because": "",
        "gain": None,
        "p": None,
        "decided": 0,
        "pairs": [],
        "author": 0,
        "gains": [],
        "wins": 0,
        "tried": [],
    }
    store.put_rules(base)
    stop = Event()

    def reader():
        while not stop.is_set():
            found = store.rules("playbook", 1)
            assert found is not None

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            worker = pool.submit(reader)
            for step in range(40):
                store.put_rules(base | {"lines": [f"rule {step}"]})
            stop.set()
            worker.result()
    finally:
        store.close()
