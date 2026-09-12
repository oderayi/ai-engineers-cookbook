"""Tests for `skillet.trial_limits.identity` — deriving the rate-limit
`Identity` (IP hash + anonymous cookie id) from a `Request`.

See docs/SPEC-trial-limits.md's Confirmed Decision 3 and
tasks/todo-trial-limits.md's Task 3 acceptance criteria.

`Request` instances are built directly from a hand-built ASGI `scope` dict
(Starlette's `Request.__init__(scope, receive=..., send=...)` accepts a bare
scope with no live connection needed for header/cookie/client access — no
`TestClient`/real ASGI cycle required for this pure, response-agnostic
function), rather than guessed at.
"""

import hashlib

from fastapi import Request

from skillet.trial_limits import cookie
from skillet.trial_limits.identity import COOKIE_KWARGS, Identity

SECRET = b"unit-test-secret"


def make_request(
    cookie_header: str | None = None,
    client_host: str | None = "203.0.113.5",
) -> Request:
    headers = []
    if cookie_header is not None:
        headers.append((b"cookie", cookie_header.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
        "client": (client_host, 12345) if client_host is not None else None,
    }
    return Request(scope)


def test_no_cookie_present_issues_a_fresh_identity():
    request = make_request(cookie_header=None)

    identity, to_set = Identity.from_request(request, SECRET)

    assert to_set is not None
    # The value to set must itself verify, and recover the same anon_id
    # the returned Identity carries.
    recovered = cookie.verify(to_set, SECRET)
    assert recovered is not None
    assert recovered == identity.anon_id


def test_no_cookie_present_issues_different_anon_ids_across_calls():
    first, first_to_set = Identity.from_request(make_request(cookie_header=None), SECRET)
    second, second_to_set = Identity.from_request(make_request(cookie_header=None), SECRET)

    assert first.anon_id != second.anon_id
    assert first_to_set != second_to_set


def test_valid_existing_cookie_recovers_the_same_anon_id_and_sets_nothing_new():
    issued = cookie.issue(SECRET)
    expected_anon_id = cookie.verify(issued, SECRET)
    request = make_request(cookie_header=f"{cookie.COOKIE_NAME}={issued}")

    identity, to_set = Identity.from_request(request, SECRET)

    assert identity.anon_id == expected_anon_id
    assert to_set is None


def test_tampered_cookie_is_treated_as_absent_and_a_fresh_one_is_issued():
    issued = cookie.issue(SECRET)
    anon_id, sep, sig = issued.partition(".")
    flipped_char = "0" if sig[0] != "0" else "1"
    tampered = f"{anon_id}{sep}{flipped_char}{sig[1:]}"
    request = make_request(cookie_header=f"{cookie.COOKIE_NAME}={tampered}")

    identity, to_set = Identity.from_request(request, SECRET)

    assert to_set is not None
    recovered = cookie.verify(to_set, SECRET)
    assert recovered is not None
    assert recovered == identity.anon_id
    # And it must not be the tampered value's anon_id, since that was rejected.
    assert identity.anon_id != anon_id


def test_ip_hash_is_the_real_sha256_hex_digest_of_the_client_host_not_plaintext():
    host = "198.51.100.42"
    request = make_request(cookie_header=None, client_host=host)

    identity, _ = Identity.from_request(request, SECRET)

    assert identity.ip_hash == hashlib.sha256(host.encode()).hexdigest()
    assert host not in identity.ip_hash
    assert identity.ip_hash != host


def test_two_different_client_ips_produce_different_ip_hashes():
    first, _ = Identity.from_request(
        make_request(cookie_header=None, client_host="203.0.113.5"), SECRET
    )
    second, _ = Identity.from_request(
        make_request(cookie_header=None, client_host="203.0.113.6"), SECRET
    )

    assert first.ip_hash != second.ip_hash


def test_request_client_none_does_not_crash():
    request = make_request(cookie_header=None, client_host=None)

    identity, to_set = Identity.from_request(request, SECRET)

    assert isinstance(identity.ip_hash, str)
    assert len(identity.ip_hash) == 64  # a real sha256 hex digest was produced
    assert to_set is not None


def test_request_client_none_is_deterministic_across_calls():
    # Every client-less request shares one ip_hash (a fixed sentinel is
    # hashed) — documented in identity.py's module docstring.
    first, _ = Identity.from_request(make_request(cookie_header=None, client_host=None), SECRET)
    second, _ = Identity.from_request(make_request(cookie_header=None, client_host=None), SECRET)

    assert first.ip_hash == second.ip_hash


def test_cookie_kwargs_match_the_spec_attributes():
    assert COOKIE_KWARGS["httponly"] is True
    assert COOKIE_KWARGS["secure"] is True
    assert COOKIE_KWARGS["samesite"] == "lax"
    assert COOKIE_KWARGS["max_age"] == cookie.COOKIE_MAX_AGE
