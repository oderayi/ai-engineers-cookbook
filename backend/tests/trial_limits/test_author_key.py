"""Tests for `skillet.trial_limits.author_key` — provider -> author trial-key
env-var resolution.

See docs/SPEC-trial-limits.md's Code Style section ("The author-key
resolution (`author_key.py`)") and tasks/todo-trial-limits.md's Task 6
acceptance criteria.
"""

import pytest

from skillet.trial_limits.author_key import (
    TRIAL_KEY_ENV,
    TrialUnavailable,
    any_trial_key_configured,
    resolve,
)

OPENAI_ENV = TRIAL_KEY_ENV["openai"]


def _clear_all_trial_key_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Delete every env var this module could read, so a test starts from a
    known-empty slate regardless of what the real ambient environment has
    set (per the task's instruction to never rely on the ambient env).
    """
    for env_name in TRIAL_KEY_ENV.values():
        monkeypatch.delenv(env_name, raising=False)


def test_resolve_returns_the_configured_key_for_a_known_provider(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)
    monkeypatch.setenv(OPENAI_ENV, "sk-trial-sentinel-value")

    assert resolve("openai") == "sk-trial-sentinel-value"


def test_resolve_raises_trial_unavailable_when_env_var_is_unset(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)

    with pytest.raises(TrialUnavailable) as exc_info:
        resolve("openai")

    assert exc_info.value.provider == "openai"


def test_resolve_raises_trial_unavailable_when_env_var_is_empty_string(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)
    monkeypatch.setenv(OPENAI_ENV, "")

    with pytest.raises(TrialUnavailable) as exc_info:
        resolve("openai")

    assert exc_info.value.provider == "openai"


def test_resolve_raises_trial_unavailable_not_key_error_for_unknown_provider(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)

    with pytest.raises(TrialUnavailable) as exc_info:
        resolve("unknown-provider")

    # Must be TrialUnavailable, never a bare KeyError leaking the internal
    # dict-lookup implementation detail out to callers.
    assert exc_info.value.provider == "unknown-provider"


def test_trial_unavailable_message_names_the_failing_provider(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)

    with pytest.raises(TrialUnavailable) as exc_info:
        resolve("openai")

    # The message should be more useful to a human/log line than the bare
    # provider string — but the .provider attribute is the reliable thing
    # a caller should inspect programmatically (asserted in the tests above).
    assert "openai" in str(exc_info.value)


def test_any_trial_key_configured_is_false_when_nothing_is_set(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)

    assert any_trial_key_configured() is False


def test_any_trial_key_configured_is_true_when_one_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)
    monkeypatch.setenv(OPENAI_ENV, "sk-trial-sentinel-value")

    assert any_trial_key_configured() is True


def test_any_trial_key_configured_is_false_when_set_to_empty_string(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_all_trial_key_env(monkeypatch)
    monkeypatch.setenv(OPENAI_ENV, "")

    assert any_trial_key_configured() is False
