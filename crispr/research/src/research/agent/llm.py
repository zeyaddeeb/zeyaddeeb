import json
from dataclasses import dataclass, field

import httpx

OPEN = "<think>"
SHUT = "</think>"
PER_TOKEN = 4


class Dropped(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Call:
    id: str
    tool: str
    args: dict


@dataclass(slots=True)
class Reply:
    thought: str = ""
    said: str = ""
    calls: list[Call] = field(default_factory=list)
    tokens: int = 0
    read: int = 0

    def processed(self) -> int:
        return self.tokens + self.read

    def message(self) -> dict:
        body: dict = {"role": "assistant", "content": self.said}

        if self.calls:
            body["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.tool,
                        "arguments": json.dumps(call.args),
                    },
                }
                for call in self.calls
            ]

        return body


@dataclass(frozen=True, slots=True)
class Ask:
    preamble: str
    history: list[dict]
    prompt: dict
    tools: list[dict]
    max_tokens: int


class Splitter:
    def __init__(self) -> None:
        self.inside = False
        self.held = ""

    def feed(self, text: str) -> tuple[str, str]:
        thought, said = "", ""
        self.held += text

        while self.held:
            if self.inside:
                cut = self.held.find(SHUT)

                if cut < 0:
                    safe = len(self.held) - _partial(self.held, SHUT)
                    thought += self.held[:safe]
                    self.held = self.held[safe:]
                    break

                thought += self.held[:cut]
                self.held = self.held[cut + len(SHUT) :]
                self.inside = False
                continue

            cut = self.held.find(OPEN)

            if cut < 0:
                safe = len(self.held) - _partial(self.held, OPEN)
                said += self.held[:safe]
                self.held = self.held[safe:]
                break

            said += self.held[:cut]
            self.held = self.held[cut + len(OPEN) :]
            self.inside = True

        return thought, said

    def finish(self) -> tuple[str, str]:
        held, self.held = self.held, ""

        return (held, "") if self.inside else ("", held)


def _partial(held: str, tag: str) -> int:
    for size in range(min(len(held), len(tag) - 1), 0, -1):
        if held[-size:] == tag[:size]:
            return size

    return 0


class Llm:
    def __init__(
        self,
        url: str,
        key: str,
        model: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self.key = key
        self.model = model
        self.client = client or httpx.AsyncClient(timeout=None)

    async def ready(self) -> bool:
        try:
            answer = await self.client.get(
                f"{self.url}/models", headers=self._headers()
            )
        except httpx.HTTPError:
            return False

        return answer.status_code < 500

    def _headers(self) -> dict[str, str]:
        if self.key and self.key != "none":
            return {"authorization": f"Bearer {self.key}"}

        return {}

    def _body(self, ask: Ask) -> dict:
        messages = [{"role": "system", "content": ask.preamble}]
        messages.extend(ask.history)
        messages.append(ask.prompt)
        body: dict = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": max(ask.max_tokens, 1),
        }

        if ask.tools:
            body["tools"] = ask.tools
            body["tool_choice"] = "auto"

        return body

    async def reply(self, ask: Ask, on_delta=None) -> Reply:
        body = self._body(ask)
        reply = Reply()
        splitter = Splitter()
        pending: dict[int, dict] = {}
        usage: dict | None = None
        finished = False

        try:
            async with self.client.stream(
                "POST",
                f"{self.url}/chat/completions",
                json=body,
                headers=self._headers() | {"accept": "text/event-stream"},
            ) as answer:
                if answer.status_code >= 400:
                    await answer.aread()
                    raise Dropped(f"the gateway answered {answer.status_code}")

                async for line in answer.aiter_lines():
                    if not line.startswith("data:"):
                        continue

                    payload = line[5:].strip()

                    if not payload:
                        continue

                    if payload == "[DONE]":
                        finished = True
                        break

                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError as error:
                        raise Dropped(
                            "the gateway sent invalid JSON"
                        ) from error

                    if not isinstance(chunk, dict) or "error" in chunk:
                        raise Dropped("the gateway sent an invalid response")

                    if chunk.get("usage"):
                        usage = chunk["usage"]

                    for choice in chunk.get("choices") or []:
                        if choice.get("finish_reason") is not None:
                            finished = True

                        _absorb(
                            reply,
                            splitter,
                            pending,
                            choice.get("delta") or {},
                            on_delta,
                        )
        except httpx.HTTPError as error:
            raise Dropped(str(error)) from error

        if not finished:
            raise Dropped("the gateway stream ended before completion")

        thought, said = splitter.finish()
        _emit(reply, thought, said, on_delta)
        reply.calls = _finished(pending)
        _count(reply, ask, usage)

        return reply


def _absorb(
    reply: Reply,
    splitter: Splitter,
    pending: dict[int, dict],
    delta: dict,
    on_delta,
) -> None:
    thinking = delta.get("reasoning_content")

    if thinking:
        reply.thought += thinking

        if on_delta:
            on_delta("think", thinking)

    content = delta.get("content")

    if content:
        thought, said = splitter.feed(content)
        _emit(reply, thought, said, on_delta)

    for raw in delta.get("tool_calls") or []:
        _gather(pending, raw)


def _emit(reply: Reply, thought: str, said: str, on_delta) -> None:
    reply.thought += thought
    reply.said += said

    if on_delta:
        if thought:
            on_delta("think", thought)

        if said:
            on_delta("say", said)


def _gather(pending: dict[int, dict], raw: dict) -> None:
    index = raw.get("index", 0)
    slot = pending.setdefault(index, {"id": "", "name": "", "args": ""})

    if raw.get("id"):
        slot["id"] = raw["id"]

    function = raw.get("function") or {}

    if function.get("name"):
        slot["name"] = function["name"]

    if function.get("arguments"):
        slot["args"] += function["arguments"]


def _finished(pending: dict[int, dict]) -> list[Call]:
    calls = []

    for index in sorted(pending):
        slot = pending[index]

        if not slot["name"]:
            raise Dropped("the gateway sent a tool call without a name")

        try:
            args = json.loads(slot["args"]) if slot["args"].strip() else {}
        except json.JSONDecodeError as error:
            raise Dropped(
                "the gateway sent incomplete tool arguments"
            ) from error

        if not isinstance(args, dict):
            raise Dropped("the gateway sent non-object tool arguments")

        calls.append(
            Call(
                id=slot["id"] or f"call_{index}",
                tool=slot["name"],
                args=args,
            )
        )

    return calls


def _count(reply: Reply, ask: Ask, usage: dict | None) -> None:
    if usage:
        reply.tokens = int(usage.get("completion_tokens") or 0)
        details = usage.get("prompt_tokens_details") or {}
        cached = int(details.get("cached_tokens") or 0)
        reply.read = max(0, int(usage.get("prompt_tokens") or 0) - cached)

        return

    generated = len(reply.thought) + len(reply.said)
    generated += sum(
        len(call.tool) + len(json.dumps(call.args)) for call in reply.calls
    )
    reply.tokens = (generated + PER_TOKEN - 1) // PER_TOKEN
    sent = (
        len(ask.preamble)
        + len(json.dumps(ask.history))
        + len(json.dumps(ask.prompt))
        + len(json.dumps(ask.tools))
    )
    reply.read = (sent + PER_TOKEN - 1) // PER_TOKEN
