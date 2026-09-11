"""Tests for GET /recipes — manifest-only, never imports recipe Python."""

import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def make_client() -> TestClient:
    return TestClient(create_app(recipes_root=FIXTURES_ROOT))


def test_list_recipes_shape_and_ordering() -> None:
    resp = make_client().get("/recipes")
    assert resp.status_code == 200
    body = resp.json()

    slugs = [r["slug"] for r in body]
    assert slugs == ["echo", "echo-with-helper"]  # order 10 then 20 within demo group

    echo = body[0]
    assert echo["title"] == "Echo"
    assert echo["group"] == "demo"
    assert echo["difficulty"] == "basic"
    assert echo["estimatedRuntimeSeconds"] == 1  # camelCase on the wire


def test_list_recipes_never_imports_recipe_python(monkeypatch) -> None:
    def _boom(*args, **kwargs):
        raise AssertionError("GET /recipes must never import recipe Python code")

    monkeypatch.setattr(importlib.util, "spec_from_file_location", _boom)

    resp = make_client().get("/recipes")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_recipes_empty_root(tmp_path: Path) -> None:
    resp = TestClient(create_app(recipes_root=tmp_path)).get("/recipes")
    assert resp.status_code == 200
    assert resp.json() == []
