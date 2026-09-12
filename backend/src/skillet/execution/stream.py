"""Turn a resolved run request into an `EventSourceResponse`-ready stream.

`run_event_stream` wraps `recipe-framework`'s `execute()` — reused directly,
never reimplemented — translating each `RecipeEvent` into a
`ServerSentEvent`, and guarantees three things regardless of how the stream
ends (the recipe finishes normally, raises, times out, breaches an output
cap, or the client disconnects mid-run):

1. Every log line produced anywhere during the run (this module, the
   executor, a recipe itself) is redacted, via `redaction_context`.
2. A terminal `ErrorEvent`'s (or any `LogEvent`'s) `.message` is redacted
   before it's ever serialized to the client — see
   `_redact_client_visible_message`.
3. The run's temp upload directory (`parsed.tempdir`, from
   `execution.request.parse_run_request`) is always removed.
"""

from __future__ import annotations

import shutil
from collections.abc import AsyncIterator, Mapping
from contextlib import aclosing

from sse_starlette import ServerSentEvent

from skillet.execution.keys import redact, redact_key_shaped_patterns, redaction_context
from skillet.execution.request import ParsedRunRequest
from skillet.recipe.context import FileBundle
from skillet.recipe.discovery import DiscoveredRecipe
from skillet.recipe.events import ErrorEvent, LogEvent, RecipeEvent
from skillet.recipe.executor import LoadedRecipe, execute


def _redact_client_visible_message(event: RecipeEvent, config: Mapping[str, str]) -> RecipeEvent:
    """Redact `.message` on `ErrorEvent`/`LogEvent` before it ever reaches
    the client.

    `execute()` builds a terminal `ErrorEvent(message=str(exc))` from
    whatever a recipe (or a library it calls, e.g. an HTTP client) raised,
    verbatim — if that string happens to contain a config secret (the
    classic case: an upstream API client's error message echoing back the
    key it was called with), it must never survive to the client. Per
    `SPEC-execution.md`'s "Never... put a key in... a log[,]... or error
    message" boundary — deliberately narrow to these two message-shaped
    fields, not every string a recipe returns: `ResultEvent.data`,
    `ToolCallEvent.args`/`.result`, and `ArtifactEvent.data` are a recipe's
    own intentional output and are left untouched.
    """
    if isinstance(event, ErrorEvent | LogEvent):
        redacted = redact_key_shaped_patterns(redact(event.message, config))
        if redacted != event.message:
            return event.model_copy(update={"message": redacted})
    return event


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
                    event = _redact_client_visible_message(event, parsed.config)
                    yield ServerSentEvent(data=event.model_dump_json())
    finally:
        shutil.rmtree(parsed.tempdir, ignore_errors=True)
