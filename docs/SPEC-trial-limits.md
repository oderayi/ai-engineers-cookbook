# Spec: trial-limits

Module id: `trial-limits` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-11**.
Depends on: `execution`.

## Objective

Gate `execution`'s run endpoint so a learner with no API key can still run
recipes for free, within limits the author can actually afford.

- **What:** a request-preprocessing step in front of `POST /recipes/{slug}/run`
  that decides, per request, whether the client already supplied its own key
  (BYOK — no gating), or needs the author's key (keyless trial — apply the
  daily per-identity cap and the global spend kill-switch); the signed
  anonymous-id cookie that identifies a browser without accounts; the Upstash
  Redis counters behind both caps; and the server-side injection of the
  author's key into the resolved config for exactly the runs it grants.
- **Why:** the intent's whole "zero setup" promise depends on the author's own
  key absorbing the first taste of every new visitor — bounded tightly enough
  that it can't become an unbounded bill, and cleanly separated from BYOK so a
  learner who brings their own key is never throttled by someone else's usage.
- **User:** the learner running a recipe with no key set (the ~90% first-touch
  case the intent is built around); the author, whose wallet this module
  protects; `execution`, which this module wraps and whose `429` contract it
  fills in.
- **Success:** a fresh browser gets its 1–2 keyless runs, then a `429` with a
  clear nudge; a learner who has set their own key never hits this module's
  caps; the global kill-switch, once tripped, blocks every further keyless run
  regardless of per-identity count; the author's key never appears in a
  response, a log line, or a client-visible error.

## Scope

**In:** issuing and verifying the signed anonymous-id cookie; the
IP+cookie rate-limit identity and its Redis-backed daily counters; the global
daily spend counter and kill-switch; the BYOK-vs-keyless-trial decision (does
the client-sent `config` already satisfy the recipe's *required* env keys);
resolving and injecting the author's trial key into the request's config for
exactly the missing required keys, server-side, only when a trial run is
granted; producing the `429` body in the exact shape `execution` already
defines; the FastAPI dependency that plugs this into the run route.

**Out:** the run endpoint, request parsing, SSE streaming, upload handling,
and the `429` *shape* / rendering (`execution` — this module only decides the
*values* that go into it); the executor, timeout, and output caps
(`recipe-framework`); how a learner's own key gets into `config` in the first
place, or the merge/inheritance policy (`settings` — this module only reads
the already-resolved `config` map `execution` hands it); user accounts, login,
or any cross-device identity (explicitly out for v1 — see intent); any admin
UI for spend monitoring beyond structured logs (see Open Questions); rate
limiting anything other than the run endpoint (browsing, source viewing, and
the catalog API are unmetered per intent).

## Confirmed decisions

1. **A dependency in front of the route, not a new route.** `trial-limits`
   ships one FastAPI dependency, `gate_trial_run`, that `execution`'s
   `POST /recipes/{slug}/run` calls after parsing the request and before
   invoking the executor. It returns a `TrialDecision` (grant, with a
   possibly-augmented config) or raises the `429`. `execution` owns the route;
   this module owns the decision.
2. **The gating question is: does `config` already satisfy every *required*
   env key the recipe declares?** For each `recipe.env` entry with
   `required = true`, check whether the client-sent `config` has a non-empty
   value for it (the same map `settings.resolveConfig` already produced).
   - **All required keys present → pure BYOK.** Skip every check in this
     module (no Redis round-trip, no cookie check) and pass `config` through
     unchanged. BYOK runs are unlimited by this module — still bounded by
     `execution`'s own timeout/output caps, never by the trial cap or the
     spend cap.
   - **Any required key missing → keyless-trial candidate.** The recipe needs
     the author's key for at least one required env var, so the *whole run* is
     gated: the daily per-identity cap and the global budget both apply before
     it's allowed to proceed. Any *other* key the client did supply (a
     required key it does have, or an optional one) is left untouched in
     `config` — only the missing required key(s) are filled from the author's
     side. This keeps BYOK and trial strictly non-overlapping per key without
     forcing an all-or-nothing rule across a recipe's whole env list.
3. **Identity without accounts: a signed cookie + IP, both independently
   capped.** On first visit (cookie absent or fails verification), the
   dependency issues `sk_aid`: an HMAC-SHA256-signed opaque anonymous id,
   `httpOnly`, `Secure`, `SameSite=Lax`, 1-year `Max-Age`. The rate-limit
   identity is **both** `sha256(ip)` and the cookie's anonymous id, each
   incrementing its **own** Redis counter; a request is allowed only if
   **both** counters are still under the daily cap after incrementing.
   - **Tradeoff, accepted:** requiring both independently (rather than a
     single combined hash) means a shared IP — an office, a campus, a NAT —
     shares its IP-side budget across every learner behind it, so one heavy
     user can cost a neighbor their trial run early. Accepted because this is
     explicitly *casual* limiting (per intent): the failure mode is "add a key
     or clone locally" either way, and the alternative (cookie-only) is
     trivially bypassed by clearing cookies. Requiring both raises the bar to
     "clear cookies **and** get a new IP," which is enough friction that
     anyone clearing it is better served by cloning the repo anyway — the
     accepted outcome.
4. **Redis key scheme: `INCR` + `EXPIRE` on a UTC-day-suffixed key, self
   expiring.** No cron, no explicit reset job — the day boundary is baked into
   the key name (`...:{YYYYMMDD}` in UTC) and the key's own TTL cleans it up.
   `EXPIRE` is set only on the increment that returns `1` (the key's first
   write that day), to a generous ~25h so clock skew never drops a live
   counter early.
5. **Global kill-switch: a single per-day spend counter, `INCRBY` before the
   run, compared to a hard budget.** Every *granted* keyless-trial run adds an
   estimated cost (see decision 6) to `trial:budget:{YYYYMMDD}` **before** the
   executor starts, not after — real cost isn't known until the run finishes
   streaming, and charging pre-run means the kill-switch can't be raced past
   by concurrent requests that all see "not exhausted yet" from a stale read.
   When the running total is at or over the daily USD budget, **every**
   keyless-trial request is rejected with `scope: "global_budget"`, regardless
   of that identity's own per-day count — the switch is global, not per-user.
   BYOK requests never touch this counter and are never affected by it.
6. **Approximate cost = a flat per-run assumption, not a token count.** Real
   token usage isn't known until the recipe finishes (and may error out
   partway), so the budget is charged a fixed estimated-cost constant per
   granted trial run at grant time (a conservative flat number, not measured
   post-hoc). The exact figure, and whether it should vary per recipe by
   typical token volume, is an Open Question below — the mechanism (charge a
   fixed estimate up front via `INCRBY`) is decided; the number is not.
7. **The author's key is injected here, and only here, as the one exception to
   `execution`'s "server never computes config" rule.** `execution`'s
   Confirmed Decision 2 says the server accepts only the config the client
   already resolved. `trial-limits` does not violate that: it runs as a
   preprocessing step *before* `execution` builds `ctx.config`, and the only
   thing it ever adds is the author's own trial key, read from an environment
   variable on the backend, for exactly the required env key(s) the client's
   `config` was missing, and only on requests this module itself has just
   decided to grant. It never alters, drops, or looks at any value the client
   *did* send. The author's key is resolved via a small provider→env-var map
   (e.g. `openai` → `SKILLET_TRIAL_OPENAI_API_KEY`) so adding a second
   provider's trial key later is a one-line addition, not a new code path.
8. **The injected key rides in the same `ResolvedConfig` `execution` already
   redacts.** Because injection happens before `ctx.config` is built, the
   author's key is covered by `execution`'s existing request-scoped-only
   handling and log-redaction filter with zero new plumbing — `trial-limits`
   does not implement its own redaction, it relies on and is covered by
   `execution`'s (verified by this module's own key-hygiene test, mirroring
   `execution`'s).
9. **`429` values this module owns (shape is fixed by `execution`):**
   - `scope: "trial_daily"` when this identity's own counter(s) are over cap
     but the global budget is fine; `cta: "add_key"` — the direct unblock is
     the learner's own key, which sidesteps this module entirely.
   - `scope: "global_budget"` when the kill-switch has tripped; `cta:
     "clone_local"` — at that point the free capacity for *anyone* keyless is
     gone for the day, so the stronger nudge is "run it locally," even though
     adding a key would also work (BYOK is unaffected by the global cap); the
     message text may still mention both.
   - `retry_after_seconds` = seconds remaining until the next UTC midnight in
     both scopes (when the day-keyed counters and the budget counter all
     reset).
10. **Never persist the author's key client-visibly, and never mix pools.**
    Injection only happens on a request this module decided to grant; a
    denied request never sees `ctx.config` built at all (the `429` is raised
    before `execution`'s handler runs). A BYOK request never reads the
    author's key env var. A keyless-trial request never reads or writes
    anything under the learner's own key.
11. **No trial key configured → this module is a no-op (`distribution`
    amendment, approved 2026-09-11).** `gate_trial_run` short-circuits to
    "BYOK required, no gating" whenever no provider has a configured
    `SKILLET_TRIAL_*_API_KEY` — the default for local/self-hosted clones. It
    never calls Redis or issues the anonymous cookie in that case. A request
    still missing a required key then fails with `execution`'s ordinary `422`
    validation error, not a `429` — there is no free trial to gate when none is
    funded. This is what makes "clone locally, run without limits" true without
    a second code path.

## Tech Stack

- Python **3.12+**, FastAPI, Pydantic v2, `uv` — same backend stack as
  `recipe-framework` / `execution`; this module adds no new framework, only a
  dependency and a small package.
- **Upstash Redis via its REST API** (not the binary protocol) — chosen in the
  interview for atomic `INCR`/`INCRBY` + `EXPIRE`, and because a plain HTTPS
  call fits Render's free tier and any future serverless split without a
  persistent connection. Called with `httpx.AsyncClient` (already a
  transitive dep via `sse-starlette`'s ecosystem) rather than the `upstash-
  redis` SDK, to keep the surface area to the three commands actually used.
- `hmac` + `secrets` (stdlib) for cookie signing — no new dependency for
  something this small; `itsdangerous` is an alternative if the signing
  format needs to grow (e.g. embedding an issue timestamp for rotation).
- `pytest` + `pytest-asyncio` (existing); `respx` to mock the Upstash REST
  calls in unit tests without a live Redis; `time-machine` to freeze/advance
  time across the UTC day boundary in counter and budget tests.

## Commands

Inherits `recipe-framework` / `execution`'s (`uv run ...`); no new commands.

```
Install:      uv sync
Dev server:   uv run fastapi dev src/skillet/api/app.py
Test:         uv run pytest
Test + cov:   uv run pytest --cov=skillet.trial_limits --cov-report=term-missing
Lint:         uv run ruff check
Format:       uv run ruff format
```

New environment variables this module reads (documented fully in
`distribution`, listed here for reference):

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SKILLET_TRIAL_COOKIE_SECRET        # HMAC key for sk_aid
SKILLET_TRIAL_OPENAI_API_KEY       # the author's own key, provider-specific
SKILLET_TRIAL_DAILY_CAP            # default 2
SKILLET_TRIAL_DAILY_BUDGET_USD     # default 5.00
```

## Project Structure

```
backend/src/skillet/
  trial_limits/
    __init__.py
    cookie.py            # sign/verify sk_aid, Set-Cookie construction
    identity.py          # Identity: ip_hash + anon_id, derived from Request
    redis_client.py      # thin async Upstash REST wrapper: incr/incrby/expire/get
    counters.py          # per-identity daily trial-run counter (INCR+EXPIRE)
    budget.py            # global daily spend counter + kill-switch check
    author_key.py        # provider -> author trial-key env var resolution
    contract.py          # builds the 429 body execution renders
    gate.py              # gate_trial_run(): the FastAPI dependency, ties it together
  api/
    run.py               # (execution's file) adds Depends(gate_trial_run)

backend/tests/trial_limits/
  test_cookie.py
  test_identity.py
  test_counters.py       # INCR/EXPIRE correctness, day-boundary reset
  test_budget.py         # kill-switch trip/reset, INCRBY accumulation
  test_gate.py           # BYOK bypass, partial-config injection, 429 values
  test_key_hygiene.py    # mirrors execution's — author key never leaks
```

## Code Style

The Redis key scheme and counter logic (`counters.py`):

```python
from datetime import UTC, datetime

from skillet.trial_limits.redis_client import UpstashRedis

DAILY_TRIAL_CAP = 2  # SKILLET_TRIAL_DAILY_CAP default
COUNTER_TTL_SECONDS = 25 * 60 * 60  # generous buffer past UTC midnight


def _day_key(scope: str, ident: str) -> str:
    day = datetime.now(UTC).strftime("%Y%m%d")
    return f"trial:count:{scope}:{ident}:{day}"


async def _bump(redis: UpstashRedis, key: str) -> int:
    count = await redis.incr(key)
    if count == 1:  # first write of the day for this key — start its TTL
        await redis.expire(key, COUNTER_TTL_SECONDS)
    return count


async def increment_and_check(redis: UpstashRedis, identity: "Identity") -> bool:
    """Bumps both counters unconditionally (a denied attempt still counts,
    matching the 'casual limiting' posture), then requires BOTH to be
    within cap."""
    ip_count = await _bump(redis, _day_key("ip", identity.ip_hash))
    cookie_count = await _bump(redis, _day_key("cookie", identity.anon_id))
    return ip_count <= DAILY_TRIAL_CAP and cookie_count <= DAILY_TRIAL_CAP
```

The global spend counter and kill-switch (`budget.py`):

```python
DAILY_BUDGET_MICROS = 5_000_000       # SKILLET_TRIAL_DAILY_BUDGET_USD default ($5.00)
ESTIMATED_COST_MICROS_PER_RUN = 50_000  # $0.05 flat assumption — see Open Questions


def _budget_key() -> str:
    return f"trial:budget:{datetime.now(UTC):%Y%m%d}"


async def is_exhausted(redis: UpstashRedis) -> bool:
    spent = await redis.get(_budget_key())
    return int(spent or 0) >= DAILY_BUDGET_MICROS


async def record_estimated_cost(
    redis: UpstashRedis, amount_micros: int = ESTIMATED_COST_MICROS_PER_RUN
) -> None:
    """Charged BEFORE the executor starts — real cost is unknown until the
    run finishes (or errors partway), and pre-charging closes the race where
    concurrent requests all read 'not exhausted yet'."""
    key = _budget_key()
    total = await redis.incrby(key, amount_micros)
    if total == amount_micros:  # this call created the key
        await redis.expire(key, COUNTER_TTL_SECONDS)
```

Cookie signing (`cookie.py`) — HMAC over an opaque random id, no PII, no
accounts to tie it to:

```python
import hashlib
import hmac
import secrets

COOKIE_NAME = "sk_aid"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


def issue(secret: bytes) -> str:
    anon_id = secrets.token_urlsafe(16)
    sig = hmac.new(secret, anon_id.encode(), hashlib.sha256).hexdigest()
    return f"{anon_id}.{sig}"


def verify(cookie_value: str, secret: bytes) -> str | None:
    try:
        anon_id, sig = cookie_value.split(".", 1)
    except ValueError:
        return None
    expected = hmac.new(secret, anon_id.encode(), hashlib.sha256).hexdigest()
    return anon_id if hmac.compare_digest(sig, expected) else None
```

The author-key resolution (`author_key.py`) — the one place this module reads
the author's own secret, and only ever writes it into a request-scoped dict:

```python
import os

TRIAL_KEY_ENV = {"openai": "SKILLET_TRIAL_OPENAI_API_KEY"}


class TrialUnavailable(Exception):
    """Raised when this deployment has no author trial key for a provider —
    treated as scope='global_budget' (fail closed, not an internal 500)."""


def resolve(provider: str) -> str:
    env_name = TRIAL_KEY_ENV.get(provider)
    value = env_name and os.environ.get(env_name)
    if not value:
        raise TrialUnavailable(provider)
    return value


def any_trial_key_configured() -> bool:
    """False on a local/self-hosted clone with no SKILLET_TRIAL_* set —
    the signal `gate_trial_run` uses to become a no-op (distribution amendment)."""
    return any(os.environ.get(env) for env in TRIAL_KEY_ENV.values())
```

The dependency that ties it together (`gate.py`) — everything above, called
once per run request, before `execution`'s executor starts:

```python
from dataclasses import dataclass

from fastapi import HTTPException, Request

from skillet.trial_limits import author_key, budget, contract, counters
from skillet.trial_limits.identity import Identity


@dataclass
class TrialDecision:
    config: dict[str, str]  # unchanged (BYOK) or augmented (trial granted)


async def gate_trial_run(recipe, parsed_config: dict[str, str], request: Request) -> TrialDecision:
    missing_required = [
        env for env in recipe.env
        if env.required and not parsed_config.get(env.key, "").strip()
    ]
    if not missing_required or not author_key.any_trial_key_configured():
        # Pure BYOK, or a local/self-hosted deployment with no trial key funded:
        # pass through unchanged. If a required key is still missing in the
        # latter case, execution's own Params validation raises the ordinary
        # 422 — there's no trial to gate when none is configured.
        return TrialDecision(config=parsed_config)

    redis = request.app.state.trial_redis
    if await budget.is_exhausted(redis):
        raise HTTPException(429, contract.global_budget_error().model_dump())

    identity = Identity.from_request(request, secret=request.app.state.cookie_secret)
    if not await counters.increment_and_check(redis, identity):
        raise HTTPException(429, contract.trial_daily_error().model_dump())

    try:
        augmented = dict(parsed_config)
        for env in missing_required:
            augmented[env.key] = author_key.resolve(env.provider)
    except author_key.TrialUnavailable:
        raise HTTPException(429, contract.global_budget_error().model_dump()) from None

    await budget.record_estimated_cost(redis)
    return TrialDecision(config=augmented)
```

Conventions: `snake_case` functions, `ruff`-formatted, fully typed, `async def`
throughout to match `execution`; no module here imports from `skillet.recipe`
directly — it only sees the recipe's `env` declarations and the already-parsed
`config` map `execution` hands it.

## Testing Strategy

- **Counter logic (the important one):** `INCR` returns `1` on a key's first
  write and `EXPIRE` is set exactly then, not on subsequent increments;
  `time-machine` advances the clock past UTC midnight and asserts a fresh
  `INCR` on the new day's key starts at `1` (the old key's TTL is irrelevant
  once the suffix rolls over); a request at the cap is denied, one under is
  allowed, and a denied attempt still increments (matches the "casual
  limiting" design, asserted explicitly so it isn't "fixed" by accident later).
- **BYOK bypasses the daily cap:** a request whose `config` already satisfies
  every required env key never calls Redis at all (assert via a mock that
  raises if called) and is never denied regardless of how exhausted the
  counters or budget are; a request satisfying *some but not all* required
  keys is still gated, and the granted config keeps the client-supplied
  value(s) untouched while only the missing key(s) are filled in.
- **No-trial-key deployment (`distribution`'s carve-out):** with every
  `SKILLET_TRIAL_*_API_KEY` unset, a request missing a required key is passed
  through untouched (no Redis call, no cookie issued) and fails at
  `execution`'s ordinary `Params` validation with `422`, never `429`; setting
  any one trial-key env var re-enables normal gating behavior for that
  provider.
- **Global kill-switch:** `record_estimated_cost` accumulating past
  `DAILY_BUDGET_MICROS` flips `is_exhausted` to `True`; once exhausted, every
  keyless-trial request is denied with `scope: "global_budget"` regardless of
  a fresh identity's own zero count; a BYOK request is unaffected by an
  exhausted budget; the budget key resets at the UTC day boundary same as the
  per-identity counters.
- **Cookie signing/verification:** a value this module issued verifies and
  recovers the same `anon_id`; a tampered signature, a missing separator, and
  an empty string all fail verification (return `None`, never raise); a
  request with no cookie gets one issued and set (`httpOnly`, `Secure`,
  `SameSite=Lax`, ~1-year `Max-Age`) on the response.
- **Key hygiene (mirrors `execution`'s approach):** run the gate with a
  sentinel value in `SKILLET_TRIAL_OPENAI_API_KEY`; assert the sentinel never
  appears in a `429` body, in any log line emitted during gating, or in any
  exception raised by `author_key.resolve` when the env var is unset — a CI
  step greps captured test/log output for the sentinel and fails on a hit,
  same as `execution`'s log-grep step.
- **Endpoint-level (`test_gate.py`), via `execution`'s route with this
  dependency wired in:** unauthenticated first hit sets the cookie; the same
  identity's 3rd keyless request in a day (with `DAILY_TRIAL_CAP=2` in test
  config) gets `429` with `scope: "trial_daily"`, `cta: "add_key"`; an
  identity under cap but a pre-exhausted global budget gets `429` with
  `scope: "global_budget"`, `cta: "clone_local"`; `retry_after_seconds` in
  both matches seconds-to-next-UTC-midnight within a small tolerance.
- Target **≥ 90% line coverage** on `src/skillet/trial_limits/` — this is the
  module standing between the product and an unbounded API bill.

## Boundaries

**Always**
- Check whether `config` already satisfies the recipe's required env keys
  *before* touching Redis or the cookie — BYOK must never pay the Redis
  round-trip or be subject to any counter.
- Charge the estimated cost to the global budget **before** the executor
  starts, never after (closes the pre-run race between concurrent requests).
- Run every `429` body through `contract.py` so the shape always matches what
  `execution` defines — never hand-build the JSON elsewhere.
- Keep the author's key inside the same request-scoped config object
  `execution` already redacts from logs; never write it anywhere else
  (no new log line, no new store).
- Sign the anonymous-id cookie; never trust an unsigned or unverified value as
  an identity.

**Ask first**
- Changing the `429` values' meaning (e.g. swapping which `cta` maps to which
  `scope`) — `execution`'s renderer and `catalog`/`workspace` copy assume the
  current mapping.
- Adding a second identity signal beyond IP + cookie (e.g. a browser
  fingerprint) — a real precision/privacy tradeoff, not a tuning knob.
- Changing the Redis key scheme or the cookie's signed format in a way that
  isn't backward-compatible with keys/cookies already live in production.
- Adding a provider to `TRIAL_KEY_ENV` (a new author-funded secret to manage).

**Never**
- Let a BYOK request read the author's trial key, or a keyless-trial request
  read a learner's own key — the two pools never mix.
- Return the author's key, or any Redis/cookie internals, in a response body,
  header, log line, metric, or exception message.
- Apply the daily trial cap or the global budget to a request whose `config`
  already satisfies the recipe's required env keys.
- Skip charging the global budget for a granted keyless run, even when the
  per-identity counters have headroom — every granted trial run counts against
  the global cap.
- Persist the author's key anywhere but the backend's own environment
  variable (no Redis, no DB, no file).

## Success Criteria

1. A fresh browser (no cookie) can run a recipe requiring a key it hasn't set,
   up to `SKILLET_TRIAL_DAILY_CAP` times in a UTC day, using the author's key
   server-side — proven end-to-end through `execution`'s route.
2. The next keyless request that day from the same identity gets exactly the
   `429` shape `execution` defines, with `scope: "trial_daily"`,
   `cta: "add_key"`, and a `retry_after_seconds` accurate to the next UTC
   midnight.
3. A request whose `config` already satisfies every required env key is never
   denied and never touches Redis, regardless of that identity's or the
   global budget's state — proven by a mock that fails the test if Redis is
   called.
4. Once the global daily budget is exhausted, every keyless-trial request —
   from any identity, including ones with zero prior runs — is denied with
   `scope: "global_budget"`, `cta: "clone_local"`, while BYOK requests
   continue to succeed.
5. A sentinel value in the author's trial-key env var never appears in a
   response, log line, or exception across the full test suite — enforced by
   a CI log-grep, mirroring `execution`'s key-hygiene guarantee.
6. A cookie this module issues verifies correctly; a tampered or malformed
   cookie value is rejected and a fresh one is issued, never trusted as an
   existing identity.
7. Both the per-identity counters and the global budget counter reset
   automatically at the UTC day boundary with no manual intervention (proven
   by a time-travelled test, not just documented behavior).

## Open Questions

1. ~~Exact daily trial cap.~~ **Resolved: 2 runs/day/identity**
   (`SKILLET_TRIAL_DAILY_CAP=2`), adjustable via env var without a spec change.
2. ~~Exact global daily USD budget.~~ **Resolved: $5.00/day**
   (`SKILLET_TRIAL_DAILY_BUDGET_USD=5.00`), adjustable via env var. Revisit
   upward once real per-run cost data exists.
3. **How "approximate cost" is estimated pre-run.** A single flat constant for
   all recipes, or a per-recipe constant (a RAG recipe likely costs more per
   run than a short single-turn one)? Where would a per-recipe estimate live
   — `recipe.toml`, or a table maintained in this module?
4. **Admin override / reset for the kill-switch.** Right now the only way to
   un-trip it early is to delete the day's Redis key by hand. Does v1 need a
   protected endpoint or CLI command to reset or raise the budget mid-day
   (e.g. after a viral spike the author is happy to fund)?
5. **Timezone for "daily."** UTC is assumed throughout this spec (simplest,
   matches Redis key suffixing) — confirm that's acceptable even though it
   means the reset moment doesn't align with the author's or most learners'
   local midnight.
6. **What happens to an in-flight run when the kill-switch trips mid-stream.**
   Decision 5 charges the budget at grant time, before the executor starts, so
   a run already streaming keeps going even if a *later* request finds the
   budget exhausted — but if the estimate undercounts and the true cost of
   several concurrent runs blows through the budget while they're all still
   streaming, should this module (or `execution`) forcibly cancel an in-flight
   keyless run, or is "the budget is approximate and can overshoot slightly"
   an accepted property of estimating cost before the run completes?
