"""Builds the two `429` bodies `trial-limits` can produce, in the exact
shape `execution` renders: `frontend/lib/execution/rate-limit.ts`'s
`RateLimitPayload` zod schema —

```ts
export const RateLimitPayload = z.object({
  error: z.literal("rate_limited"),
  scope: z.enum(["trial_daily", "global_budget"]),
  message: z.string(),
  retry_after_seconds: z.number(),
  cta: z.enum(["add_key", "clone_local"]),
});
```

— read in full before writing this module, per docs/SPEC-trial-limits.md
Confirmed Decision 9: this module owns the *values*, `execution` owns the
*shape*. Every `429` this package raises must be built here — never
hand-assembled elsewhere (per the spec's own Boundaries).

Public API
----------
``trial_daily_error(retry_after_seconds: int) -> RateLimitPayload``
    This identity's own daily cap (IP and/or cookie counter) is over the
    limit, but the global budget still has headroom. ``cta: "add_key"`` —
    the direct unblock is the learner's own key, which sidesteps this
    module's per-identity cap entirely.

``global_budget_error(retry_after_seconds: int) -> RateLimitPayload``
    The global kill-switch has tripped: the author's whole day's trial
    budget is spent, regardless of this identity's own count.
    ``cta: "clone_local"`` — free capacity for *anyone* keyless is gone for
    the day, so the stronger nudge is running the project locally, though
    the message also mentions adding a key (BYOK is unaffected by this cap).

``seconds_until_next_utc_midnight(now: datetime | None = None) -> int``
    Shared helper for both constructors' callers (`gate.py`, a later task)
    to compute ``retry_after_seconds``: whole seconds remaining until the
    next UTC midnight, rounded up so a caller who waits the returned number
    of seconds is never left waiting *less* than the real reset moment.

Design decisions
-----------------
**A `TypedDict`, not a Pydantic model.** This codebase already has a
Pydantic convention for API response shapes (`api/schemas.py`'s
`CamelModel`), but that convention's whole point is to alias every field to
camelCase for `catalog`/`settings`' wire contract — exactly what this
payload must *not* do, since it mirrors `RateLimitPayload`'s plain snake_case
keys field-for-field. Basing a model here on `CamelModel` would silently
rename `retry_after_seconds` to `retryAfterSeconds` in the emitted JSON,
breaking the frontend's zod schema. A fresh `BaseModel` (not `CamelModel`)
would avoid that specific trap, but introduces a `model_dump()` call at
every use site and a class to keep in sync with the TS shape for no benefit
over a plain `dict`. A `TypedDict` gets the readable, checkable field list
`mypy`/IDEs want, is a plain `dict` at runtime with zero risk of any alias
generator ever touching it, and needs no `.model_dump()` before it can be
handed to `HTTPException(429, detail=...)` or `json.dumps`.

**Round up a partial second, floor to zero exactly at the boundary.**
`seconds_until_next_utc_midnight` special-cases `now` landing exactly on a
UTC midnight to return `0`: at that instant the reset has already happened,
so there is nothing left to wait for, and `86400` (a full day) would be a
strictly worse, misleading answer to hand a client as "how long until you
can retry." Every other instant rounds *up* (`math.ceil`) to the next whole
second: a client told to retry after ``retry_after_seconds`` must never
retry a moment *before* the actual reset, which a naive truncation
(``int(...)``) could do for e.g. 23:59:59.5 -> 0 (wrong: the reset is still
0.5s away) instead of the `1` this module returns.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Literal, TypedDict

TRIAL_DAILY_MESSAGE = (
    "You've used your free runs for today. Add your own API key or clone "
    "the project locally to keep going."
)
GLOBAL_BUDGET_MESSAGE = (
    "This app's free trial budget for today has been used up by everyone. "
    "Add your own API key, or clone the project locally to run without limits."
)


class RateLimitPayload(TypedDict):
    """Mirrors `frontend/lib/execution/rate-limit.ts`'s `RateLimitPayload`
    zod schema field-for-field. A `TypedDict` is a plain `dict` at runtime
    (see module docstring for why that matters here) — this exists purely
    for the type-checked field list, not for any runtime validation.
    """

    error: Literal["rate_limited"]
    scope: Literal["trial_daily", "global_budget"]
    message: str
    retry_after_seconds: int
    cta: Literal["add_key", "clone_local"]


def trial_daily_error(retry_after_seconds: int) -> RateLimitPayload:
    """This identity's own per-day cap is exceeded; the global budget still
    has headroom. See module docstring.
    """
    return {
        "error": "rate_limited",
        "scope": "trial_daily",
        "message": TRIAL_DAILY_MESSAGE,
        "retry_after_seconds": retry_after_seconds,
        "cta": "add_key",
    }


def global_budget_error(retry_after_seconds: int) -> RateLimitPayload:
    """The global kill-switch has tripped for every keyless-trial request
    today, regardless of this identity's own count. See module docstring.
    """
    return {
        "error": "rate_limited",
        "scope": "global_budget",
        "message": GLOBAL_BUDGET_MESSAGE,
        "retry_after_seconds": retry_after_seconds,
        "cta": "clone_local",
    }


def seconds_until_next_utc_midnight(now: datetime | None = None) -> int:
    """Whole seconds remaining until the next UTC midnight (00:00:00 the
    next day), for both `429` scopes' `retry_after_seconds` (the day-keyed
    counters and the budget counter all reset at that boundary).

    Accepts an optional ``now`` for testability; defaults to
    ``datetime.now(UTC)``. Exactly at a UTC midnight, returns ``0`` — see
    module docstring's Design decisions for why (already at the boundary,
    no more waiting). Every other instant rounds up to the next whole
    second, so a caller who waits ``retry_after_seconds`` never retries
    before the real reset.
    """
    current = now if now is not None else datetime.now(UTC)
    midnight_today = current.replace(hour=0, minute=0, second=0, microsecond=0)
    if current == midnight_today:
        return 0
    midnight_tomorrow = midnight_today + timedelta(days=1)
    return math.ceil((midnight_tomorrow - current).total_seconds())
