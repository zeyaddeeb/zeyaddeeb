import multiprocessing
from collections.abc import Callable, Iterable
from concurrent.futures import (
    FIRST_COMPLETED,
    Future,
    ProcessPoolExecutor,
    wait,
)

WORKERS = 12


def fan_out[I, J, R](
    items: Iterable[I],
    prepare: Callable[[I], J],
    work: Callable[[J, dict], R],
    finish: Callable[[J, R], None],
    *,
    settings: dict,
    workers: int = WORKERS,
) -> None:
    queue = iter(items)
    pending: dict[Future[R], J] = {}
    context = multiprocessing.get_context("spawn")
    solo = {**settings, "cores": 1}

    with ProcessPoolExecutor(workers, mp_context=context) as pool:
        while True:
            while len(pending) < workers:
                item = next(queue, None)

                if item is None:
                    break

                job = prepare(item)
                pending[pool.submit(work, job, solo)] = job

            if not pending:
                return

            done, _ = wait(pending, return_when=FIRST_COMPLETED)

            for future in done:
                finish(pending.pop(future), future.result())
