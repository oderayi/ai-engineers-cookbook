"""Tests for `skillet.trial_limits.counters` — per-identity daily trial-run
counters.

See docs/SPEC-trial-limits.md's Testing Strategy ("Counter logic (the
important one)") and tasks/todo-trial-limits.md's Task 4 acceptance criteria.

**Mocking choice: a hand-written in-memory fake for `UpstashRedis`, not
`respx`.** `test_redis_client.py` already covers the HTTP layer (request URL,
method, headers, response-shape parsing) with `respx` — re-mocking HTTP here
would just duplicate that coverage while making these tests harder to read.
What these tests actually exercise is counter *logic*: whether `INCR` returns
`1` on a fresh key, whether `EXPIRE` fires exactly once per key per day, and
whether two independent counters are combined correctly. A small stateful
fake exposing just `incr`/`expire` (the only two `UpstashRedis` methods
`counters.py` calls) gives direct, precise assertions — real increment
semantics per key, and an exact per-key call count for `expire` — without
constructing an HTTP response for every single increment.
"""

import time_machine

from skillet.trial_limits.counters import (
    COUNTER_TTL_SECONDS,
    _bump,
    _day_key,
    increment_and_check,
)
from skillet.trial_limits.identity import Identity


class FakeUpstashRedis:
    """In-memory double for `UpstashRedis`, tracking real per-key counts and
    exactly how many times `expire` was called for each key.
    """

    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.expire_calls: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key: str, seconds: int) -> None:
        assert seconds == COUNTER_TTL_SECONDS
        self.expire_calls[key] = self.expire_calls.get(key, 0) + 1


def make_identity(ip_hash: str = "ip-hash-abc", anon_id: str = "anon-id-xyz") -> Identity:
    return Identity(ip_hash=ip_hash, anon_id=anon_id)


FROZEN_DAY = "2026-09-12T12:00:00+00:00"


def test_day_key_format():
    with time_machine.travel(FROZEN_DAY):
        assert _day_key("ip", "abc123") == "trial:count:ip:abc123:20260912"
        assert _day_key("cookie", "xyz") == "trial:count:cookie:xyz:20260912"


async def test_bump_on_fresh_key_returns_one_and_calls_expire_once():
    redis = FakeUpstashRedis()
    key = "trial:count:ip:abc:20260912"

    count = await _bump(redis, key)

    assert count == 1
    assert redis.expire_calls.get(key) == 1


async def test_bump_on_existing_key_increments_and_does_not_call_expire_again():
    redis = FakeUpstashRedis()
    key = "trial:count:ip:abc:20260912"

    first = await _bump(redis, key)
    second = await _bump(redis, key)

    assert first == 1
    assert second == 2
    # expire must have fired exactly once total, on the first write only.
    assert redis.expire_calls.get(key) == 1


async def test_bump_repeated_increments_never_call_expire_more_than_once():
    redis = FakeUpstashRedis()
    key = "trial:count:cookie:xyz:20260912"

    for _ in range(5):
        await _bump(redis, key)

    assert redis.counts[key] == 5
    assert redis.expire_calls.get(key) == 1


async def test_increment_and_check_true_when_both_counters_within_cap(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel(FROZEN_DAY):
        allowed = await increment_and_check(redis, identity)

    assert allowed is True


async def test_increment_and_check_false_when_ip_over_cap_but_cookie_fine(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()

    with time_machine.travel(FROZEN_DAY):
        # Exhaust the IP counter with two other identities sharing the same
        # IP hash but different cookies, then make a third request from a
        # fresh cookie but the same (now-exhausted) IP.
        shared_ip = "shared-ip-hash"
        await increment_and_check(redis, Identity(ip_hash=shared_ip, anon_id="cookie-a"))
        await increment_and_check(redis, Identity(ip_hash=shared_ip, anon_id="cookie-b"))

        allowed = await increment_and_check(redis, Identity(ip_hash=shared_ip, anon_id="cookie-c"))

    assert allowed is False


async def test_increment_and_check_false_when_cookie_over_cap_but_ip_fine(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()

    with time_machine.travel(FROZEN_DAY):
        # Same cookie (e.g. same browser) hitting from different IPs — the
        # cookie counter climbs regardless of IP, and should independently
        # deny once it alone exceeds the cap.
        shared_cookie = "shared-anon-id"
        await increment_and_check(redis, Identity(ip_hash="ip-a", anon_id=shared_cookie))
        await increment_and_check(redis, Identity(ip_hash="ip-b", anon_id=shared_cookie))

        allowed = await increment_and_check(redis, Identity(ip_hash="ip-c", anon_id=shared_cookie))

    assert allowed is False


async def test_request_at_exactly_the_cap_is_allowed(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel(FROZEN_DAY):
        first = await increment_and_check(redis, identity)
        second = await increment_and_check(redis, identity)

    assert first is True
    assert second is True  # exactly at the cap (count == 2 == DAILY_TRIAL_CAP)


async def test_request_one_over_the_cap_is_denied(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel(FROZEN_DAY):
        await increment_and_check(redis, identity)
        await increment_and_check(redis, identity)
        third = await increment_and_check(redis, identity)

    assert third is False  # count == 3 > DAILY_TRIAL_CAP == 2


async def test_denied_attempt_still_increments_both_counters(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel(FROZEN_DAY):
        await increment_and_check(redis, identity)
        await increment_and_check(redis, identity)
        allowed = await increment_and_check(redis, identity)

        ip_key = _day_key("ip", identity.ip_hash)
        cookie_key = _day_key("cookie", identity.anon_id)

    assert allowed is False
    # The denied (3rd) call must still have bumped both counters to 3 —
    # proving a denied attempt still counts, per the "casual limiting" design.
    assert redis.counts[ip_key] == 3
    assert redis.counts[cookie_key] == 3


async def test_clock_advancing_past_utc_midnight_starts_a_fresh_count(monkeypatch):
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel("2026-09-12T23:59:00+00:00") as traveller:
        # Exhaust the cap on day one.
        await increment_and_check(redis, identity)
        second = await increment_and_check(redis, identity)
        assert second is True

        ip_key_day1 = _day_key("ip", identity.ip_hash)
        cookie_key_day1 = _day_key("cookie", identity.anon_id)
        assert redis.counts[ip_key_day1] == 2
        assert redis.counts[cookie_key_day1] == 2

        # Advance past UTC midnight into day two.
        traveller.move_to("2026-09-13T00:05:00+00:00")

        ip_key_day2 = _day_key("ip", identity.ip_hash)
        cookie_key_day2 = _day_key("cookie", identity.anon_id)
        assert ip_key_day2 != ip_key_day1
        assert cookie_key_day2 != cookie_key_day1

        allowed = await increment_and_check(redis, identity)

    assert allowed is True
    # The new day's keys start fresh at 1, regardless of day one's count.
    assert redis.counts[ip_key_day2] == 1
    assert redis.counts[cookie_key_day2] == 1
    # A fresh key's first write must (re-)trigger its own EXPIRE.
    assert redis.expire_calls.get(ip_key_day2) == 1
    assert redis.expire_calls.get(cookie_key_day2) == 1


async def test_daily_trial_cap_env_var_is_read_at_call_time(monkeypatch):
    """`SKILLET_TRIAL_DAILY_CAP` must take effect without reimporting the
    module — proving the env var is read fresh on each call, not cached at
    import time.
    """
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel(FROZEN_DAY):
        monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "1")
        first = await increment_and_check(redis, identity)
        assert first is True  # count == 1 == cap of 1

        second = await increment_and_check(redis, identity)
        assert second is False  # count == 2 > cap of 1

        # Now raise the cap mid-test and confirm a fresh identity picks it up.
        monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "5")
        other_identity = make_identity(ip_hash="ip-other", anon_id="cookie-other")
        allowed = await increment_and_check(redis, other_identity)
        assert allowed is True


async def test_daily_trial_cap_defaults_to_two_when_env_var_unset(monkeypatch):
    monkeypatch.delenv("SKILLET_TRIAL_DAILY_CAP", raising=False)
    redis = FakeUpstashRedis()
    identity = make_identity()

    with time_machine.travel(FROZEN_DAY):
        first = await increment_and_check(redis, identity)
        second = await increment_and_check(redis, identity)
        third = await increment_and_check(redis, identity)

    assert first is True
    assert second is True
    assert third is False
