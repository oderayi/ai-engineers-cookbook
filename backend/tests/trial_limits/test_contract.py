"""Tests for `skillet.trial_limits.contract` — the two `429` bodies this
module can produce.

The exact field set is cross-checked against `frontend/lib/execution/
rate-limit.ts`'s `RateLimitPayload` zod schema (read in full while writing
this module, not re-derived from the spec's prose alone): `error`, `scope`,
`message`, `retry_after_seconds`, `cta` — five snake_case keys, no more, no
fewer. These tests assert that field set directly on the returned dict,
plus the Python-to-JSON type mapping each field must round-trip through
(`int` for `retry_after_seconds`, not `str`; plain `str` for `message`).
"""

import json
from datetime import UTC, datetime

from skillet.trial_limits import contract

EXPECTED_KEYS = {"error", "scope", "message", "retry_after_seconds", "cta"}


def test_trial_daily_error_has_exactly_the_five_expected_keys() -> None:
    payload = contract.trial_daily_error(3600)

    assert set(payload.keys()) == EXPECTED_KEYS


def test_trial_daily_error_field_values() -> None:
    payload = contract.trial_daily_error(3600)

    assert payload["error"] == "rate_limited"
    assert payload["scope"] == "trial_daily"
    assert payload["cta"] == "add_key"
    assert payload["retry_after_seconds"] == 3600
    assert isinstance(payload["message"], str)
    assert payload["message"] != ""


def test_global_budget_error_has_exactly_the_five_expected_keys() -> None:
    payload = contract.global_budget_error(3600)

    assert set(payload.keys()) == EXPECTED_KEYS


def test_global_budget_error_field_values() -> None:
    payload = contract.global_budget_error(3600)

    assert payload["error"] == "rate_limited"
    assert payload["scope"] == "global_budget"
    assert payload["cta"] == "clone_local"
    assert payload["retry_after_seconds"] == 3600
    assert isinstance(payload["message"], str)
    assert payload["message"] != ""


def test_the_two_scopes_have_different_message_copy() -> None:
    # Not a strict requirement of the shape, but guards against someone
    # collapsing both constructors down to one placeholder string later.
    trial_daily = contract.trial_daily_error(60)
    global_budget = contract.global_budget_error(60)

    assert trial_daily["message"] != global_budget["message"]


def _assert_matches_rate_limit_payload_shape(payload: dict[str, object]) -> None:
    """Round-trips `payload` through JSON, then asserts the parsed-back dict
    satisfies `RateLimitPayload`'s field set: exactly the five keys, and each
    value's JSON type matches what the zod schema expects (`z.literal`/
    `z.enum`/`z.string` -> JSON string, `z.number` -> JSON number that is
    specifically an int here, never a JSON string).
    """
    roundtripped = json.loads(json.dumps(payload))

    assert set(roundtripped.keys()) == EXPECTED_KEYS
    assert roundtripped["error"] == "rate_limited"
    assert roundtripped["scope"] in {"trial_daily", "global_budget"}
    assert isinstance(roundtripped["message"], str)
    # bool is a subclass of int in Python; explicitly exclude it so a stray
    # `True`/`False` wouldn't slip past an `isinstance(..., int)` check.
    assert isinstance(roundtripped["retry_after_seconds"], int)
    assert not isinstance(roundtripped["retry_after_seconds"], bool)
    assert roundtripped["cta"] in {"add_key", "clone_local"}


def test_trial_daily_error_json_roundtrip_matches_rate_limit_payload_shape() -> None:
    _assert_matches_rate_limit_payload_shape(contract.trial_daily_error(3600))


def test_global_budget_error_json_roundtrip_matches_rate_limit_payload_shape() -> None:
    _assert_matches_rate_limit_payload_shape(contract.global_budget_error(3600))


def test_trial_daily_error_scope_and_cta_are_paired_correctly() -> None:
    payload = contract.trial_daily_error(1)
    assert payload["scope"] == "trial_daily"
    assert payload["cta"] == "add_key"


def test_global_budget_error_scope_and_cta_are_paired_correctly() -> None:
    payload = contract.global_budget_error(1)
    assert payload["scope"] == "global_budget"
    assert payload["cta"] == "clone_local"


# --- seconds_until_next_utc_midnight ----------------------------------------


def test_seconds_until_next_utc_midnight_at_exactly_midnight_is_zero() -> None:
    # Documented choice: exactly at the boundary means no more waiting is
    # required, so this returns 0 rather than a full day (86400).
    midnight = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)

    assert contract.seconds_until_next_utc_midnight(midnight) == 0


def test_seconds_until_next_utc_midnight_one_second_before_midnight_is_one() -> None:
    almost_midnight = datetime(2026, 1, 1, 23, 59, 59, tzinfo=UTC)

    assert contract.seconds_until_next_utc_midnight(almost_midnight) == 1


def test_seconds_until_next_utc_midnight_at_noon_is_43200() -> None:
    noon = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)

    assert contract.seconds_until_next_utc_midnight(noon) == 43200


def test_seconds_until_next_utc_midnight_one_minute_after_midnight() -> None:
    just_past_midnight = datetime(2026, 1, 1, 0, 1, 0, tzinfo=UTC)

    assert contract.seconds_until_next_utc_midnight(just_past_midnight) == 23 * 60 * 60 + 59 * 60


def test_seconds_until_next_utc_midnight_rounds_up_a_partial_second() -> None:
    # Half a second before midnight still has a whole second of "waiting"
    # left from the caller's perspective -> rounds up, never down.
    half_second_before = datetime(2026, 1, 1, 23, 59, 59, 500_000, tzinfo=UTC)

    assert contract.seconds_until_next_utc_midnight(half_second_before) == 1


def test_seconds_until_next_utc_midnight_with_no_now_uses_real_current_time() -> None:
    result = contract.seconds_until_next_utc_midnight()

    assert isinstance(result, int)
    assert 0 <= result <= 86400
