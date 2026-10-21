import json

import httpx
import pytest

from research.agent.llm import Ask, Dropped, Llm, Splitter


def ask(max_tokens: int = 24) -> Ask:
    return Ask(
        preamble="Test the stream.",
        history=[],
        prompt={"role": "user", "content": "Begin."},
        tools=[],
        max_tokens=max_tokens,
    )


def frame(delta: dict, **choice) -> str:
    return "data: " + json.dumps({"choices": [{"delta": delta} | choice]})


def response(*frames: str) -> httpx.Response:
    return httpx.Response(
        200,
        headers={"content-type": "text/event-stream"},
        content="\n\n".join(frames) + "\n\n",
    )


async def reply(*frames: str, on_delta=None):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: response(*frames))
    ) as client:
        llm = Llm("http://gateway/v1", "none", "test", client)

        return await llm.reply(ask(), on_delta)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "ending", ["data: [DONE]", frame({}, finish_reason="stop")]
)
async def test_a_stream_requires_a_completion_signal(ending):
    found = await reply(frame({"content": "Complete."}), ending)

    assert found.said == "Complete."


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "frames",
    [
        (),
        (frame({"content": "Cut short"}),),
        ("data: {broken", "data: [DONE]"),
        ('data: {"error": {"message": "unavailable"}}', "data: [DONE]"),
        ("data: []", "data: [DONE]"),
    ],
)
async def test_incomplete_or_invalid_streams_are_retryable(frames):
    with pytest.raises(Dropped):
        await reply(*frames)


@pytest.mark.asyncio
@pytest.mark.parametrize("args", ['{"found":', "null", "[]", '"done"'])
async def test_malformed_tool_arguments_are_not_replaced_with_empty_objects(
    args,
):
    with pytest.raises(Dropped, match="tool arguments"):
        await reply(
            frame(
                {
                    "tool_calls": [
                        {
                            "index": 0,
                            "id": "c0",
                            "function": {
                                "name": "conclude",
                                "arguments": args,
                            },
                        }
                    ]
                }
            ),
            "data: [DONE]",
        )


@pytest.mark.asyncio
async def test_fragmented_tool_calls_keep_their_ids_and_arguments():
    found = await reply(
        frame(
            {
                "tool_calls": [
                    {
                        "index": 1,
                        "id": "second",
                        "function": {
                            "name": "conclude",
                            "arguments": '{"found":',
                        },
                    },
                    {
                        "index": 0,
                        "id": "first",
                        "function": {
                            "name": "plan",
                            "arguments": '{"aim":"a"}',
                        },
                    },
                ]
            }
        ),
        frame(
            {
                "tool_calls": [
                    {"index": 1, "function": {"arguments": '"done"}'}},
                ]
            }
        ),
        "data: [DONE]",
    )

    assert [call.id for call in found.calls] == ["first", "second"]
    assert found.calls[1].args == {"found": "done"}
    assert found.tokens > 0, "tool-only replies still consume output tokens"
    assert found.read > 0


@pytest.mark.asyncio
async def test_a_completion_preserves_a_trailing_partial_tag():
    deltas = []
    found = await reply(
        frame({"content": "The result <"}),
        "data: [DONE]",
        on_delta=lambda channel, text: deltas.append((channel, text)),
    )

    assert found.said == "The result <"
    assert deltas == [("say", "The result "), ("say", "<")]


@pytest.mark.parametrize(
    "cut", range(len("before<think>reason</think>after") + 1)
)
def test_thinking_tags_can_be_split_at_any_boundary(cut):
    text = "before<think>reason</think>after"
    splitter = Splitter()
    parts = [
        splitter.feed(text[:cut]),
        splitter.feed(text[cut:]),
        splitter.finish(),
    ]

    assert "".join(thought for thought, _ in parts) == "reason"
    assert "".join(said for _, said in parts) == "beforeafter"


def test_a_partial_tag_does_not_hold_back_the_whole_delta():
    splitter = Splitter()

    assert splitter.feed("before<thi") == ("", "before")
    assert splitter.feed("nk>reason</thi") == ("reason", "")
    assert splitter.feed("nk>after") == ("", "after")
    assert splitter.finish() == ("", "")


@pytest.mark.asyncio
async def test_requested_output_limits_and_cached_usage_are_preserved():
    requests = []

    def handle(request):
        requests.append(json.loads(request.content))

        return response(
            frame({"content": "0.5"}),
            "data: "
            + json.dumps(
                {
                    "choices": [],
                    "usage": {
                        "prompt_tokens": 100,
                        "completion_tokens": 2,
                        "prompt_tokens_details": {"cached_tokens": 40},
                    },
                }
            ),
            "data: [DONE]",
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle)
    ) as client:
        llm = Llm("http://gateway/v1", "none", "test", client)
        found = await llm.reply(ask(max_tokens=24))

    assert requests[0]["max_tokens"] == 24
    assert found.processed() == 62
