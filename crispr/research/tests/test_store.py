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
