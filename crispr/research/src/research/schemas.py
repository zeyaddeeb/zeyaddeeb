from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Positive = Annotated[float, Field(gt=0)]
Chance = Annotated[float, Field(ge=0, le=1)]


class Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        allow_inf_nan=False,
        frozen=True,
    )


class ProbeIn(Model):
    weight: Positive
    diffusivity: Positive
    ic50: Positive
    concentration: Positive
    dwell: Positive
    radius: Positive


class ReadingOut(Model):
    lambda_mm: float
    depth_mm: float
    touched: float
    core_mm: float
    thiele: float
    damkohler: float
    ratio: float
    margin: float
    steady: float


class RowOut(Model):
    agent: str
    depth_mm: float
    low: float
    high: float
    inside: bool


class CheckOut(Model):
    check: str
    held: bool
    detail: str


class GateOut(Model):
    replication: list[RowOut]
    limits: list[CheckOut]
    replicated: bool
    limits_held: bool
    measured: bool
    depths: int
    comparable: int
    scores: bool
    method: str


class AboutOut(Model):
    mode: str
    subject: str
    referees: list[str]
    built: list[str]
    method: str
