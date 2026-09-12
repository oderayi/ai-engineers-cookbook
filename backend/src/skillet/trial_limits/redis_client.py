"""Thin async wrapper over Upstash Redis's REST API.

Exposes exactly the four commands the rest of `trial_limits` needs
(`counters.py`'s `INCR`+`EXPIRE`, `budget.py`'s `INCRBY`+`EXPIRE`+`GET`) —
nothing more. This module has no dependency on the `upstash-redis` SDK; it
speaks Upstash's REST API directly via `httpx.AsyncClient`, which keeps the
surface area small and testable with `respx`.

**Assumption, not independently verified**: this environment has no live
Upstash account to test against, so the request/response shape below is
built strictly from Upstash's publicly documented REST API convention (well
established and stable, per the module's own spec doc), not confirmed
end-to-end against a real deployment. If a later integration test against a
real Upstash instance finds a mismatch, this module — not the callers built
on top of it — is where to look first.

Documented shape assumed here:

- Each command is one HTTPS ``GET`` to
  ``{base_url}/{command}/{url-encoded-key}`` (and, for a command that takes a
  value/argument, a further ``/{url-encoded-argument}`` segment after the
  key) — the "path form" of Upstash's REST API. A POST-with-JSON-body form
  also exists in Upstash's docs; the path form is used here because it is
  simpler and sufficient for these four fixed-arity commands.
- Header ``Authorization: Bearer {token}`` on every request.
- A successful response is HTTP 2xx with a JSON body ``{"result": <value>}``:
  an integer for ``INCR``/``INCRBY``; for ``EXPIRE``, Upstash's docs show
  either ``1`` or ``"OK"``-shaped success depending on API version, so
  ``expire()`` here treats any of ``1``, ``True``, or ``"OK"`` as success and
  raises `UpstashError` on anything else (including the falsy-but-valid
  ``0`` a real ``EXPIRE`` returns for a key that doesn't exist — treated as
  an error here because every caller in this module only ever calls
  ``expire()`` immediately after an ``INCR``/``INCRBY`` that just created the
  key, so a ``0`` means something unexpected happened and is worth
  surfacing rather than silently swallowing).
- ``GET`` on a missing key returns ``{"result": null}`` — surfaced as `None`,
  never the string ``"null"``.
- An error response is a non-2xx HTTP status and/or a JSON body shaped
  ``{"error": "..."}``. A response that isn't valid JSON at all (network
  hiccup, proxy error page, etc.) is treated the same way: wrapped in
  `UpstashError`, never left to raise a bare `json.JSONDecodeError` or
  `httpx.HTTPStatusError` to the caller.

Client lifecycle
-----------------
`UpstashRedis` uses a single shared `httpx.AsyncClient` for connection
reuse across calls (cheaper than opening a new TCP/TLS connection per
Redis command, which matters here since every gated run makes at least one
of these calls). The client can be supplied by the caller (useful for
tests, or to share one client across multiple services) or, if omitted,
`UpstashRedis` creates and owns one itself. Either way, `UpstashRedis` is
usable as an async context manager (`async with UpstashRedis(...) as r:`)
and also exposes `aclose()` directly, for a caller (e.g. a later task's
`create_app()`/shutdown hook) that wants to hold onto the instance across
the app's lifetime and close it on shutdown without wrapping the whole
app in a context manager. Closing only ever closes a client this instance
created itself — a caller-supplied client is assumed to be owned and closed
by whoever constructed it.
"""

from __future__ import annotations

from types import TracebackType
from typing import Any
from urllib.parse import quote

import httpx

_EXPIRE_SUCCESS_VALUES = (1, True, "OK", "ok")


class UpstashError(Exception):
    """Raised for any failure talking to Upstash's REST API: a non-2xx HTTP
    response, a JSON body carrying an ``"error"`` field, a response body
    that isn't valid JSON, or a response shape this client doesn't
    recognize (e.g. missing ``"result"``, or a value of the wrong type for
    the command that was called).

    Carries the command, the key, and whatever detail is available, so a
    caller (or whoever's debugging a failure) doesn't need to re-derive
    what request actually failed.
    """

    def __init__(self, *, command: str, key: str, detail: str) -> None:
        self.command = command
        self.key = key
        self.detail = detail
        super().__init__(f"Upstash {command} on {key!r} failed: {detail}")


class UpstashRedis:
    """Async wrapper over Upstash Redis's REST API, exposing exactly the
    four commands `trial_limits` needs: `incr`, `incrby`, `expire`, `get`.

    Construction takes no defaults for `base_url`/`token` — the caller
    (`create_app()`) is responsible for reading those from the
    `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` environment
    variables; this class only ever receives already-resolved values.
    """

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = client if client is not None else httpx.AsyncClient()
        self._owns_client = client is None

    async def incr(self, key: str) -> int:
        """``INCR key`` — returns the new count."""
        result = await self._call("incr", key)
        return self._as_int("incr", key, result)

    async def incrby(self, key: str, amount: int) -> int:
        """``INCRBY key amount`` — returns the new total."""
        result = await self._call("incrby", key, str(amount))
        return self._as_int("incrby", key, result)

    async def expire(self, key: str, seconds: int) -> None:
        """``EXPIRE key seconds``. Callers only care that it happened, not
        the raw result — but a response that doesn't indicate success still
        raises `UpstashError` rather than being silently ignored.
        """
        result = await self._call("expire", key, str(seconds))
        if result not in _EXPIRE_SUCCESS_VALUES:
            raise UpstashError(
                command="expire",
                key=key,
                detail=f"unexpected EXPIRE result: {result!r}",
            )

    async def get(self, key: str) -> str | None:
        """``GET key`` — the stored string, or `None` if the key doesn't
        exist (Upstash's ``{"result": null}`` for a missing key).
        """
        result = await self._call("get", key)
        if result is None:
            return None
        return str(result)

    async def aclose(self) -> None:
        """Close the underlying `httpx.AsyncClient`, if this instance
        created it itself. A no-op for a caller-supplied client, which
        remains that caller's responsibility to close.
        """
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> UpstashRedis:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def _call(self, command: str, key: str, *args: str) -> Any:
        """Make the single HTTP call for one Upstash command and return its
        parsed ``"result"`` value, or raise `UpstashError` for any failure
        along the way (transport error, non-2xx status, non-JSON body, an
        ``"error"`` field, or a body missing ``"result"`` entirely).
        """
        segments = [quote(key, safe="")] + [quote(arg, safe="") for arg in args]
        url = "/".join([self._base_url, command, *segments])

        try:
            response = await self._client.get(url, headers=self._headers)
        except httpx.HTTPError as exc:
            raise UpstashError(
                command=command, key=key, detail=f"request failed: {exc}"
            ) from exc

        try:
            body = response.json()
        except ValueError as exc:
            # httpx raises a `json.JSONDecodeError` (a `ValueError` subclass)
            # for a non-JSON body — never let that leak out unwrapped.
            raise UpstashError(
                command=command,
                key=key,
                detail=(
                    f"non-JSON response (HTTP {response.status_code}): "
                    f"{response.text[:200]!r}"
                ),
            ) from exc

        if not (200 <= response.status_code < 300):
            error_detail = body.get("error") if isinstance(body, dict) else body
            raise UpstashError(
                command=command,
                key=key,
                detail=f"HTTP {response.status_code}: {error_detail!r}",
            )

        if isinstance(body, dict) and "error" in body:
            raise UpstashError(command=command, key=key, detail=str(body["error"]))

        if not isinstance(body, dict) or "result" not in body:
            raise UpstashError(
                command=command, key=key, detail=f"unexpected response shape: {body!r}"
            )

        return body["result"]

    @staticmethod
    def _as_int(command: str, key: str, value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError) as exc:
            raise UpstashError(
                command=command, key=key, detail=f"expected integer result, got {value!r}"
            ) from exc
