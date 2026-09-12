"""Redaction of config secret values from strings that may reach logs, error
messages, or on-disk artifacts.

A run's ``config: Mapping[str, str]`` (per docs/SPEC-execution.md) holds
client-supplied secrets — e.g. ``OPENAI_API_KEY`` — that the server accepts
verbatim and hands straight to a recipe. Nothing that touches logging, error
messages, or temp files may ever contain one of those raw values. This module
is the one place that redaction logic lives; callers (the execution API, the
SSE stream, etc.) import it rather than re-implementing substring scrubbing
themselves.

Public API
----------
``redact(text, config, *, placeholder=DEFAULT_PLACEHOLDER) -> str``
    Replace every occurrence of any non-empty value in ``config`` with
    ``placeholder`` inside ``text``. Returns a new string; never mutates
    ``text`` (strings are immutable) or ``config``.

``redact_exception(exc, config, *, placeholder=DEFAULT_PLACEHOLDER) -> str``
    Build a safe string representation of an exception (its type name plus
    ``str(exc)``, since ``str(exc)`` is the most likely place a secret leaks —
    e.g. an upstream API client echoing back the key it was called with) and
    run it through ``redact``.

``redaction_context(config)`` (context manager)
    Bind ``config`` as the *active run's* secrets for the duration of a
    ``with`` block, for any code that can't have ``config`` threaded through
    it directly (in particular, standard-library ``logging`` calls deep
    inside a recipe or a library it calls). Backed by a ``contextvars``
    variable, so it's correct across ``asyncio`` tasks without a request
    object needing to reach every log call site.

``RedactingFilter``
    A ``logging.Filter`` that reads the currently-bound config (via
    ``redaction_context``) and scrubs it from every log record's message
    before it's emitted. Attach it once (e.g. to the root logger, or to
    ``skillet``'s own logger) in Task 8's endpoint setup — every log line
    produced during a run's ``with redaction_context(config):`` block is
    then redacted automatically, without every call site needing to
    remember to call ``redact()`` itself.

``redact_key_shaped_patterns(text, *, placeholder=DEFAULT_PLACEHOLDER) -> str``
    Defense-in-depth: redact strings that merely *look* like API keys/tokens
    (long alphanumeric runs, common provider prefixes) even when they didn't
    come from this run's own ``config`` — e.g. a secret hardcoded in a
    third-party library's own error message. This is a heuristic, not a
    guarantee; ``RedactingFilter`` applies it in addition to (not instead of)
    exact ``config``-value redaction.

Design decisions
-----------------
**Empty-string values are never treated as a match.** ``config`` commonly
holds an empty string for an env var that was declared but not set. Naively
calling ``text.replace("", placeholder)`` would insert the placeholder
between every character of the string (Python's ``str.replace`` treats ``""``
as matching at every position), corrupting output that has nothing to do
with the missing secret. Empty values are filtered out before any
replacement happens.

**No minimum-length threshold is applied to non-empty values.** A very short
secret value (e.g. a single character, or a short numeric flag) has a real
chance of coincidentally matching ordinary text and redacting more than
intended. We considered adding a length floor (e.g. skip values under 6
chars) to avoid that collateral damage. We deliberately did NOT add one:
the one success criterion this module exists to satisfy is that a secret
value must never appear verbatim in logs/tempdir/errors, with no carve-out
for "short" secrets — a 4-digit PIN or a short shared token is still a
secret. Silently declining to redact it because it's short would be a
correctness regression dressed up as a UX nicety, and the caller (who knows
the actual sensitivity of what's in ``config``) has no way to know we made
that trade-off for them. The cost — an occasional coincidental match turning
ordinary log text into a placeholder — is judged strictly less harmful than
a leaked credential. Callers who need different behavior for known-short,
known-safe config keys should filter their own config mapping before
calling in; this module always redacts every non-empty value it's given.

**Longer values are redacted before shorter ones.** If one config value is a
substring of another (e.g. ``"sk-abc"`` and ``"sk-abc-xyz"``), replacing the
shorter one first would consume only that fragment out of every occurrence
of the longer secret, leaving the remainder exposed — e.g. redacting
``"sk-abc"`` out of ``"...sk-abc-xyz..."`` first leaves
``"...***REDACTED***-xyz..."``, and the ``-xyz`` suffix of the longer secret
is still visible in the log. Sorting non-empty values by descending length
before replacing guarantees the longest (most specific) match is consumed
first at any given position, so no substring of any secret value can survive
in the output. After the longer value is fully replaced, the shorter value
is still redacted wherever *it* appears on its own (its occurrences as part
of the now-already-replaced longer secret are gone, so there is nothing left
for the shorter pass to accidentally re-expose).

**Safe to call with no config.** An empty (or absent-in-spirit, i.e. ``{}``)
config mapping makes ``redact``/``redact_exception`` a no-op — the input is
returned unchanged.

**Read-only.** Neither function mutates or copies ``config`` destructively;
values are only read to build a local, throwaway list of strings to search
for.
"""

import contextvars
import logging
import re
from collections.abc import Iterator, Mapping
from contextlib import contextmanager

DEFAULT_PLACEHOLDER = "***REDACTED***"

# Common API-key/token *shapes* — provider-prefixed tokens (sk-..., xox...)
# and generic long alphanumeric runs (>= 20 chars, the length of a typical
# API key/JWT segment) that plausibly hold a secret even when it isn't one
# of this run's own declared config values. Heuristic and best-effort: it
# will occasionally miss a real secret in an unusual shape, and could in
# theory redact an innocuous long identifier — both are acceptable given the
# "no secret ever appears verbatim" bar this module exists to satisfy (see
# the "No minimum-length threshold" reasoning below, same trade-off).
_KEY_SHAPED_PATTERN = re.compile(
    r"\b(?:sk-|sk_|pk_|xox[baprs]-|ghp_|gho_)[A-Za-z0-9_-]{10,}\b|\b[A-Za-z0-9_-]{20,}\b"
)

_current_config: contextvars.ContextVar[Mapping[str, str] | None] = contextvars.ContextVar(
    "skillet_execution_current_config", default=None
)


def redact(text: str, config: Mapping[str, str], *, placeholder: str = DEFAULT_PLACEHOLDER) -> str:
    """Return ``text`` with every occurrence of any non-empty value in
    ``config`` replaced by ``placeholder``.

    - Empty-string config values are ignored (never "redacted") — see module
      docstring.
    - No minimum-length threshold is applied to non-empty values — see
      module docstring.
    - Values are redacted longest-first so a value that is a substring of
      another present value cannot leave a partial fragment of the longer
      secret exposed — see module docstring.
    - Safe with an empty/missing ``config`` ({}): returns ``text`` unchanged.
    - Does not mutate or copy ``config``; ``text`` is returned as a new
      string (or as-is) per normal Python string semantics.
    """
    if not text or not config:
        return text

    secret_values = sorted({value for value in config.values() if value}, key=len, reverse=True)

    for value in secret_values:
        if value in text:
            text = text.replace(value, placeholder)

    return text


def redact_exception(
    exc: BaseException,
    config: Mapping[str, str],
    *,
    placeholder: str = DEFAULT_PLACEHOLDER,
) -> str:
    """Return a redacted string representation of ``exc``, safe to log.

    Combines the exception's type name with ``str(exc)`` — the latter being
    the most likely place a secret leaks (e.g. an upstream API client's error
    message echoing back the key it was called with) — and runs the result
    through ``redact``.
    """
    unsafe = f"{type(exc).__name__}: {exc}"
    return redact(unsafe, config, placeholder=placeholder)


def redact_key_shaped_patterns(text: str, *, placeholder: str = DEFAULT_PLACEHOLDER) -> str:
    """Redact substrings that merely *look* like an API key/token, per
    ``_KEY_SHAPED_PATTERN`` — defense in depth for secrets that never passed
    through this run's own ``config`` mapping (e.g. baked into a library's
    own error message). Heuristic; see module docstring.
    """
    if not text:
        return text
    return _KEY_SHAPED_PATTERN.sub(placeholder, text)


@contextmanager
def redaction_context(config: Mapping[str, str]) -> Iterator[None]:
    """Bind ``config`` as the active run's secrets for ``RedactingFilter``
    for the duration of this ``with`` block (and any ``asyncio`` task spawned
    from within it — ``contextvars`` propagate across task creation).

    Use this around the code that executes one run (Task 8's endpoint,
    wrapping its call into ``recipe-framework``'s ``execute()``) so that any
    ``logging`` call made anywhere underneath — including inside a recipe or
    a library it calls — gets redacted automatically, without that code
    needing to import this module or call ``redact()`` itself.
    """
    token = _current_config.set(dict(config))
    try:
        yield
    finally:
        _current_config.reset(token)


class RedactingFilter(logging.Filter):
    """A ``logging.Filter`` that redacts the active run's config secret
    values (bound via ``redaction_context``) — plus key-shaped patterns, per
    ``redact_key_shaped_patterns`` — from every log record's message before
    it's emitted.

    Attach an instance to a logger or handler once (e.g. the root logger, or
    ``logging.getLogger("skillet")``) at process start; it is a no-op
    outside of a ``redaction_context`` block (no config bound → nothing to
    redact against, though the key-shaped heuristic still applies
    regardless, since it doesn't depend on any bound config).

    Rewrites ``record.msg`` to the fully-formatted, redacted message and
    clears ``record.args`` — logging formats ``msg % args`` lazily, and
    redacting only ``record.msg`` while leaving ``record.args`` in place
    would let a secret passed as a ``%s`` argument survive untouched.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        config = _current_config.get() or {}
        if config:
            message = redact(message, config)
        message = redact_key_shaped_patterns(message)
        record.msg = message
        record.args = ()
        return True
