import json
from collections import deque
from dataclasses import dataclass, field

import httpx


@dataclass
class Think:
    text: str


@dataclass
class Say:
    text: str


@dataclass
class Ring:
    tool: str
    args: dict


@dataclass
class Script:
    turns: deque
    requests: list[dict] = field(default_factory=list)
    drop_first: bool = False
    dropped: bool = False
    down: bool = False

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=httpx.MockTransport(self.handle), timeout=None
        )

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(503 if self.down else 200, json={})

        body = json.loads(request.content)
        self.requests.append(body)

        if self.drop_first and not self.dropped:
            self.dropped = True

            return httpx.Response(500, json={"error": "nope"})

        parts = [Say("0.5")] if not self.turns else self.turns.popleft()

        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=_frames(parts),
        )


def _frames(parts: list) -> bytes:
    lines = []
    call_index = 0

    for index, part in enumerate(parts):
        match part:
            case Think(text):
                delta = {"reasoning_content": text}
            case Say(text):
                delta = {"content": text}
            case Ring(tool, args):
                delta = {
                    "tool_calls": [
                        {
                            "index": call_index,
                            "id": f"call_{index}",
                            "type": "function",
                            "function": {
                                "name": tool,
                                "arguments": json.dumps(args),
                            },
                        }
                    ]
                }
                call_index += 1
            case _:
                delta = {}

        lines.append(
            "data: "
            + json.dumps(
                {"choices": [{"delta": delta, "finish_reason": None}]}
            )
        )

    lines.append(
        "data: "
        + json.dumps(
            {
                "choices": [],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 20,
                    "prompt_tokens_details": {"cached_tokens": 40},
                },
            }
        )
    )
    lines.append("data: [DONE]")

    return ("\n\n".join(lines) + "\n\n").encode()


def whole_probe() -> dict:
    return {
        "kernel": "reach",
        "question": "Does cisplatin clear a 2 mm nodule in half an hour?",
        "probe": {
            "weight": 300.0,
            "diffusivity": 2.5e-10,
            "ic50": 6.2e-3,
            "concentration": 0.8,
            "dwell": 1800.0,
            "radius": 0.002,
        },
        "field": "core_mm",
        "op": "<",
        "value": 0.1,
        "chance": 0.3,
        "low": 1.0,
        "high": 1.9,
    }


@dataclass
class Clerk:
    requests: list[dict] = field(default_factory=list)
    preambles: list[str] = field(default_factory=list)
    turn: int = 0
    revisions: int = 0
    texts: tuple = (
        "Start from the nodule you think it cannot cross",
        "Name the sink before you name the drug",
        "Ask about a gene the forecaster would hesitate on",
    )

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=httpx.MockTransport(self.handle), timeout=None
        )

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={})

        body = json.loads(request.content)
        self.requests.append(body)
        tools = [t["function"]["name"] for t in body.get("tools") or []]
        system = body["messages"][0]
        preamble = system["content"] if system["role"] == "system" else ""

        if "revise" in tools:
            text = self.texts[self.revisions % len(self.texts)]
            self.revisions += 1

            return _sse(
                [
                    Ring(
                        "revise",
                        {
                            "change": "add",
                            "text": text,
                            "because": "the last episodes wandered",
                        },
                    )
                ]
            )

        if not tools:
            return _sse([Say("0.5")])

        self.preambles.append(preamble)
        coached = "Your own rules" in preamble
        self.turn += 1
        step = self.turn % 3

        if step == 1:
            return _sse(
                [
                    Ring(
                        "plan",
                        {
                            "aim": "test a gene",
                            "could_fail": "it may be common",
                        },
                    )
                ]
            )

        if step == 2:
            card = {
                "kernel": "kill",
                "question": "Is RPL3 needed by most colorectal lines?",
                "probe": {"gene": "RPL3", "stratum": "all"},
                "field": "share_essential",
                "op": ">",
                "value": 0.5,
                "chance": 0.9 if coached else 0.6,
                "low": 0.6,
                "high": 0.9,
            }

            for message in body["messages"]:
                content = message.get("content") or ""
                if (
                    "Assigned case (only this case can be scored):\n"
                    in content
                ):
                    assigned = content.split(
                        "Assigned case (only this case can be scored):\n", 1
                    )[1]
                    card.update(json.loads(assigned))
                    break
            return _sse([Ring("probe", card)])

        return _sse(
            [Ring("conclude", {"found": "done", "next": "another gene"})]
        )


def _sse(parts: list) -> httpx.Response:
    return httpx.Response(
        200,
        headers={"content-type": "text/event-stream"},
        content=_frames(parts),
    )
