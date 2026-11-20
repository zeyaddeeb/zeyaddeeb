from __future__ import annotations

import asyncio
import math
import subprocess
import time
from dataclasses import dataclass
from typing import Any

import httpx


def _logsumexp(values: list[float]) -> float:
    if not values:
        return float("-inf")
    m = max(values)
    if math.isinf(m):
        return m
    return m + math.log(sum(math.exp(v - m) for v in values))


def extract_log_odds(
    top_logprobs: list[dict[str, Any]],
    pos_tokens: tuple[str, ...],
    neg_tokens: tuple[str, ...],
    floor: float = -20.0,
) -> tuple[float, bool]:
    pos_set = set(pos_tokens)
    neg_set = set(neg_tokens)
    pos_lp: list[float] = []
    neg_lp: list[float] = []
    for entry in top_logprobs:
        tok = entry.get("token", "")
        lp = float(entry.get("logprob", floor))
        if tok in pos_set:
            pos_lp.append(lp)
        elif tok in neg_set:
            neg_lp.append(lp)
    both_found = bool(pos_lp) and bool(neg_lp)
    p = _logsumexp(pos_lp) if pos_lp else floor
    q = _logsumexp(neg_lp) if neg_lp else floor
    return p - q, both_found


def extract_alphabet_probs(
    top_logprobs: list[dict[str, Any]],
    alphabet: tuple[str, ...],
    floor: float = -20.0,
) -> list[float]:
    scores: list[float] = []
    for sym in alphabet:
        variants = {sym, f" {sym}"}
        vals = [
            float(e.get("logprob", floor))
            for e in top_logprobs
            if e.get("token", "") in variants
        ]
        scores.append(_logsumexp(vals) if vals else floor)
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]


@dataclass
class ServerSpec:
    hf_repo: str
    port: int = 8089
    parallel: int = 8
    ctx_size: int = 2048
    vision: bool = False
    extra_args: tuple[str, ...] = ()


class LlamaServer:
    def __init__(self, spec: ServerSpec) -> None:
        self.spec = spec
        self.base_url = f"http://127.0.0.1:{spec.port}"
        self._proc: subprocess.Popen[bytes] | None = None

    def start(self, timeout: float = 300.0) -> None:
        cmd = [
            "llama-server",
            "-hf",
            self.spec.hf_repo,
            "--host",
            "127.0.0.1",
            "--port",
            str(self.spec.port),
            "--parallel",
            str(self.spec.parallel),
            "--ctx-size",
            str(self.spec.ctx_size),
            "--n-gpu-layers",
            "999",
            "--log-disable",
        ]
        if not self.spec.vision:
            cmd.append("--no-mmproj")
        cmd.extend(self.spec.extra_args)

        self._proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        deadline = time.monotonic() + timeout
        with httpx.Client(timeout=2.0) as client:
            while time.monotonic() < deadline:
                if self._proc.poll() is not None:
                    err = ""
                    if self._proc.stderr is not None:
                        err = self._proc.stderr.read().decode(
                            "utf-8", errors="replace"
                        )
                    raise RuntimeError(
                        f"llama-server exited early ({self._proc.returncode})"
                        f":\n{err[-1500:]}"
                    )
                try:
                    r = client.get(f"{self.base_url}/health")
                    if r.status_code == 200:
                        return
                except httpx.HTTPError:
                    pass
                time.sleep(0.5)
        self.stop()
        raise TimeoutError(
            f"llama-server did not become ready within {timeout}s"
        )

    def stop(self) -> None:
        if self._proc is not None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait()
            self._proc = None

    def __enter__(self) -> LlamaServer:
        self.start()
        return self

    def __exit__(self, *_: object) -> None:
        self.stop()


class LlamaClient:
    def __init__(
        self,
        base_url: str,
        concurrency: int = 8,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.sem = asyncio.Semaphore(concurrency)
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            limits=httpx.Limits(
                max_connections=concurrency * 2,
                max_keepalive_connections=concurrency * 2,
            ),
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    async def completion_top_logprobs(
        self,
        prompt: str,
        *,
        n_probs: int = 64,
        slot_id: int | None = None,
    ) -> list[dict[str, Any]]:
        body: dict[str, Any] = {
            "prompt": prompt,
            "n_predict": 1,
            "n_probs": n_probs,
            "temperature": 0.0,
            "cache_prompt": True,
            "post_sampling_probs": False,
        }
        if slot_id is not None:
            body["id_slot"] = slot_id
        async with self.sem:
            resp = await self.client.post("/completion", json=body)
            resp.raise_for_status()
            data = resp.json()
        probs = data.get("completion_probabilities") or []
        if not probs:
            return []
        return probs[0].get("top_logprobs") or []

    async def chat_image_top_logprobs(
        self,
        image_data_url: str,
        prompt: str,
        *,
        system: str | None = None,
        top_logprobs: int = 20,
    ) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": image_data_url},
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        )
        body: dict[str, Any] = {
            "messages": messages,
            "max_tokens": 1,
            "temperature": 0.0,
            "logprobs": True,
            "top_logprobs": top_logprobs,
        }
        async with self.sem:
            resp = await self.client.post("/v1/chat/completions", json=body)
            resp.raise_for_status()
            data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return []
        lp_block = choices[0].get("logprobs") or {}
        content = lp_block.get("content") or []
        if not content:
            return []
        return content[0].get("top_logprobs") or []

    async def completion_generate(
        self,
        prompt: str,
        *,
        n_predict: int = 64,
        temperature: float = 0.0,
    ) -> str:
        body = {
            "prompt": prompt,
            "n_predict": n_predict,
            "temperature": temperature,
            "cache_prompt": True,
        }
        async with self.sem:
            resp = await self.client.post("/completion", json=body)
            resp.raise_for_status()
            return str(resp.json().get("content", ""))
