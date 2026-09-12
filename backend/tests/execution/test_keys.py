"""Tests for skillet.execution.keys — redaction of config secret values from
log lines and exception strings.

See src/skillet/execution/keys.py for the module docstring covering the
design decisions (no minimum-length threshold, longest-value-first ordering,
etc.) that these tests exercise.
"""

from skillet.execution.keys import DEFAULT_PLACEHOLDER, redact, redact_exception


def test_redact_replaces_single_secret_value() -> None:
    config = {"OPENAI_API_KEY": "sk-abc123456789xyz000"}
    msg = "calling upstream with key sk-abc123456789xyz000 failed"
    out = redact(msg, config)
    assert "sk-abc123456789xyz000" not in out
    assert DEFAULT_PLACEHOLDER in out


def test_redact_leaves_message_unchanged_when_no_secret_present() -> None:
    config = {"OPENAI_API_KEY": "sk-abc123456789xyz000"}
    msg = "connection timed out after 30s"
    assert redact(msg, config) == msg


def test_redact_replaces_multiple_distinct_secrets() -> None:
    config = {
        "OPENAI_API_KEY": "sk-abc123456789xyz000",
        "ANTHROPIC_API_KEY": "sk-ant-987654321qwerty",
    }
    msg = "keys used: sk-abc123456789xyz000 and sk-ant-987654321qwerty"
    out = redact(msg, config)
    assert "sk-abc123456789xyz000" not in out
    assert "sk-ant-987654321qwerty" not in out
    assert out.count(DEFAULT_PLACEHOLDER) == 2


def test_redact_handles_substring_secret_values_without_partial_leak() -> None:
    # "sk-abc" is a substring of "sk-abc-xyz". If the shorter value were
    # redacted first, the text would be left as "***REDACTED***-xyz" —
    # exposing the "-xyz" suffix of the longer secret. Redacting the longer
    # value first must fully consume both.
    config = {
        "SHORT_KEY": "sk-abc",
        "LONG_KEY": "sk-abc-xyz",
    }
    msg = "auth failed for sk-abc-xyz during retry"
    out = redact(msg, config)
    assert "sk-abc-xyz" not in out
    assert "sk-abc" not in out
    assert "xyz" not in out
    assert out == f"auth failed for {DEFAULT_PLACEHOLDER} during retry"

    # And when the short value appears independently (not as part of the
    # longer one), it must still be redacted.
    msg2 = "auth failed for sk-abc during retry"
    out2 = redact(msg2, config)
    assert "sk-abc" not in out2
    assert out2 == f"auth failed for {DEFAULT_PLACEHOLDER} during retry"


def test_redact_ignores_empty_string_config_value() -> None:
    config = {"UNSET_KEY": "", "OPENAI_API_KEY": "sk-abc123456789xyz000"}
    msg = "hello world, nothing secret here"
    # Blindly replacing "" would insert the placeholder between every
    # character; must be a true no-op for this message.
    assert redact(msg, config) == msg


def test_redact_with_empty_config_returns_unchanged() -> None:
    msg = "sk-abc123456789xyz000 leaked? no config to check against"
    assert redact(msg, {}) == msg


def test_redact_short_values_are_still_redacted() -> None:
    # Per the module's documented judgment call: no minimum-length
    # threshold is applied — even a 1-character config value is redacted
    # when present, on the theory that a missed real secret is worse than
    # an occasional coincidental match.
    config = {"FLAG": "z"}
    msg = "the flag is z today"
    out = redact(msg, config)
    assert "z" not in out.replace(DEFAULT_PLACEHOLDER, "")


def test_redact_exception_message_does_not_contain_secret() -> None:
    config = {"OPENAI_API_KEY": "sk-abc123456789xyz000"}
    exc = ValueError("upstream rejected request with key sk-abc123456789xyz000")
    out = redact_exception(exc, config)
    assert "sk-abc123456789xyz000" not in out
    assert DEFAULT_PLACEHOLDER in out
    assert "ValueError" in out


def test_redact_handles_unicode_content() -> None:
    config = {"API_KEY": "clé-sécrète-日本語-123456789"}
    msg = "échec de la requête avec clé-sécrète-日本語-123456789 pour l'utilisateur 😀"
    out = redact(msg, config)
    assert "clé-sécrète-日本語-123456789" not in out
    assert DEFAULT_PLACEHOLDER in out
    assert "😀" in out  # unrelated unicode content is preserved


def test_redact_does_not_mutate_config_dict() -> None:
    config = {"OPENAI_API_KEY": "sk-abc123456789xyz000"}
    snapshot = dict(config)
    redact("sk-abc123456789xyz000 was used", config)
    assert config == snapshot


def test_redact_custom_placeholder() -> None:
    config = {"OPENAI_API_KEY": "sk-abc123456789xyz000"}
    out = redact("key sk-abc123456789xyz000 here", config, placeholder="<hidden>")
    assert out == "key <hidden> here"
