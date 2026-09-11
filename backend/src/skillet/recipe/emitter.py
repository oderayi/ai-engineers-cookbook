"""The Emitter recipes call to stream progress (`ctx.emit.step(...)`, etc.).

A thin, dumb sink: each method builds the correctly-typed event from
`skillet.recipe.events` and pushes it to whatever async sink the caller
supplied. Ordering and terminal-event enforcement are the executor's job
(Task 10), not this class's — see docs/SPEC-recipe-framework.md.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from skillet.recipe.events import (
    ArtifactEvent,
    ErrorEvent,
    LogEvent,
    RecipeEvent,
    ResultEvent,
    StepEvent,
    TokenEvent,
    ToolCallEvent,
)

logger = logging.getLogger(__name__)

Sink = Callable[[RecipeEvent], Awaitable[None]]


class Emitter:
    """Constructed once per run with a `sink` (the executor supplies the real
    one; tests supply a list-appending stub). `clock` is injectable so tests
    get deterministic timestamps.
    """

    def __init__(self, sink: Sink, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._sink = sink
        self._clock = clock
        self._start = clock()
        self._open_steps: dict[str, str] = {}

    def _ts(self) -> float:
        return self._clock() - self._start

    async def step(self, id: str, name: str, *, status: str, detail: str | None = None) -> None:
        if status == "start":
            self._open_steps[id] = name
        else:
            self._open_steps.pop(id, None)
        await self._sink(StepEvent(id=id, name=name, status=status, detail=detail, ts=self._ts()))

    async def token(self, text: str) -> None:
        await self._sink(TokenEvent(text=text))

    async def tool_call(
        self, id: str, name: str, args: dict[str, Any] | None = None, *, result: Any = None
    ) -> None:
        await self._sink(
            ToolCallEvent(id=id, name=name, args=args or {}, result=result, ts=self._ts())
        )

    async def log(self, message: str, *, level: str = "info") -> None:
        await self._sink(LogEvent(level=level, message=message, ts=self._ts()))

    async def artifact(
        self, id: str, *, kind: str, name: str, data: Any = None, url: str | None = None
    ) -> None:
        await self._sink(ArtifactEvent(id=id, kind=kind, name=name, data=data, url=url))

    async def result(self, data: dict[str, Any]) -> None:
        await self._sink(ResultEvent(data=data, ts=self._ts()))

    async def error(self, error_type: str, message: str, *, recoverable: bool = False) -> None:
        await self._sink(
            ErrorEvent(
                error_type=error_type, message=message, recoverable=recoverable, ts=self._ts()
            )
        )

    @property
    def unclosed_step_ids(self) -> list[str]:
        """Step ids that were `start`ed but never `finish`ed/`error`ed."""
        return list(self._open_steps)

    def audit_unclosed_steps(self) -> None:
        """Call once the recipe's run() has returned. Logs (never raises) any
        unclosed step — the executor still guarantees a terminal event
        regardless, so this is diagnostic, not a failure.
        """
        for step_id, name in self._open_steps.items():
            logger.warning(
                "recipe emitted step start with no matching finish/error: id=%r name=%r",
                step_id,
                name,
            )
