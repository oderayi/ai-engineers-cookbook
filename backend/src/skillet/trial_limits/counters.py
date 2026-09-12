"""Per-identity daily trial-run counters (`INCR` + `EXPIRE` on a UTC-day-
suffixed key), matching docs/SPEC-trial-limits.md's Confirmed Decisions 3-4
and its own Code Style sample for this module almost verbatim.

Two independent counters are bumped per request — one keyed by a hash of the
client's IP, one keyed by the signed anonymous-id cookie (see
`identity.Identity`) — and a request is allowed only when **both** are still
within `DAILY_TRIAL_CAP` after incrementing. Both counters are bumped
unconditionally, including on a request that ends up denied: this is the
"casual limiting" design from Confirmed Decision 3 (a denied attempt still
counts against the day's cap), not a bug to "fix" later.

No cron, no explicit reset job: the UTC day boundary is baked into the key
name itself (`...:{YYYYMMDD}`), and `EXPIRE` — set only on the increment that
returns `1`, i.e. that key's first write of the day — cleans the key up on
its own with a generous ~25h buffer past midnight for clock skew.

**`DAILY_TRIAL_CAP` is read from `SKILLET_TRIAL_DAILY_CAP` at call time, not
import time.** The spec's own Code Style sample binds it as a module-level
constant (`DAILY_TRIAL_CAP = 2`) evaluated once at import. That would make it
impossible for a test to `monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", ...)`
and see the change take effect without reimporting the module — awkward in a
suite that reimports nothing between tests. `skillet.api.app.create_app`
establishes the convention this module follows instead: read the env var
with `os.environ.get(...)` inside the function that needs it (there, inside
`create_app`; here, inside `_daily_trial_cap()`, called fresh on every
`increment_and_check`), so the default is still `2` but a changed env var is
picked up on the very next call.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

from skillet.trial_limits.identity import Identity
from skillet.trial_limits.redis_client import UpstashRedis

COUNTER_TTL_SECONDS = 25 * 60 * 60  # generous buffer past UTC midnight


def _daily_trial_cap() -> int:
    """`SKILLET_TRIAL_DAILY_CAP`, default `2` — read fresh on every call (see
    module docstring) so a changed env var takes effect without reimporting.
    """
    return int(os.environ.get("SKILLET_TRIAL_DAILY_CAP", "2"))


def _day_key(scope: str, ident: str) -> str:
    """`trial:count:{scope}:{ident}:{YYYYMMDD}` (UTC) — the UTC day suffix is
    what makes the counter self-resetting: a new day is simply a new key.
    """
    day = datetime.now(UTC).strftime("%Y%m%d")
    return f"trial:count:{scope}:{ident}:{day}"


async def _bump(redis: UpstashRedis, key: str) -> int:
    """`INCR key`, setting `EXPIRE` only on the increment that returns `1`
    (that key's first write of the day) so a later increment within the
    same day never resets or extends the TTL unnecessarily.
    """
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, COUNTER_TTL_SECONDS)
    return count


async def increment_and_check(redis: UpstashRedis, identity: Identity) -> bool:
    """Bumps both the `ip` and `cookie` scoped counters for `identity`
    unconditionally, then returns `True` only if **both** are still within
    `DAILY_TRIAL_CAP` after incrementing.

    Both counters are always bumped — even when the result will be a denial
    — matching the "casual limiting" posture: a denied attempt still counts
    against the day's cap for both signals.
    """
    cap = _daily_trial_cap()
    ip_count = await _bump(redis, _day_key("ip", identity.ip_hash))
    cookie_count = await _bump(redis, _day_key("cookie", identity.anon_id))
    return ip_count <= cap and cookie_count <= cap
