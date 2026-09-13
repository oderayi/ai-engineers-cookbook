"""Tests for `skillet.trial_limits.gate.gate_trial_run` — the composed
dependency tying identity/counters/budget/author_key/contract together.

See docs/SPEC-trial-limits.md's Confirmed Decisions 1-2, 7, 9-11 and
tasks/todo-trial-limits.md's Task 8 acceptance criteria.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Request, Response

from skillet.trial_limits import author_key, cookie
from skillet.trial_limits.gate import TrialLimitsMisconfigured, gate_trial_run

SECRET = b"unit-test-secret"


@dataclass(frozen=True)
class FakeEnvEntry:
    key: str
    required: bool
    provider: str


class FakeUpstashRedis:
    """A tiny in-memory double for `UpstashRedis` — real accumulate/first-
    write semantics for `incr`/`incrby`/`expire`/`get`, so `counters.py`/
    `budget.py`'s own logic (already independently tested) runs for real
    against it, without any real HTTP call.
    """

    def __init__(self) -> None:
        self._counts: dict[str, int] = {}
        self.expire_calls: list[tuple[str, int]] = []

    async def incr(self, key: str) -> int:
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    async def incrby(self, key: str, amount: int) -> int:
        self._counts[key] = self._counts.get(key, 0) + amount
        return self._counts[key]

    async def expire(self, key: str, seconds: int) -> None:
        self.expire_calls.append((key, seconds))

    async def get(self, key: str) -> str | None:
        if key not in self._counts:
            return None
        return str(self._counts[key])


class FailingRedis:
    """Fails any test that reaches it — for asserting BYOK/no-op paths
    never touch Redis at all."""

    async def incr(self, key: str) -> int:
        raise AssertionError("BYOK/no-op path must never call Redis")

    async def incrby(self, key: str, amount: int) -> int:
        raise AssertionError("BYOK/no-op path must never call Redis")

    async def expire(self, key: str, seconds: int) -> None:
        raise AssertionError("BYOK/no-op path must never call Redis")

    async def get(self, key: str) -> str | None:
        raise AssertionError("BYOK/no-op path must never call Redis")


def make_request(
    *,
    trial_redis: object | None,
    cookie_secret: bytes | None,
    cookie_header: str | None = None,
    client_host: str = "203.0.113.5",
) -> Request:
    headers = []
    if cookie_header is not None:
        headers.append((b"cookie", cookie_header.encode()))
    app_state = SimpleNamespace(trial_redis=trial_redis, cookie_secret=cookie_secret)
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/recipes/x/run",
        "headers": headers,
        "client": (client_host, 12345),
        "app": SimpleNamespace(state=app_state),
    }
    return Request(scope)


ENV_ONE_REQUIRED = [FakeEnvEntry(key="OPENAI_API_KEY", required=True, provider="openai")]
ENV_ONE_OPTIONAL = [FakeEnvEntry(key="OPENAI_API_KEY", required=False, provider="openai")]


async def test_all_required_keys_present_is_pure_byok_no_redis_no_cookie(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    request = make_request(trial_redis=FailingRedis(), cookie_secret=SECRET)
    response = Response()
    parsed_config = {"OPENAI_API_KEY": "sk-learners-own-key"}

    decision = await gate_trial_run(ENV_ONE_REQUIRED, parsed_config, request, response)

    assert decision.config == {"OPENAI_API_KEY": "sk-learners-own-key"}
    assert "set-cookie" not in response.headers


async def test_no_required_keys_declared_is_pure_byok_no_redis(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    request = make_request(trial_redis=FailingRedis(), cookie_secret=SECRET)
    response = Response()

    decision = await gate_trial_run(ENV_ONE_OPTIONAL, {}, request, response)

    assert decision.config == {}


async def test_no_required_keys_missing_is_a_noop_even_with_no_trial_key_configured(monkeypatch):
    """The genuine BYOK-success case, distinct from the 422 case below:
    nothing is missing at all, so there is nothing to gate or reject,
    regardless of whether a trial key happens to be configured.
    """
    monkeypatch.delenv("SKILLET_TRIAL_OPENAI_API_KEY", raising=False)
    request = make_request(trial_redis=FailingRedis(), cookie_secret=SECRET)
    response = Response()

    decision = await gate_trial_run(ENV_ONE_OPTIONAL, {}, request, response)

    assert decision.config == {}
    assert "set-cookie" not in response.headers


async def test_missing_required_key_with_no_trial_key_configured_denies_with_422(monkeypatch):
    """SPEC-distribution.md's own Success Criterion 4: with no trial key
    funded, a request missing a required key fails 422 (the learner needs
    to supply their own key) -- never a 429 (there's no trial to deny).
    Found via distribution's own sign-off pass: this used to silently
    pass the request through with the key simply left missing, no Redis
    call and no error either -- fixed here, once distribution's own
    Success Criterion 4 exercised the scenario end-to-end and caught it.
    """
    monkeypatch.delenv("SKILLET_TRIAL_OPENAI_API_KEY", raising=False)
    request = make_request(trial_redis=FailingRedis(), cookie_secret=SECRET)
    response = Response()

    with pytest.raises(HTTPException) as exc_info:
        await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)

    assert exc_info.value.status_code == 422
    assert "OPENAI_API_KEY" in str(exc_info.value.detail)
    assert "set-cookie" not in response.headers


async def test_trial_key_configured_but_redis_missing_raises_misconfigured(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    request = make_request(trial_redis=None, cookie_secret=SECRET)
    response = Response()

    with pytest.raises(TrialLimitsMisconfigured):
        await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)


async def test_trial_key_configured_but_cookie_secret_missing_raises_misconfigured(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    request = make_request(trial_redis=FakeUpstashRedis(), cookie_secret=None)
    response = Response()

    with pytest.raises(TrialLimitsMisconfigured):
        await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)


async def test_exhausted_global_budget_denies_with_global_budget_scope(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "0.00")  # already exhausted at $0
    redis = FakeUpstashRedis()
    request = make_request(trial_redis=redis, cookie_secret=SECRET)
    response = Response()

    with pytest.raises(HTTPException) as exc_info:
        await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["scope"] == "global_budget"
    assert exc_info.value.detail["cta"] == "clone_local"
    # Never even reached identity/counter logic -- no cookie set.
    assert "set-cookie" not in response.headers


async def test_granted_run_fills_only_the_missing_required_key(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    redis = FakeUpstashRedis()
    request = make_request(trial_redis=redis, cookie_secret=SECRET)
    response = Response()
    env = [
        FakeEnvEntry(key="OPENAI_API_KEY", required=True, provider="openai"),
        FakeEnvEntry(key="OPTIONAL_KEY", required=False, provider="openai"),
    ]
    parsed_config = {"OPTIONAL_KEY": "learner-supplied-optional-value"}

    decision = await gate_trial_run(env, parsed_config, request, response)

    assert decision.config == {
        "OPENAI_API_KEY": "sk-author-key",
        "OPTIONAL_KEY": "learner-supplied-optional-value",  # untouched
    }
    assert "set-cookie" in response.headers  # fresh identity, cookie issued
    assert cookie.COOKIE_NAME in response.headers["set-cookie"]


async def test_granted_run_charges_the_budget(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    redis = FakeUpstashRedis()
    request = make_request(trial_redis=redis, cookie_secret=SECRET)
    response = Response()

    await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)

    budget_keys = [k for k in redis._counts if k.startswith("trial:budget:")]
    assert len(budget_keys) == 1
    assert redis._counts[budget_keys[0]] > 0


async def test_identity_over_daily_cap_denies_with_trial_daily_scope(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "1")
    redis = FakeUpstashRedis()
    issued = cookie.issue(SECRET)
    cookie_header = f"{cookie.COOKIE_NAME}={issued}"

    # First request: granted, consumes the cap.
    request1 = make_request(trial_redis=redis, cookie_secret=SECRET, cookie_header=cookie_header)
    await gate_trial_run(ENV_ONE_REQUIRED, {}, request1, Response())

    # Second request, same identity: denied.
    request2 = make_request(trial_redis=redis, cookie_secret=SECRET, cookie_header=cookie_header)
    response2 = Response()
    with pytest.raises(HTTPException) as exc_info:
        await gate_trial_run(ENV_ONE_REQUIRED, {}, request2, response2)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["scope"] == "trial_daily"
    assert exc_info.value.detail["cta"] == "add_key"


async def test_trial_unavailable_during_injection_denies_as_global_budget(monkeypatch):
    # A DIFFERENT provider's key is configured (so any_trial_key_configured()
    # is True), but not the one this recipe actually needs.
    monkeypatch.delenv("SKILLET_TRIAL_OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(
        author_key,
        "TRIAL_KEY_ENV",
        {"openai": "SKILLET_TRIAL_OPENAI_API_KEY", "other": "OTHER_KEY"},
    )
    monkeypatch.setenv("OTHER_KEY", "sk-other-provider-key")
    redis = FakeUpstashRedis()
    request = make_request(trial_redis=redis, cookie_secret=SECRET)
    response = Response()

    with pytest.raises(HTTPException) as exc_info:
        await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["scope"] == "global_budget"


async def test_valid_existing_cookie_sets_no_new_cookie_on_grant(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    redis = FakeUpstashRedis()
    issued = cookie.issue(SECRET)
    request = make_request(
        trial_redis=redis, cookie_secret=SECRET, cookie_header=f"{cookie.COOKIE_NAME}={issued}"
    )
    response = Response()

    await gate_trial_run(ENV_ONE_REQUIRED, {}, request, response)

    assert "set-cookie" not in response.headers
