import asyncio
import json
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from . import cards
from .agent import loop
from .agent.core import Agent
from .config import Config, method, method_sha256
from .kernels import gate, reach
from .live import SEATS, Hub
from .schemas import AboutOut, GateOut, ProbeIn, ReadingOut
from .store import Store

KEEPALIVE = 20.0
SHUTDOWN_SECONDS = 10.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = Config.from_env()
    app.state.hub = Hub()
    app.state.agent = None
    app.state.task = None
    app.state.seats = asyncio.Semaphore(SEATS)

    if config is not None:
        store = Store(config.database)
        app.state.agent = Agent(config, store, app.state.hub)
        app.state.task = asyncio.create_task(loop.run(app.state.agent))

    try:
        yield
    finally:
        app.state.hub.close()
        try:
            if app.state.task is not None:
                with suppress(TimeoutError):
                    await asyncio.wait_for(
                        app.state.task, timeout=SHUTDOWN_SECONDS
                    )
        finally:
            if app.state.agent is not None:
                try:
                    await app.state.agent.llm.client.aclose()
                finally:
                    app.state.agent.store.close()


app = FastAPI(
    title="research", docs_url=None, redoc_url=None, lifespan=lifespan
)


def _agent(request: Request) -> Agent:
    found = request.app.state.agent

    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="the agent is off"
        )

    return found


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    task = request.app.state.task

    if task is not None and task.done():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="the agent has stopped",
        )

    return {"status": "ok"}


@app.get("/about", response_model_by_alias=True)
def get_about(request: Request) -> AboutOut:
    meta = method()["meta"]
    found = request.app.state.agent

    return AboutOut(
        mode="off" if found is None else found.config.mode.value,
        subject=meta["subject"],
        referees=list(meta["referees"]),
        built=list(cards.BUILT),
        method=method_sha256()[:12],
    )


@app.get("/agent/mode")
def get_mode(request: Request) -> dict[str, str]:
    found = request.app.state.agent

    return {"mode": "off" if found is None else found.config.mode.value}


@app.get("/agent")
def get_agent(request: Request) -> dict:
    return _agent(request).overview()


@app.get("/agent/episodes")
def get_episodes(request: Request, before: int = 0) -> list[dict]:
    return _agent(request).store.episodes(before, 20)


@app.get("/agent/cards")
def get_cards(request: Request) -> list[dict]:
    return _agent(request).store.cards(60)


@app.get("/agent/episodes/{number}")
def get_episode(request: Request, number: int) -> dict:
    agent = _agent(request)
    found = agent.store.episodes(number + 1, 1)

    if not found or found[0]["number"] != number:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return {"episode": found[0], "turns": agent.store.turns(number)}


@app.get("/agent/events")
async def get_events(request: Request) -> StreamingResponse:
    hub = request.app.state.hub

    if request.app.state.agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    seats = request.app.state.seats

    if seats.locked():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="no seats left",
        )

    async def stream():
        await seats.acquire()
        queue = hub.subscribe()

        try:
            while not await request.is_disconnected():
                try:
                    envelope = await asyncio.wait_for(
                        queue.get(), timeout=KEEPALIVE
                    )
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue

                yield f"data: {json.dumps(envelope.wire())}\n\n"
        finally:
            hub.release(queue)
            seats.release()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    )


@app.post("/reach", response_model_by_alias=True)
def post_reach(body: ProbeIn) -> ReadingOut:
    return ReadingOut(**reach.probe(body.model_dump(), gate.sink()))


@app.get("/reach/gate", response_model_by_alias=True)
def get_reach_gate() -> GateOut:
    report = gate.run()

    return GateOut(
        replication=[
            {
                "agent": row["agent"],
                "depth_mm": row["depth_mm"],
                "low": row["band"][0],
                "high": row["band"][1],
                "inside": row["inside"],
            }
            for row in report["replication"]
        ],
        limits=report["limits"],
        replicated=report["replicated"],
        limits_held=report["limits_held"],
        measured=report["measured"],
        depths=report["depths"],
        comparable=report["comparable"],
        scores=report["scores"],
        method=method_sha256()[:12],
    )
