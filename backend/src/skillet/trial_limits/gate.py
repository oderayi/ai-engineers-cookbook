"""`gate_trial_run`: the FastAPI dependency that ties every other piece of
this package together, called once per run request, before `execution`'s
executor starts.

Per docs/SPEC-trial-limits.md's Confirmed Decision 1, this module owns the
*decision* (grant, possibly with an augmented `config`; or deny with a
`429`) — `execution` owns the route and the actual HTTP wiring (a later
task, `api/run.py`).

Public API
----------
``TrialDecision``
    A frozen dataclass carrying `config: dict[str, str]` — unchanged for a
    BYOK/no-op pass-through, or augmented with the author's key for exactly
    the missing required env key(s) on a granted keyless-trial run.

``EnvEntry`` (a `typing.Protocol`)
    The structural shape this module needs from a recipe's declared env
    entries: `.key`, `.required`, `.provider`. Matches
    `skillet.recipe.manifest.RecipeEnvEntry` field-for-field, but this
    module never imports `skillet.recipe` (Architecture Decision 5,
    tasks/plan-trial-limits.md) — any object with these three attributes
    works, real or a test double.

``gate_trial_run(env, parsed_config, request, response) -> TrialDecision``
    The one function. Raises `fastapi.HTTPException(429, ...)` (via
    `contract.py`) to deny, or raises `TrialLimitsMisconfigured` for a
    genuine deployment misconfiguration (see below) — never silently
    degrades either failure into the other.

Design decisions
-----------------
**Takes a `Response`, unlike the spec's own illustrative `gate.py` sample.**
That sample derives an `Identity` but never actually calls
`response.set_cookie(...)` anywhere, and its own signature has no `Response`
parameter to call it on — an acknowledged gap in the spec's own illustration
(Task 3's acceptance criteria already anticipated this: "gate_trial_run/the
endpoint needs to actually call Set-Cookie on a fresh identity"). This
module's signature adds `response: Response` for exactly that call, via
FastAPI's ordinary pattern of injecting the real outgoing `Response` into a
route or dependency and mutating it — `execution`'s route (Task 9) hands
this its own `response: Response` parameter.

**Ordering matches the spec's own sample exactly: budget check, then
identity, then counters, then injection, then charge.** A request denied by
an already-exhausted global budget never derives or issues an identity
cookie at all — a brand-new visitor whose very first request lands during
an exhausted-budget window gets no tracking cookie set. This is a direct,
deliberate consequence of following the spec's own decided ordering, not an
oversight: the spec's sample checks `budget.is_exhausted` strictly before
`Identity.from_request`, and this module preserves that ordering rather
than second-guessing an already-approved design decision.

**A misconfigured deployment fails loud, never silently as a normal `429`.**
Per tasks/plan-trial-limits.md's Architecture Decision 7: if a trial key
*is* configured (`author_key.any_trial_key_configured()` is `True`) but
`app.state.trial_redis` or `app.state.cookie_secret` is `None` (Redis or the
cookie secret was never configured), this is a real deployment mistake, not
an ordinary rate-limit condition — raising `TrialLimitsMisconfigured`
(propagating as FastAPI's default 500) makes that mistake visible in logs/
monitoring immediately. Silently downgrading it to a `429` would look
identical to normal kill-switch behavior from the outside, hiding the bug
indefinitely.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from fastapi import HTTPException, Request, Response

from skillet.trial_limits import author_key, budget, contract, cookie, counters
from skillet.trial_limits.identity import COOKIE_KWARGS, Identity
from skillet.trial_limits.redis_client import UpstashRedis


class EnvEntry(Protocol):
    """Structural shape needed from a recipe's declared env entries — see
    module docstring. Matches `skillet.recipe.manifest.RecipeEnvEntry`.
    """

    key: str
    required: bool
    provider: str


class TrialLimitsMisconfigured(Exception):
    """A trial key is configured for at least one provider, but this
    deployment's Redis/cookie-secret setup is incomplete — see module
    docstring's "fails loud" design decision. Never caught internally;
    propagates to FastAPI's default 500 handler.
    """


@dataclass(frozen=True, slots=True)
class TrialDecision:
    """The result of a gate decision: `config`, unchanged for BYOK/no-op,
    or augmented with the author's key for exactly the env key(s) a granted
    keyless-trial run was missing.
    """

    config: dict[str, str]


def _missing_required_keys(env: list[EnvEntry], parsed_config: dict[str, str]) -> list[EnvEntry]:
    """Every declared env entry that's `required` and not already satisfied
    by a non-empty, non-whitespace value in `parsed_config` — Confirmed
    Decision 2's gating question.
    """
    return [e for e in env if e.required and not parsed_config.get(e.key, "").strip()]


async def gate_trial_run(
    env: list[EnvEntry],
    parsed_config: dict[str, str],
    request: Request,
    response: Response,
) -> TrialDecision:
    """Decide whether `parsed_config` is pure BYOK (pass through unchanged),
    a keyless-trial run to grant (augmented with the author's key for
    exactly the missing required key(s)), or one to deny (raises a `429`
    via `contract.py`).

    `env` is the recipe's declared env entries (see `EnvEntry`); `request`/
    `response` are the real ASGI request/response for this call — `request`
    to read the existing `sk_aid` cookie and reach `app.state.trial_redis`/
    `app.state.cookie_secret`, `response` to set a freshly-issued `sk_aid`
    cookie when one is needed.
    """
    missing_required = _missing_required_keys(env, parsed_config)

    if missing_required and not author_key.any_trial_key_configured():
        # A local/self-hosted deployment with no trial key funded
        # (Confirmed Decision 11) has nothing to gate -- but the request
        # still can't proceed silently missing a key the recipe declared
        # required. SPEC-distribution.md's own Success Criterion 4: this
        # is an ordinary 422 (the learner needs to supply their own key),
        # never a 429 (there's no trial to deny).
        #
        # This branch didn't exist until distribution's own sign-off pass
        # actually exercised the scenario end-to-end and found a silent
        # pass-through instead — the comment this replaced claimed
        # "execution's own Params validation raises the ordinary 422
        # downstream," but no such validation actually exists anywhere in
        # execution's request-parsing or Params-binding code (confirmed by
        # reading it): `ctx.config` is a plain dict, never re-validated
        # against the manifest's `required` flags after this point. Fixing
        # it here, in the one place that already computes
        # `missing_required`, is more minimal than inventing a second,
        # duplicate check in `execution` for the same fact this module
        # already knows.
        raise HTTPException(
            status_code=422,
            detail=f"missing required config key(s): {[e.key for e in missing_required]}",
        )

    if not missing_required:
        # Pure BYOK: nothing missing, regardless of whether a trial key
        # happens to be configured -- never touches Redis or issues a
        # cookie.
        return TrialDecision(config=dict(parsed_config))

    redis: UpstashRedis | None = getattr(request.app.state, "trial_redis", None)
    cookie_secret: bytes | None = getattr(request.app.state, "cookie_secret", None)
    if redis is None or cookie_secret is None:
        raise TrialLimitsMisconfigured(
            "a trial key is configured, but UPSTASH_REDIS_REST_URL/"
            "UPSTASH_REDIS_REST_TOKEN or SKILLET_TRIAL_COOKIE_SECRET is not — "
            "refusing to grant an ungated keyless-trial run"
        )

    if await budget.is_exhausted(redis):
        raise HTTPException(
            status_code=429,
            detail=contract.global_budget_error(contract.seconds_until_next_utc_midnight()),
        )

    identity, fresh_cookie_value = Identity.from_request(request, cookie_secret)
    if fresh_cookie_value is not None:
        response.set_cookie(cookie.COOKIE_NAME, fresh_cookie_value, **COOKIE_KWARGS)

    if not await counters.increment_and_check(redis, identity):
        raise HTTPException(
            status_code=429,
            detail=contract.trial_daily_error(contract.seconds_until_next_utc_midnight()),
        )

    try:
        augmented = dict(parsed_config)
        for entry in missing_required:
            augmented[entry.key] = author_key.resolve(entry.provider)
    except author_key.TrialUnavailable:
        # A different provider's trial key IS configured (so
        # any_trial_key_configured() was True above), but not the one THIS
        # recipe actually needs — fail closed the same way an exhausted
        # global budget does, not as an internal error.
        raise HTTPException(
            status_code=429,
            detail=contract.global_budget_error(contract.seconds_until_next_utc_midnight()),
        ) from None

    await budget.record_estimated_cost(redis)
    return TrialDecision(config=augmented)
