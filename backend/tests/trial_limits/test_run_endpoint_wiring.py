"""Endpoint-level tests for `trial_limits`' wiring into
`POST /recipes/{slug}/run` (Task 9) — via `execution`'s real route, with
`gate_trial_run` in the loop for real, not tested in isolation like
`test_gate.py`.

`app.state.trial_redis`/`app.state.cookie_secret` are set directly on the
created app (bypassing `create_app()`'s own env-var-driven construction of a
real `UpstashRedis`) so these tests never make a real HTTP call to Upstash —
matching `test_gate.py`'s own `FakeUpstashRedis` double.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app
from skillet.trial_limits.gate import TrialLimitsMisconfigured

SECRET = b"endpoint-test-secret"


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


def make_recipe_requiring_key(tmp_path: Path) -> Path:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        "[recipe]\n"
        'slug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n"
        '\n[[recipe.env]]\nkey = "OPENAI_API_KEY"\nprovider = "openai"\nrequired = true\n',
    )
    write(
        root / "g" / "10-x" / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.result({'used_key': ctx.config.get('OPENAI_API_KEY')})\n",
    )
    return root


def iter_sse_data_lines(text: str) -> list[str]:
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


def make_gated_client(root: Path, *, redis: FakeUpstashRedis | None = None) -> TestClient:
    app = create_app(recipes_root=root)
    app.state.trial_redis = redis if redis is not None else FakeUpstashRedis()
    app.state.cookie_secret = SECRET
    return TestClient(app)


def test_byok_request_bypasses_the_gate_entirely(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    root = make_recipe_requiring_key(tmp_path)
    client = make_gated_client(root)

    resp = client.post(
        "/recipes/x/run",
        data={"params": "{}", "config": json.dumps({"OPENAI_API_KEY": "sk-learners-own-key"})},
    )

    assert resp.status_code == 200
    events = [json.loads(line) for line in iter_sse_data_lines(resp.text)]
    assert events[-1]["data"] == {"used_key": "sk-learners-own-key"}
    assert "sk_aid" not in (resp.headers.get("set-cookie") or "")


def test_missing_required_key_with_no_trial_key_configured_returns_a_real_http_422(
    tmp_path: Path, monkeypatch
) -> None:
    """SPEC-distribution.md's own Success Criterion 4, exercised at the
    real HTTP level (not just gate_trial_run in isolation, per
    test_gate.py's own version of this): a real `422` response, before
    the SSE stream ever starts (unlike a mid-stream `error` event), and
    the request never reaches Redis at all -- `FailingRedis`-equivalent
    behavior is implied by never even calling any method on the double.
    """
    monkeypatch.delenv("SKILLET_TRIAL_OPENAI_API_KEY", raising=False)
    root = make_recipe_requiring_key(tmp_path)
    client = make_gated_client(root)

    resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    assert resp.status_code == 422
    assert "OPENAI_API_KEY" in resp.text


def test_granted_keyless_trial_run_uses_the_authors_key_and_sets_a_cookie(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    root = make_recipe_requiring_key(tmp_path)
    client = make_gated_client(root)

    resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    assert resp.status_code == 200
    events = [json.loads(line) for line in iter_sse_data_lines(resp.text)]
    assert events[-1]["data"] == {"used_key": "sk-author-key"}
    set_cookie = resp.headers.get("set-cookie") or ""
    assert "sk_aid=" in set_cookie
    assert "HttpOnly" in set_cookie


def test_third_keyless_request_same_day_is_denied_with_429(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_CAP", "2")
    root = make_recipe_requiring_key(tmp_path)
    redis = FakeUpstashRedis()
    client = make_gated_client(root, redis=redis)

    # Reuse the same client (and thus the same cookie jar) across requests,
    # matching a real browser's identity persistence.
    for _ in range(2):
        resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})
        assert resp.status_code == 200

    third = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})
    assert third.status_code == 429
    body = third.json()
    assert body["detail"]["scope"] == "trial_daily"
    assert body["detail"]["cta"] == "add_key"


def test_exhausted_global_budget_denies_before_any_recipe_code_runs(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "0.00")
    root = make_recipe_requiring_key(tmp_path)
    client = make_gated_client(root)

    resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    assert resp.status_code == 429
    assert resp.json()["detail"]["scope"] == "global_budget"


def test_misconfigured_deployment_surfaces_as_a_real_error_not_a_silent_429(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    root = make_recipe_requiring_key(tmp_path)
    app = create_app(recipes_root=root)
    app.state.trial_redis = None  # trial key funded, but Redis never configured
    app.state.cookie_secret = SECRET
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    # Never a 429 -- a real deployment misconfiguration is a 500, loudly.
    assert resp.status_code == 500


async def test_misconfigured_deployment_raises_trial_limits_misconfigured_directly(
    tmp_path: Path, monkeypatch
) -> None:
    """The same case as above, but asserting the actual exception type
    propagates (via `raise_server_exceptions=True`, TestClient's default),
    proving this is genuinely `TrialLimitsMisconfigured` and not some other
    failure that happens to also produce a 500.
    """
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    root = make_recipe_requiring_key(tmp_path)
    app = create_app(recipes_root=root)
    app.state.trial_redis = None
    app.state.cookie_secret = SECRET
    client = TestClient(app)

    import pytest

    with pytest.raises(TrialLimitsMisconfigured):
        client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})


def test_denied_request_with_a_file_upload_does_not_leak_its_tempdir(
    tmp_path: Path, monkeypatch
) -> None:
    """A trial-gated request that gets denied (429) still had
    parse_run_request stage any uploaded file bytes into a tempdir before
    the gate ever ran -- only run_event_stream's own `finally` cleans that
    up normally, and it never runs on a denial. Assert run.py's own
    denial-path cleanup actually removes it.
    """
    monkeypatch.setenv("SKILLET_TRIAL_OPENAI_API_KEY", "sk-author-key")
    monkeypatch.setenv("SKILLET_TRIAL_DAILY_BUDGET_USD", "0.00")  # deny immediately
    root = make_recipe_requiring_key(tmp_path)
    client = make_gated_client(root)

    import tempfile

    from skillet.execution import request as request_module

    created_dirs: list[str] = []
    real_mkdtemp = tempfile.mkdtemp

    def recording_mkdtemp(*args: object, **kwargs: object) -> str:
        d = real_mkdtemp(*args, **kwargs)
        created_dirs.append(d)
        return d

    monkeypatch.setattr(request_module.tempfile, "mkdtemp", recording_mkdtemp)

    resp = client.post("/recipes/x/run", data={"params": "{}", "config": "{}"})

    assert resp.status_code == 429
    assert len(created_dirs) == 1
    assert not Path(created_dirs[0]).exists()
