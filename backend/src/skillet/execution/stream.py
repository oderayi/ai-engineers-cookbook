"""Turn a resolved run request into an `EventSourceResponse`-ready stream.

`run_event_stream` wraps `recipe-framework`'s `execute()` — reused directly,
never reimplemented — translating each `RecipeEvent` into a
`ServerSentEvent`, and guarantees two things regardless of how the stream
ends (the recipe finishes normally, raises, times out, breaches an output
cap, or the client disconnects mid-run):

1. Every log line produced anywhere during the run (this module, the
   executor, a recipe itself) is redacted, via `redaction_context`.
2. The run's temp upload directory (`parsed.tempdir`, from
   `execution.request.parse_run_request`) is always removed.
"""

from __future__ import annotations

import shutil
from collections.abc import AsyncIterator
from contextlib import aclosing

from sse_starlette import ServerSentEvent

from skillet.execution.keys import redaction_context
from skillet.execution.request import ParsedRunRequest
from skillet.recipe.context import FileBundle
from skillet.recipe.discovery import DiscoveredRecipe
from skillet.recipe.executor import LoadedRecipe, execute


async def run_event_stream(
    recipe: DiscoveredRecipe,
    loaded: LoadedRecipe,
    parsed: ParsedRunRequest,
) -> AsyncIterator[ServerSentEvent]:
    """Execute `loaded` with `parsed.params`/`parsed.config`, yielding one
    `ServerSentEvent` per `RecipeEvent`.

    A client disconnect stops the response's own SSE machinery, which
    cancels the asyncio task driving this generator — the pending
    `CancelledError` unwinds through the `async with aclosing(...)` below,
    which explicitly `aclose()`s `execute()`'s generator (rather than
    relying on eventual garbage collection to do so), running *its* own
    `finally` block, which cancels the recipe's task and awaits it. Uses
    `aclosing` rather than a bare `async for` specifically so this
    cancellation-on-disconnect chain is deterministic, not
    GC-timing-dependent — see docs/SPEC-execution.md's success criterion 4.

    `files=FileBundle(recipe.dir)` is the recipe's own bundled `fixtures/`
    directory — unrelated to `parsed`'s uploaded files, which already live
    inside `parsed.params` as real `UploadedFile` field values (see
    `execution/request.py`).
    """
    try:
        with redaction_context(parsed.config):
            async with aclosing(
                execute(
                    loaded,
                    parsed.params,
                    config=parsed.config,
                    files=FileBundle(recipe.dir),
                )
            ) as events:
                async for event in events:
                    yield ServerSentEvent(data=event.model_dump_json())
    finally:
        shutil.rmtree(parsed.tempdir, ignore_errors=True)
