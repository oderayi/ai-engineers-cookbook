"""Tests for skillet.execution.keys — redaction of config secret values from
log lines and exception strings.

See src/skillet/execution/keys.py for the module docstring covering the
design decisions (no minimum-length threshold, longest-value-first ordering,
etc.) that these tests exercise.
"""

import logging

from skillet.execution.keys import (
    DEFAULT_PLACEHOLDER,
    RedactingFilter,
    redact,
    redact_exception,
    redact_key_shaped_patterns,
    redaction_context,
)


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


def test_redact_key_shaped_patterns_catches_provider_prefixed_token() -> None:
    out = redact_key_shaped_patterns("using key sk-liveAbCdEfGhIjKlMnOp for this call")
    assert "sk-liveAbCdEfGhIjKlMnOp" not in out
    assert DEFAULT_PLACEHOLDER in out


def test_redact_key_shaped_patterns_catches_long_generic_token() -> None:
    out = redact_key_shaped_patterns("token=abcdEFGH12345678ijklMNOP9999 rejected")
    assert "abcdEFGH12345678ijklMNOP9999" not in out


def test_redact_key_shaped_patterns_leaves_ordinary_short_text_alone() -> None:
    msg = "connection timed out after 30s, retrying request id abc123"
    assert redact_key_shaped_patterns(msg) == msg


def test_redacting_filter_scrubs_bound_config_value_from_log_record(caplog) -> None:
    logger = logging.getLogger("skillet.execution.test_keys.sentinel")
    logger.addFilter(RedactingFilter())
    caplog.set_level(logging.INFO, logger=logger.name)

    sentinel = "sk-sentinel-value-do-not-leak-000111222"
    with redaction_context({"OPENAI_API_KEY": sentinel}):
        logger.info("calling upstream with key %s", sentinel)

    assert sentinel not in caplog.text
    assert DEFAULT_PLACEHOLDER in caplog.text


def test_redacting_filter_is_a_noop_outside_redaction_context_for_unrelated_text(caplog) -> None:
    logger = logging.getLogger("skillet.execution.test_keys.no_context")
    logger.addFilter(RedactingFilter())
    caplog.set_level(logging.INFO, logger=logger.name)

    logger.info("plain message with nothing sensitive")

    assert caplog.records[-1].getMessage() == "plain message with nothing sensitive"


def test_redaction_context_resets_after_block_exits(caplog) -> None:
    logger = logging.getLogger("skillet.execution.test_keys.reset")
    logger.addFilter(RedactingFilter())
    caplog.set_level(logging.INFO, logger=logger.name)

    secret = "sk-should-not-leak-outside-the-with-block-9999"
    with redaction_context({"KEY": secret}):
        pass
    logger.info("message containing %s after the context exited", secret)

    # Outside the `with` block, config-based redaction no longer applies —
    # but the key-shaped heuristic still catches this since it looks like a
    # token regardless of any bound config.
    assert secret not in caplog.text


def test_redacting_filter_scrubs_exception_traceback_not_just_the_message(caplog) -> None:
    """Regression test: `record.msg`/`.args` redaction alone does NOT touch
    an attached exception traceback — `logging.Formatter` renders that from
    `record.exc_info`/`record.exc_text` entirely separately from the
    message. `logger.exception(...)` (used by
    `skillet.recipe.executor` on a recipe's uncaught exception) is exactly
    the call whose traceback can carry a raised, unredacted secret — a real
    leak this filter used to miss (caught by
    `tests/execution/test_key_hygiene.py`, fixed here).
    """
    logger = logging.getLogger("skillet.execution.test_keys.traceback")
    logger.addFilter(RedactingFilter())
    caplog.set_level(logging.ERROR, logger=logger.name)

    secret = "sk-traceback-leak-should-be-redacted-999888777"
    with redaction_context({"OPENAI_API_KEY": secret}):
        try:
            raise RuntimeError(f"upstream rejected key {secret}")
        except RuntimeError:
            logger.exception("recipe raised during execution")

    assert secret not in caplog.text
    assert "recipe raised during execution" in caplog.text  # the message itself is untouched
    assert "RuntimeError" in caplog.text  # the traceback is still present, just redacted


def test_install_redacting_filter_is_idempotent_and_targets_real_loggers() -> None:
    from skillet.execution.keys import install_redacting_filter

    logger = logging.getLogger("skillet.execution.test_keys.install")
    install_redacting_filter([logger.name])
    install_redacting_filter([logger.name])  # calling twice must not double-attach

    matching = [f for f in logger.filters if isinstance(f, RedactingFilter)]
    assert len(matching) == 1


def test_redact_key_shaped_patterns_empty_string_is_a_noop() -> None:
    assert redact_key_shaped_patterns("") == ""


def test_redacting_filter_scrubs_stack_info(caplog) -> None:
    logger = logging.getLogger("skillet.execution.test_keys.stack_info")
    logger.addFilter(RedactingFilter())
    caplog.set_level(logging.INFO, logger=logger.name)

    secret = "sk-stack-info-leak-should-be-redacted-11223344"
    with redaction_context({"KEY": secret}):
        logger.info("state snapshot for %s", secret, stack_info=True)

    assert secret not in caplog.text
    assert "state snapshot for" in caplog.text
