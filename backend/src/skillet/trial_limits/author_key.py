"""Provider -> author trial-key env-var resolution.

Per docs/SPEC-trial-limits.md's Confirmed Decision 7, the author's own API
key — the one that funds every keyless-trial run — is never hardcoded or
passed around as a bare string. It lives in a backend environment variable,
one per provider, and this module is the single place that knows which env
var goes with which provider name. Adding a second provider later (per
Confirmed Decision 7's "one-line addition" promise) means adding one entry
to `TRIAL_KEY_ENV`, nothing else.

This module also answers the question `gate.py` needs before doing anything
else: is *any* trial key funded at all? A local/self-hosted clone with no
`SKILLET_TRIAL_*` env var set should never pay a Redis round-trip or issue a
tracking cookie for a gate that can never grant anything — see Confirmed
Decision 11 (the "no trial key configured" no-op).

Public API
----------
``TRIAL_KEY_ENV: dict[str, str]``
    Maps a provider name (e.g. ``"openai"``) to the env var holding that
    provider's author-funded trial key.

``resolve(provider: str) -> str``
    Returns the configured key for ``provider``. Raises `TrialUnavailable`
    for an unrecognized provider or one whose env var is unset or empty —
    never a bare ``KeyError`` from the underlying dict lookup.

``any_trial_key_configured() -> bool``
    ``True`` iff at least one provider in `TRIAL_KEY_ENV` has a non-empty
    value set in its env var right now.

Design decisions
-----------------
**`TrialUnavailable` carries a `.provider` attribute, not just a bare
message.** The spec's own Code Style sample raises `TrialUnavailable(provider)`
— which would make `str(exc)` merely the provider name and give a catching
caller no structured way to get it back short of re-parsing that string.
Here the exception takes a human-readable message (naming the provider, so
it's actually useful un-caught in a log or traceback) *and* stores the raw
`provider` value on a `.provider` attribute, so `gate.py` (or any other
caller that needs to know *which* provider failed, e.g. to decide whether a
different provider might still be tried) can inspect
``exc.provider`` directly instead of parsing `str(exc)`. This mirrors the
exact caller need described in Confirmed Decision 7/`gate.py`'s sample: catch
`TrialUnavailable`, fail closed with `scope: "global_budget"`, done — the
`.provider` attribute is there for any caller that wants more than that.

**Env vars are read fresh on every call, not cached at import time.** Same
convention as `counters.py`'s `_daily_trial_cap()`: reading
`os.environ.get(...)` inside the function body means a test can
`monkeypatch.setenv`/`monkeypatch.delenv` per-case without reimporting this
module, and a real deployment picks up a changed env var without a restart
depending on internal caching that doesn't exist here.

**Empty string does not count as "configured."** `os.environ.get(env_name)`
returning `""` is falsy in Python, so both `resolve` and
`any_trial_key_configured` already treat an env var explicitly set to the
empty string the same as one that's unset entirely — deliberately, since an
empty string is never a usable API key and treating it as "configured"
would let a misconfigured deployment silently believe it has a funded trial
key when it does not.
"""

from __future__ import annotations

import os

TRIAL_KEY_ENV: dict[str, str] = {"openai": "SKILLET_TRIAL_OPENAI_API_KEY"}


class TrialUnavailable(Exception):
    """Raised when this deployment has no author trial key for a provider —
    either the provider isn't in `TRIAL_KEY_ENV` at all, or its env var is
    unset/empty. Callers should treat this as "fail closed" (per
    `gate.py`'s sample: a `429` with `scope: "global_budget"`), never as an
    internal server error.

    Carries the failing provider name on `.provider` for callers that need
    to inspect it programmatically, in addition to a human-readable message.
    """

    def __init__(self, provider: str) -> None:
        self.provider = provider
        super().__init__(f"no trial key configured for provider {provider!r}")


def resolve(provider: str) -> str:
    """Returns the configured author trial key for `provider`.

    Raises `TrialUnavailable(provider)` — never a bare `KeyError` — when
    `provider` isn't a key in `TRIAL_KEY_ENV`, or when it is but the env var
    it names is unset or set to the empty string.
    """
    env_name = TRIAL_KEY_ENV.get(provider)
    value = env_name and os.environ.get(env_name)
    if not value:
        raise TrialUnavailable(provider)
    return value


def any_trial_key_configured() -> bool:
    """`True` iff at least one provider in `TRIAL_KEY_ENV` currently has a
    non-empty value set in its env var.

    `False` on a local/self-hosted clone with no `SKILLET_TRIAL_*` env var
    set — the signal `gate_trial_run` uses to become a no-op (Confirmed
    Decision 11).
    """
    return any(os.environ.get(env) for env in TRIAL_KEY_ENV.values())
