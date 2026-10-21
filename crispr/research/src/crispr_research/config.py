import hashlib
import os
import tomllib
from dataclasses import dataclass
from enum import Enum
from functools import cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("RESEARCH_DATA", ROOT / "data"))
METHOD = Path(os.environ.get("RESEARCH_METHOD", ROOT / "method.toml"))
DEPTHS = Path(os.environ.get("RESEARCH_DEPTHS", ROOT / "depths.toml"))
LEDGER = DATA / "research.duckdb"


@cache
def method() -> dict:
    return tomllib.loads(METHOD.read_text())


@cache
def method_sha256() -> str:
    return hashlib.sha256(METHOD.read_bytes()).hexdigest()


@cache
def depths_sha256() -> str:
    if not DEPTHS.exists():
        return ""

    return hashlib.sha256(DEPTHS.read_bytes()).hexdigest()


class Mode(Enum):
    ALWAYS = "on"
    WATCHED = "watched"


@dataclass(frozen=True, slots=True)
class Config:
    mode: Mode
    llm_url: str
    model: str
    api_key: str
    database: str
    actions: int
    max_tokens: int
    reference_tokens: int
    turn_seconds: int
    rest_seconds: int
    idle_rest_seconds: int
    trial_pairs: int
    tokens_per_day: int
    backoff_seconds: int
    backoff_max_seconds: int
    failures: int

    @classmethod
    def from_env(cls) -> Config | None:
        switch = var("RESEARCH_AGENT", "off")

        if switch not in ("on", "watched"):
            return None

        return cls(
            mode=Mode(switch),
            llm_url=var(
                "RESEARCH_AGENT_LLM_URL",
                "http://inference-gateway.llm.svc.cluster.local:1234/v1",
            ),
            model=var("RESEARCH_AGENT_MODEL", "Qwen/Qwen3.5-4B"),
            api_key=var("RESEARCH_AGENT_API_KEY", "none"),
            database=var("RESEARCH_AGENT_DB", str(LEDGER)),
            actions=number("RESEARCH_AGENT_ACTIONS", 6),
            max_tokens=number("RESEARCH_AGENT_MAX_TOKENS", 1536),
            reference_tokens=number("RESEARCH_AGENT_REFERENCE_TOKENS", 24),
            turn_seconds=number("RESEARCH_AGENT_TURN_SECONDS", 900),
            rest_seconds=number("RESEARCH_AGENT_REST_SECONDS", 30),
            idle_rest_seconds=number("RESEARCH_AGENT_IDLE_REST_SECONDS", 1800),
            trial_pairs=min(
                max(number("RESEARCH_AGENT_TRIAL_PAIRS", 8), 6), 12
            ),
            tokens_per_day=number("RESEARCH_AGENT_TOKENS_PER_DAY", 300_000),
            backoff_seconds=number("RESEARCH_AGENT_BACKOFF_SECONDS", 30),
            backoff_max_seconds=number(
                "RESEARCH_AGENT_BACKOFF_MAX_SECONDS", 1800
            ),
            failures=number("RESEARCH_AGENT_FAILURES", 4),
        )


def var(name: str, fallback: str) -> str:
    return os.environ.get(name, fallback)


def number(name: str, fallback: int) -> int:
    try:
        return int(os.environ[name])
    except KeyError, ValueError:
        return fallback
