"""Tests for `create_app`'s own concerns (not any one route) — currently
just CORS, added for `catalog`: the first module to call this API from a
browser origin.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def test_cors_allows_default_frontend_origin_by_default() -> None:
    client = TestClient(create_app(recipes_root=FIXTURES_ROOT))
    resp = client.get("/recipes", headers={"Origin": "http://localhost:3000"})
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_rejects_an_unlisted_origin_by_default() -> None:
    client = TestClient(create_app(recipes_root=FIXTURES_ROOT))
    resp = client.get("/recipes", headers={"Origin": "http://evil.example.com"})
    assert "access-control-allow-origin" not in resp.headers


def test_cors_origins_configurable_via_env_var(monkeypatch) -> None:
    monkeypatch.setenv("SKILLET_CORS_ORIGINS", "http://example.com, http://other.example.com")
    client = TestClient(create_app(recipes_root=FIXTURES_ROOT))

    resp = client.get("/recipes", headers={"Origin": "http://other.example.com"})
    assert resp.headers["access-control-allow-origin"] == "http://other.example.com"

    # The default dev origin is no longer allowed once the env var is set —
    # it's a replacement, not an addition.
    resp = client.get("/recipes", headers={"Origin": "http://localhost:3000"})
    assert "access-control-allow-origin" not in resp.headers
