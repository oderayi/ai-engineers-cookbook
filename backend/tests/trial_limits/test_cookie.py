"""Tests for `skillet.trial_limits.cookie` — signing/verifying `sk_aid`.

See docs/SPEC-trial-limits.md's Testing Strategy ("Cookie signing/verification")
and tasks/todo-trial-limits.md's Task 1 acceptance criteria.
"""

import hashlib
import hmac

from skillet.trial_limits.cookie import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    issue,
    verify,
)

SECRET = b"unit-test-secret"
OTHER_SECRET = b"a-completely-different-secret"


def test_issue_then_verify_recovers_the_same_anon_id():
    cookie_value = issue(SECRET)
    recovered = verify(cookie_value, SECRET)

    assert recovered is not None
    # The recovered id must be exactly the anon_id half of the issued value,
    # not merely "some truthy string".
    anon_id, _, _sig = cookie_value.partition(".")
    assert recovered == anon_id


def test_issue_produces_different_anon_ids_across_calls():
    # Real randomness (secrets.token_urlsafe), not a fixed/mocked value —
    # two separate issue() calls must not collide.
    first = issue(SECRET)
    second = issue(SECRET)

    assert first != second

    first_anon_id, _, _ = first.partition(".")
    second_anon_id, _, _ = second.partition(".")
    assert first_anon_id != second_anon_id


def test_verify_rejects_a_tampered_signature():
    cookie_value = issue(SECRET)
    anon_id, sep, sig = cookie_value.partition(".")

    # Flip one character of the signature (hex digest, so any char position
    # is safe to mutate and guaranteed to differ from the original digit).
    flipped_char = "0" if sig[0] != "0" else "1"
    tampered = f"{anon_id}{sep}{flipped_char}{sig[1:]}"

    assert verify(tampered, SECRET) is None


def test_verify_rejects_a_missing_separator():
    # No "." at all — cannot even be split into anon_id/sig.
    assert verify("just-some-opaque-string-with-no-dot", SECRET) is None


def test_verify_rejects_an_empty_string():
    assert verify("", SECRET) is None


def test_verify_rejects_the_wrong_secret():
    # Proves the signature is actually secret-dependent, not merely a format
    # check — a value that is otherwise perfectly well-formed (real anon_id,
    # real hex signature) must still fail when verified against a secret
    # other than the one it was signed with.
    cookie_value = issue(SECRET)

    assert verify(cookie_value, OTHER_SECRET) is None


def test_verify_rejects_an_anon_id_with_an_embedded_dot():
    # verify() splits on the FIRST "." only. Construct a cookie value whose
    # intended anon_id itself contains a dot (issue() itself never produces
    # one — secrets.token_urlsafe's alphabet has no "." — but nothing stops
    # a malformed/attacker-supplied value from trying), signed correctly
    # over the FULL "anon_id.with.dot" string. verify() will instead treat
    # only the substring before the first dot as the anon_id and recompute
    # the HMAC over that truncated prefix — which will NOT match the
    # signature computed over the full string, so this must fail, not
    # false-positive as if "anon_id" (the truncated prefix) were valid.
    real_anon_id = "anon_id.with.dot"
    sig_over_full_string = hmac.new(SECRET, real_anon_id.encode(), hashlib.sha256).hexdigest()
    crafted = f"{real_anon_id}.{sig_over_full_string}"

    assert verify(crafted, SECRET) is None

    # And, symmetrically: it also must not spuriously validate as the
    # truncated prefix "anon_id" either (i.e. no accidental match against a
    # signature computed over just the prefix).
    prefix = "anon_id"
    sig_over_prefix = hmac.new(SECRET, prefix.encode(), hashlib.sha256).hexdigest()
    also_crafted = f"{real_anon_id}.{sig_over_prefix}"

    assert verify(also_crafted, SECRET) is None


def test_verify_rejects_a_value_with_trailing_dots_appended_to_a_valid_one():
    # An attacker takes a genuinely valid issued value and appends ".junk" —
    # split(".", 1) still isolates the correct anon_id prefix, but the
    # remainder (now "sig.junk") no longer equals the expected signature, so
    # this must fail rather than being accepted on a partial/prefix match.
    valid = issue(SECRET)
    tampered = f"{valid}.junk"

    assert verify(tampered, SECRET) is None


def test_cookie_name_constant():
    assert COOKIE_NAME == "sk_aid"


def test_cookie_max_age_constant_is_one_year_in_seconds():
    assert COOKIE_MAX_AGE == 60 * 60 * 24 * 365
