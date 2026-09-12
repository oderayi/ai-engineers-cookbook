"""Tests for GET /recipes/{slug} — full detail."""

from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app
from skillet.recipe.discovery import discover
from skillet.recipe.executor import load_recipe

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def make_client(root: Path = FIXTURES_ROOT) -> TestClient:
    return TestClient(create_app(recipes_root=root))


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def test_detail_matches_params_json_schema() -> None:
    resp = make_client().get("/recipes/echo")
    assert resp.status_code == 200
    body = resp.json()

    registry = discover(FIXTURES_ROOT)
    loaded = load_recipe(registry.get("echo").dir)
    assert body["inputSchema"] == loaded.params_cls.model_json_schema()


def test_detail_includes_source_files_and_env() -> None:
    resp = make_client().get("/recipes/echo-with-helper")
    body = resp.json()
    assert {f["path"] for f in body["sourceFiles"]} == {"recipe.py", "helpers.py"}
    assert body["env"] == []  # neither fixture declares env vars


def test_detail_includes_group_title_and_icon() -> None:
    resp = make_client().get("/recipes/echo")
    body = resp.json()
    assert body["groupTitle"] == "Demo"  # from demo/group.toml, not just the bare id
    assert body["groupIcon"] is None  # demo/group.toml declares no icon


def test_detail_readme_markdown_null_when_absent() -> None:
    resp = make_client().get("/recipes/echo")
    assert resp.json()["readmeMarkdown"] is None


def test_detail_readme_markdown_present_when_file_exists(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    write(
        root / "g" / "group.toml",
        '[group]\nid = "g"\ntitle = "G"\norder = 1\n',
    )
    write(
        root / "g" / "10-x" / "recipe.toml",
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n",
    )
    write(
        root / "g" / "10-x" / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({})\n",
    )
    write(root / "g" / "10-x" / "README.md", "# Hello\n\nLong-form explanation.\n")

    resp = make_client(root).get("/recipes/x")
    assert resp.json()["readmeMarkdown"] == "# Hello\n\nLong-form explanation.\n"


def test_detail_broken_recipe_module_is_500(tmp_path: Path) -> None:
    """Discoverable (valid manifest) but the module itself fails to import —
    distinct from the invalid-example case below."""
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n",
    )
    write(root / "g" / "10-x" / "recipe.py", "def broken(:\n")  # syntax error

    resp = make_client(root).get("/recipes/x")
    assert resp.status_code == 500


def test_detail_unknown_slug_is_404() -> None:
    resp = make_client().get("/recipes/does-not-exist")
    assert resp.status_code == 404


def test_detail_invalid_example_params_is_500(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        "[recipe]\n"
        'slug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n\n"
        '[[recipe.example]]\ntitle = "Bad example"\n'
        "[recipe.example.params]\n"
        'not_a_real_field = "sneaky"\n',
    )
    write(
        root / "g" / "10-x" / "recipe.py",
        "from pydantic import Field\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n"
        "    question: str = Field(...)\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({})\n",
    )

    resp = make_client(root).get("/recipes/x")
    assert resp.status_code == 500
