"""Derives the rate-limit identity (IP hash + anonymous cookie id) from a
FastAPI `Request`.

Per docs/SPEC-trial-limits.md's Confirmed Decision 3, a keyless-trial request
is rate-limited by **two** independent signals: a hash of the client's IP and
the opaque anonymous id carried in the signed `sk_aid` cookie (see
`cookie.py`). This module is the one place that turns a live `Request` into
those two values, issuing a fresh `sk_aid` value when none is present or the
one present fails verification. It builds directly on `cookie.issue`/
`cookie.verify` — it does not re-implement or duplicate their signing logic.

Public API
----------
``Identity``
    A frozen dataclass carrying ``ip_hash`` (hex sha256 digest of the client
    host, never the plaintext IP) and ``anon_id`` (the opaque id recovered
    from, or freshly issued into, `sk_aid`).

``Identity.from_request(request, secret) -> tuple[Identity, str | None]``
    The one constructor. Returns the derived `Identity` alongside the value a
    fresh `sk_aid` cookie needs to be set to on the outgoing response, or
    ``None`` if the request already carried a valid cookie and nothing new
    needs to be issued. This function never touches a `Response` object —
    see "Pure, response-agnostic by design" below.

``COOKIE_KWARGS``
    The `Response.set_cookie` keyword arguments (`httponly`, `secure`,
    `samesite`, `max_age`) a caller (`gate.py`) should pass alongside
    ``key=cookie.COOKIE_NAME, value=<the fresh value>`` when the second
    element of `from_request`'s return value is not `None`.

Design decisions
-----------------
**`ip_hash` is `sha256(host).hexdigest()`, never the plaintext host.** The
spec requires the raw IP is "never stored/logged in plaintext even
indirectly via this identity value" — `Identity` is exactly the kind of
value that ends up in a Redis key (`counters.py`) or a log line, so the
plaintext IP must never be reachable from it, only a one-way digest of it.

**`request.client is None` hashes a fixed sentinel, not the empty string.**
Some test harnesses and proxy setups never populate ASGI `scope["client"]`
at all (see this module's own tests, which build a `Request` from a raw
scope). Hashing `""` would work too (it can't crash), but a fixed,
distinctive sentinel (`_NO_CLIENT_SENTINEL`) keeps this case visibly
intentional rather than indistinguishable from "some client happened to
report `sha256(b"")` as its digest" (which cannot occur for a real IP
string, but the sentinel makes the impossibility explicit rather than
incidental). Every such request shares one `ip_hash` value, which only
matters in practice alongside the independent cookie-based counter (per
Confirmed Decision 3's "both independently capped" design) — it does not
create a hole, it just means the IP-side signal degrades to "no signal" for
clients this deployment cannot see an address for.

**Recovering `anon_id` for a freshly-issued cookie goes through
`cookie.verify`, not by re-parsing `cookie.issue`'s output.** `cookie.issue`
returns an opaque `"{anon_id}.{sig}"` string; rather than duplicating the
`.`-split logic `cookie.py` already owns, this module round-trips the fresh
value through `cookie.verify` (which must succeed — it was just signed with
the same secret) to obtain `anon_id`. One function is the single source of
truth for that string's shape.

**Pure, response-agnostic by design.** `from_request` never constructs or
mutates a `Response` — it only *decides* what should happen (recovered vs.
freshly issued, and the literal value to set if the latter). This keeps it
trivially testable with a hand-built `Request` and no ASGI response
machinery, and keeps the actual `response.set_cookie(...)` call (the only
place that needs a real `Response`) inside `gate.py`, per
tasks/todo-trial-limits.md's Task 3.

**`COOKIE_KWARGS` mirrors Starlette's own `Response.set_cookie` parameter
names exactly** (`httponly`, `secure`, `samesite`, `max_age` — verified via
``inspect.signature(starlette.responses.Response.set_cookie)`` rather than
guessed), so a caller can do
``response.set_cookie(cookie.COOKIE_NAME, fresh_value, **COOKIE_KWARGS)``
without re-deriving the attribute list from the spec text each time.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from fastapi import Request

from skillet.trial_limits import cookie

_NO_CLIENT_SENTINEL = "no-client"

COOKIE_KWARGS: dict[str, object] = {
    "httponly": True,
    "secure": True,
    "samesite": "lax",
    "max_age": cookie.COOKIE_MAX_AGE,
}


@dataclass(frozen=True, slots=True)
class Identity:
    """The rate-limit identity for one request: an IP hash and an anonymous
    cookie id, each checked against its own daily counter (see
    `counters.py`)."""

    ip_hash: str
    anon_id: str

    @staticmethod
    def from_request(request: Request, secret: bytes) -> tuple[Identity, str | None]:
        """Derive the `Identity` for `request`, issuing a fresh `sk_aid`
        value if none is present or the one present fails verification.

        Returns `(identity, cookie_value_to_set)`. `cookie_value_to_set` is
        `None` when the request already carried a valid `sk_aid` cookie (the
        caller sets nothing new); otherwise it is the fresh value the caller
        must set on the outgoing response via
        `response.set_cookie(cookie.COOKIE_NAME, cookie_value_to_set,
        **COOKIE_KWARGS)`.
        """
        host = request.client.host if request.client is not None else _NO_CLIENT_SENTINEL
        ip_hash = hashlib.sha256(host.encode()).hexdigest()

        existing = request.cookies.get(cookie.COOKIE_NAME)
        anon_id = cookie.verify(existing, secret) if existing is not None else None
        if anon_id is not None:
            return Identity(ip_hash=ip_hash, anon_id=anon_id), None

        fresh_value = cookie.issue(secret)
        fresh_anon_id = cookie.verify(fresh_value, secret)
        assert fresh_anon_id is not None  # issue() followed by verify() cannot fail
        return Identity(ip_hash=ip_hash, anon_id=fresh_anon_id), fresh_value
