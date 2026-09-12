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
    # order 10, 20, 30 within the demo group -- "slow-echo" (execution's own
    # E2E cancel-mid-run fixture) added at order 30, after this test was
    # first written for just the two recipe-framework smoke-test recipes.
    assert slugs == ["echo", "echo-with-helper", "slow-echo"]

    echo = body[0]
    assert echo["title"] == "Echo"
    assert echo["group"] == "demo"
    assert echo["groupTitle"] == "Demo"  # from demo/group.toml, not just the bare id
    assert echo["groupIcon"] is None  # demo/group.toml declares no icon
    assert echo["difficulty"] == "basic"
    assert echo["estimatedRuntimeSeconds"] == 1  # camelCase on the wire


def test_list_recipes_includes_group_icon_when_declared(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    (root / "g").mkdir(parents=True)
    (root / "g" / "group.toml").write_text(
        '[group]\nid = "g"\ntitle = "G"\norder = 1\nicon = "flask-conical"\n'
    )
    recipe_dir = root / "g" / "10-x"
    recipe_dir.mkdir()
    (recipe_dir / "recipe.toml").write_text(
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n"
    )
    (recipe_dir / "recipe.py").write_text(
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({})\n"
    )

    resp = TestClient(create_app(recipes_root=root)).get("/recipes")
    assert resp.json()[0]["groupIcon"] == "flask-conical"


def test_list_recipes_never_imports_recipe_python(monkeypatch) -> None:
    def _boom(*args, **kwargs):
        raise AssertionError("GET /recipes must never import recipe Python code")

    monkeypatch.setattr(importlib.util, "spec_from_file_location", _boom)

    resp = make_client().get("/recipes")
    assert resp.status_code == 200
    assert len(resp.json()) == 3  # echo, echo-with-helper, slow-echo


def test_list_recipes_empty_root(tmp_path: Path) -> None:
    resp = TestClient(create_app(recipes_root=tmp_path)).get("/recipes")
    assert resp.status_code == 200
    assert resp.json() == []
