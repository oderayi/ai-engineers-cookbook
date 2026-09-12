"""Global daily spend counter and kill-switch.

Per docs/SPEC-trial-limits.md's Confirmed Decision 5, every *granted*
keyless-trial run charges a flat estimated cost to a single per-day Redis
counter (`trial:budget:{YYYYMMDD}`, UTC) **before** the executor starts —
real cost isn't known until a run finishes (or errors partway), and
charging pre-run closes the race where several concurrent requests could
all read "not exhausted yet" from a stale total. Once the running total
reaches or passes the daily budget, `gate.py` denies every further
keyless-trial request (`scope: "global_budget"`) regardless of any single
identity's own per-day count — the switch is global, not per-identity.
BYOK requests never touch this counter (Confirmed Decision 2) and are
unaffected by it.

Public API
----------
``is_exhausted(redis) -> bool``
    Whether today's recorded spend has already reached the daily budget.

``record_estimated_cost(redis, amount_micros=ESTIMATED_COST_MICROS_PER_RUN)``
    Charge a flat estimated cost to today's counter. Sets the key's TTL
    only on the call that creates it for the day, exactly like
    `counters.py`'s own `_bump`.

Design notes
------------
**Amounts are tracked in micros** (millionths of a dollar, i.e. `1_000_000`
micros == $1.00) so the whole module works in plain `int`s — no floating
point creeping into a value that gates real spend.

**`DAILY_BUDGET_MICROS` is a function (`_daily_budget_micros`), not a
module-level constant, and reads `SKILLET_TRIAL_DAILY_BUDGET_USD` fresh on
every call** rather than once at import time. This matches
`skillet.api.app.create_app`'s own convention for env-var-with-a-default
(`os.environ.get("SKILLET_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)`, read inside
the function body, not cached at module scope) and, unlike a module-level
constant, lets a test set/monkeypatch the env var and see the new cap take
effect immediately without reimporting this module.

**`COUNTER_TTL_SECONDS`**: `counters.py` (a parallel task in this same
package, building the per-identity daily counters) defines the identical
~25h TTL constant for its own keys. This module was started before
`counters.py` existed in the tree; by the time it was finished,
`counters.py` had landed with `COUNTER_TTL_SECONDS = 25 * 60 * 60`, so
rather than keep a second copy of the same literal, this module imports it
from there — one source of truth for the value, re-exported here (as
`budget.COUNTER_TTL_SECONDS`) so existing callers/tests referencing it via
this module keep working.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

from skillet.trial_limits.counters import COUNTER_TTL_SECONDS
from skillet.trial_limits.redis_client import UpstashRedis

__all__ = [
    "COUNTER_TTL_SECONDS",
    "ESTIMATED_COST_MICROS_PER_RUN",
    "is_exhausted",
    "record_estimated_cost",
]

ESTIMATED_COST_MICROS_PER_RUN = 50_000  # $0.05 flat assumption — see Open Questions

_DAILY_BUDGET_ENV_VAR = "SKILLET_TRIAL_DAILY_BUDGET_USD"
_DEFAULT_DAILY_BUDGET_USD = "5.00"


def _daily_budget_micros() -> int:
    """The global daily spend cap, in micros.

    Read fresh from `SKILLET_TRIAL_DAILY_BUDGET_USD` (default `"5.00"`) on
    every call — see the module docstring's "Design notes" for why this is
    a function rather than a constant computed at import time.
    """
    raw = os.environ.get(_DAILY_BUDGET_ENV_VAR, _DEFAULT_DAILY_BUDGET_USD)
    return int(round(float(raw) * 1_000_000))


def _budget_key() -> str:
    """The UTC-day-suffixed Redis key for today's global spend counter."""
    return f"trial:budget:{datetime.now(UTC):%Y%m%d}"


async def is_exhausted(redis: UpstashRedis) -> bool:
    """`True` once today's recorded spend has reached or passed the daily
    budget — the kill-switch every keyless-trial request must check before
    being granted (Confirmed Decision 5). `False` for a fresh/missing
    budget key (nothing spent yet today).
    """
    spent = await redis.get(_budget_key())
    return int(spent or 0) >= _daily_budget_micros()


async def record_estimated_cost(
    redis: UpstashRedis, amount_micros: int = ESTIMATED_COST_MICROS_PER_RUN
) -> None:
    """Charge a flat estimated cost to today's global spend counter.

    Called BEFORE the executor starts (Confirmed Decision 5): real cost is
    unknown until a run finishes, or errors out partway, and charging here
    — rather than after — closes the race where several concurrent requests
    could all read "not exhausted yet" before any of them completes.
    `EXPIRE` is set only on the call that creates the key for the day (its
    returned total equals `amount_micros`, i.e. this was the first write),
    never on a later call that only adds to an already-existing key.
    """
    key = _budget_key()
    total = await redis.incrby(key, amount_micros)
    if total == amount_micros:  # this call created the key
        await redis.expire(key, COUNTER_TTL_SECONDS)
