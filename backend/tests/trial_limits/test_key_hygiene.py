"""Key hygiene for the author's trial key — mirrors `execution`'s own
`test_key_hygiene.py` exactly, per docs/SPEC-trial-limits.md's Confirmed
Decision 8: this module implements no redaction of its own, and relies
entirely on `execution`'s already-covered `RedactingFilter`/
`redaction_context` (Confirmed Decision 8) to keep the injected author key
out of logs and client-visible errors, since injection happens before
`ctx.config` is built and rides in the same `config` map `execution`
already redacts.

This test proves that reliance is actually correct, not merely assumed: the
author's sentinel key is injected here by `gate_trial_run` itself (the
client never sends it), so if `execution`'s redaction were ever scoped only
to client-supplied config values, this test would catch the gap.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app
from skillet.trial_limits import author_key

SENTINEL = "sk-trial-sentinel-do-not-leak-9f1c2e3a4b5d6f708192a3b4c5d6e7f8"


class FakeUpstashRedis:
    def __init__(self) -> None:
        self._counts: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    async def incrby(self, key: str, amount: int) -> int:
        self._counts[key] = self._counts.get(key, 0) + amount
        return self._counts[key]

    async def expire(self, key: str, seconds: int) -> None:
        pass

    async def get(self, key: str) -> str | None:
        return str(self._counts[key]) if key in self._counts else None


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def make_gated_client(tmp_path: Path, recipe_py: str) -> TestClient:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        "[recipe]\n"
        'slug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n"
        '\n[[recipe.env]]\nkey = "OPENAI_API_KEY"\nprovider = "openai"\nrequired = true\n',
    )
    write(root / "g" / "10-x" / "recipe.py", recipe_py)

    app = create_app(recipes_root=root)
    app.state.trial_redis = FakeUpstashRedis()
    app.state.cookie_secret = b"key-hygiene-test-secret"
    return TestClient(app)


def iter_sse_data_lines(text: str) -> list[str]:
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


def test_sentinel_author_key_absent_from_logs_and_client_visible_error(
    tmp_path, caplog, monkeypatch
) -> None:
    """The author's key is injected server-side by `gate_trial_run`, never
    sent by the client — a leak here would mean `execution`'s redaction is
    scoped to client-supplied config only, missing the one value this
    module itself adds.
    """
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", SENTINEL)
    client = make_gated_client(
        tmp_path,
        "import logging\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "logger = logging.getLogger('skillet.recipe.executor')\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    logger.info('calling upstream with key %s', ctx.config['OPENAI_API_KEY'])\n"
        "    raise RuntimeError(f\"upstream rejected key {ctx.config['OPENAI_API_KEY']}\")\n",
    )

    with caplog.at_level(logging.INFO):
        resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    assert resp.status_code == 200  # the trial run was granted, then the recipe itself failed
    assert SENTINEL not in caplog.text

    events = [json.loads(line) for line in iter_sse_data_lines(resp.text)]
    assert events[-1]["type"] == "error"
    assert SENTINEL not in events[-1]["message"]
    assert SENTINEL not in resp.text  # belt-and-suspenders


def test_sentinel_author_key_absent_from_a_429_body(tmp_path, monkeypatch) -> None:
    """Even though `contract.py`'s own payload never has a field for a
    config value at all (by construction — scope/message/cta/
    retry_after_seconds only), assert this directly on a real denial
    response rather than only trusting that construction.
    """
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", SENTINEL)
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "0.00")
    client = make_gated_client(
        tmp_path,
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.result({})\n",
    )

    resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    assert resp.status_code == 429
    assert SENTINEL not in resp.text


def test_author_key_resolve_exception_never_contains_a_key_value(monkeypatch) -> None:
    """`author_key.resolve` only ever raises `TrialUnavailable` when a value
    is MISSING — there is no code path where the exception's own message
    could contain an actual key value, but assert this directly (the task's
    own explicit ask) rather than only reasoning about it.
    """
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", SENTINEL)

    try:
        author_key.resolve("some-other-unconfigured-provider")
        raise AssertionError("expected TrialUnavailable")
    except author_key.TrialUnavailable as exc:
        assert SENTINEL not in str(exc)
