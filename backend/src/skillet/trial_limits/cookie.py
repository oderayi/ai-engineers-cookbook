"""Signing and verification of the `sk_aid` anonymous-id cookie value.

Per docs/SPEC-trial-limits.md, `trial-limits` identifies a browser without
accounts via a signed opaque id carried in a cookie. This module owns the
signing scheme only: it produces and checks the *value* that goes in the
cookie. It does not construct a `Response`/`Set-Cookie` header itself — that
is `identity.py`'s job (deriving `Identity` from a `Request`, including
issuing a fresh value when one is absent or fails verification) and
`gate.py`'s (actually attaching it to the outgoing response) in later tasks.

Public API
----------
``issue(secret: bytes) -> str``
    Generate a fresh, opaque, unguessable anonymous id and sign it with
    ``secret``. Returns ``"{anon_id}.{sig}"``.

``verify(cookie_value: str, secret: bytes) -> str | None``
    Recover the ``anon_id`` from a value this module previously issued,
    checking its signature against ``secret``. Returns ``None`` — never
    raises — for anything that isn't a validly-signed value: no ``.``
    separator, an empty string, a tampered signature, a signature valid
    under a different secret, or any other malformed input. Callers (in
    particular `identity.py`) must treat ``None`` as "no existing identity —
    issue a new one," never as an error to propagate.

Design decisions
-----------------
**The id itself carries no meaning.** ``anon_id`` is
``secrets.token_urlsafe(16)`` — 128 bits of CSPRNG randomness, not derived
from any PII (no IP, no user-agent, nothing accounts-shaped baked in). The
signature exists solely to make the value tamper-evident: without it, a
client could hand-craft any string as its "identity" and manufacture as many
fresh identities as it likes, defeating the whole point of the daily
per-identity cap this cookie is used to enforce (see `counters.py`). With
it, only this server (holding ``secret``) can mint a value that will
`verify`.

**HMAC-SHA256 over the id, not encryption.** There is nothing in
``anon_id`` worth keeping confidential from the client holding the cookie —
it's already sitting in their own browser. The only property needed is
*integrity*: the server must be able to detect a client-modified value, not
hide the id's own bytes from that same client. A keyed HMAC gives exactly
that at minimal cost; there's no encryption/decryption round-trip to get
wrong.

**`hmac.compare_digest`, never `==`, for the signature check.** A naive
``sig == expected`` string comparison short-circuits on the first differing
character, so its running time leaks how many leading hex digits of a
guessed signature are correct — a timing side-channel an attacker could in
principle use to forge a valid signature byte-by-byte without ever knowing
``secret``. ``hmac.compare_digest`` runs in time that depends only on the
length of its inputs, not their content, closing that channel.

**Split on the FIRST `.` only, via `str.split(".", 1)`.** ``anon_id`` itself
(from `secrets.token_urlsafe`) never contains a `.` — the URL-safe base64
alphabet it draws from is `[A-Za-z0-9_-]` only — so for any value this
module actually issued, splitting on the first `.` is unambiguous and
identical to splitting on the only `.`. Using `split(".", 1)` (rather than
`split(".")`, which would raise or produce a variable number of parts on
unexpected input) means a malformed or attacker-supplied value containing
*extra* dots still parses into exactly two pieces — `anon_id` (everything
before the first dot) and `sig` (everything after, dots and all) — rather
than raising. The signature is then recomputed over exactly that `anon_id`
prefix; if the extra dots were meant to be *part of* the intended anon_id
(e.g. a value signed over `"a.b"` as a single string), the recomputed HMAC
is over the truncated `"a"` instead and will not match, so the value is
correctly rejected rather than accepted against a truncated identity. There
is no way to embed dots in `anon_id` to smuggle a value past verification.

**Never raises.** `verify` catches malformed input structurally (via
`split(".", 1)`'s guaranteed 1-or-2-element result, checked with a
`ValueError` catch on unpacking) rather than validating shape up front, so
every call site can treat the return value as the single source of truth —
`None` means "not a valid existing identity," full stop, never an exception
a caller must also catch.
"""

import hashlib
import hmac
import secrets

COOKIE_NAME = "sk_aid"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # ~1 year, per docs/SPEC-trial-limits.md


def issue(secret: bytes) -> str:
    """Generate a fresh opaque anonymous id and sign it with ``secret``.

    Returns ``"{anon_id}.{sig}"`` where ``anon_id`` is
    ``secrets.token_urlsafe(16)`` (128 bits of randomness, URL-safe alphabet,
    never contains ``.``) and ``sig`` is the hex-encoded HMAC-SHA256 of
    ``anon_id`` keyed by ``secret``.
    """
    anon_id = secrets.token_urlsafe(16)
    sig = hmac.new(secret, anon_id.encode(), hashlib.sha256).hexdigest()
    return f"{anon_id}.{sig}"


def verify(cookie_value: str, secret: bytes) -> str | None:
    """Recover ``anon_id`` from ``cookie_value`` if its signature checks out
    against ``secret``; otherwise return ``None``.

    Never raises. Returns ``None`` for: an empty string, a value with no
    ``.`` separator, a tampered or otherwise-invalid signature, and a
    signature that is valid only under a different secret. See the module
    docstring for why splitting on the *first* ``.`` cannot be exploited by
    an anon_id-shaped value containing an unexpected extra ``.``.
    """
    try:
        anon_id, sig = cookie_value.split(".", 1)
    except ValueError:
        return None

    if not anon_id or not sig:
        return None

    expected = hmac.new(secret, anon_id.encode(), hashlib.sha256).hexdigest()
    return anon_id if hmac.compare_digest(sig, expected) else None
