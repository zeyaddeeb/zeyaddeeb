import asyncio
import time
from collections import deque
from dataclasses import dataclass

BACKLOG = 240
SEATS = 256


def now() -> int:
    return int(time.time() * 1000)


@dataclass(frozen=True, slots=True)
class Envelope:
    seq: int
    at: int
    body: dict

    def wire(self) -> dict:
        return {"seq": self.seq, "at": self.at} | self.body


class Hub:
    def __init__(self, backlog: int = BACKLOG) -> None:
        self._seq = 0
        self._queues: list[asyncio.Queue[Envelope]] = []
        self._backlog: deque[Envelope] = deque(maxlen=backlog)
        self._closing = False

    def emit(self, body: dict) -> Envelope:
        self._seq += 1
        envelope = Envelope(seq=self._seq, at=now(), body=body)

        if body.get("type") == "wake":
            self._backlog.clear()

        self._backlog.append(envelope)

        for queue in list(self._queues):
            queue.put_nowait(envelope)

        return envelope

    def subscribe(self) -> asyncio.Queue[Envelope]:
        queue: asyncio.Queue[Envelope] = asyncio.Queue()
        self._queues.append(queue)

        return queue

    def release(self, queue: asyncio.Queue[Envelope]) -> None:
        if queue in self._queues:
            self._queues.remove(queue)

    def watchers(self) -> int:
        return len(self._queues)

    def backlog(self) -> list[dict]:
        return [envelope.wire() for envelope in self._backlog]

    def close(self) -> None:
        self._closing = True

    def closing(self) -> bool:
        return self._closing
