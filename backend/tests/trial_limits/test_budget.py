"""Tests for `skillet.trial_limits.budget` — the global daily spend counter
and kill-switch.

`UpstashRedis` is stood in for by `FakeUpstashRedis`, a small hand-written
in-memory fake (not an `AsyncMock`) implementing exactly the three methods
`budget.py` calls (`get`, `incrby`, `expire`). A hand-written fake is used
instead of a mock so tests exercise real accumulate-and-compare semantics
(`INCRBY` actually adds to a running total, `GET` actually reflects it)
rather than asserting against pre-programmed return values — `expire` calls
are recorded (not simulated with real TTL expiry, since that's already
covered by `redis_client.py`'s own tests) so tests can assert exactly when
and how often it fires.

`time-machine` freezes/advances the clock to control which UTC-day-suffixed
budget key `_budget_key()` produces, without a real day passing.
"""

import time_machine

from skillet.trial_limits import budget


class FakeUpstashRedis:
    """Minimal in-memory stand-in for `UpstashRedis`, implementing only the
    methods `budget.py` actually calls. `expire_calls` records every
    `(key, seconds)` pair passed to `expire`, in call order, so tests can
    assert exactly when — and how many times — it fires.
    """

    def __init__(self) -> None:
        self._store: dict[str, int] = {}
        self.expire_calls: list[tuple[str, int]] = []

    async def get(self, key: str) -> str | None:
        if key not in self._store:
            return None
        return str(self._store[key])

    async def incrby(self, key: str, amount: int) -> int:
        self._store[key] = self._store.get(key, 0) + amount
        return self._store[key]

    async def expire(self, key: str, seconds: int) -> None:
        self.expire_calls.append((key, seconds))


async def test_is_exhausted_false_when_nothing_spent_yet() -> None:
    redis = FakeUpstashRedis()

    assert await budget.is_exhausted(redis) is False


async def test_record_estimated_cost_uses_custom_amount_micros() -> None:
    redis = FakeUpstashRedis()

    await budget.record_estimated_cost(redis, amount_micros=12_345)

    assert await redis.get(budget._budget_key()) == "12345"


async def test_record_estimated_cost_default_amount_is_the_module_constant() -> None:
    redis = FakeUpstashRedis()

    await budget.record_estimated_cost(redis)

    assert await redis.get(budget._budget_key()) == str(budget.ESTIMATED_COST_MICROS_PER_RUN)


async def test_record_estimated_cost_accumulating_past_budget_flips_exhausted(
    monkeypatch,
) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "0.10")
    redis = FakeUpstashRedis()

    # $0.10 budget == 100_000 micros; two default-sized ($0.05) charges
    # exactly exhaust it.
    await budget.record_estimated_cost(redis)
    assert await budget.is_exhausted(redis) is False

    await budget.record_estimated_cost(redis)
    assert await budget.is_exhausted(redis) is True


async def test_expire_called_exactly_once_on_key_creation(monkeypatch) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "5.00")
    redis = FakeUpstashRedis()

    await budget.record_estimated_cost(redis)
    await budget.record_estimated_cost(redis)
    await budget.record_estimated_cost(redis)

    assert len(redis.expire_calls) == 1
    key, seconds = redis.expire_calls[0]
    assert key == budget._budget_key()
    assert seconds == budget.COUNTER_TTL_SECONDS


async def test_daily_budget_defaults_to_five_dollars(monkeypatch) -> None:
    monkeypatch.delenv("SKILLET_TRIAL_DAILY_BUDGET_USD", raising=False)

    assert budget._daily_budget_micros() == 5_000_000


async def test_daily_budget_env_var_read_fresh_each_call(monkeypatch) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "1.00")
    assert budget._daily_budget_micros() == 1_000_000

    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "2.50")
    assert budget._daily_budget_micros() == 2_500_000


async def test_advancing_past_utc_midnight_resets_exhausted_budget(monkeypatch) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "0.05")
    redis = FakeUpstashRedis()

    with time_machine.travel("2026-01-01 12:00:00+00:00", tick=False):
        await budget.record_estimated_cost(redis)  # exactly exhausts $0.05 budget
        assert await budget.is_exhausted(redis) is True

    with time_machine.travel("2026-01-02 00:00:01+00:00", tick=False):
        # New UTC day -> new key-> nothing spent yet on it, even though the
        # previous day's key is still sitting in the fake store, fully spent.
        assert await budget.is_exhausted(redis) is False
