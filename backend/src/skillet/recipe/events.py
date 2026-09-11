"""The closed set of events a recipe may emit, and their wire format.

Seven types: step, token, tool_call, log, artifact, result, error. This is the
contract `execution` streams as SSE and `catalog`/`workspace` render — see
docs/SPEC-recipe-framework.md's "Event wire format (SSE)" section. Do not add
an eighth type or rename a field without updating that spec first.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter


class StepEvent(BaseModel):
    type: Literal["step"] = "step"
    id: str
    name: str
    status: Literal["start", "finish", "error"]
    detail: str | None = None
    ts: float


class TokenEvent(BaseModel):
    type: Literal["token"] = "token"
    text: str


class ToolCallEvent(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    id: str
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: Any = None
    ts: float


class LogEvent(BaseModel):
    type: Literal["log"] = "log"
    level: Literal["info", "warn", "error"]
    message: str
    ts: float


class ArtifactEvent(BaseModel):
    type: Literal["artifact"] = "artifact"
    id: str
    kind: Literal["json", "table", "markdown", "file"]
    name: str
    data: Any = None
    url: str | None = None


class ResultEvent(BaseModel):
    type: Literal["result"] = "result"
    data: dict[str, Any] = Field(default_factory=dict)
    ts: float


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    error_type: Literal["timeout", "output_limit", "recipe_error", "bad_input", "upstream_error"]
    message: str
    recoverable: bool = False
    ts: float


RecipeEvent = Annotated[
    StepEvent | TokenEvent | ToolCallEvent | LogEvent | ArtifactEvent | ResultEvent | ErrorEvent,
    Field(discriminator="type"),
]

_event_adapter: TypeAdapter[RecipeEvent] = TypeAdapter(RecipeEvent)


def parse_event(raw: str | bytes) -> RecipeEvent:
    """Validate a serialized event against the closed set of 7 types."""
    return _event_adapter.validate_json(raw)
