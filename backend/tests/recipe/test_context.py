"""Tests for skillet.recipe.context — RecipeContext and FileBundle."""

from pathlib import Path

import pytest

from skillet.recipe.context import FileBundle, RecipeContext
from skillet.recipe.emitter import Emitter


def make_recipe_dir(tmp_path: Path) -> Path:
    recipe_dir = tmp_path / "some-recipe"
    fixtures = recipe_dir / "fixtures"
    (fixtures / "sample-docs").mkdir(parents=True)
    (fixtures / "sample-docs" / "a.txt").write_text("doc a")
    (fixtures / "sample-docs" / "b.txt").write_text("doc b")
    (fixtures / "readme.txt").write_text("just one file")
    # a secret file *outside* fixtures/, to prove traversal can't reach it
    (recipe_dir / "secret.txt").write_text("do not read me")
    return recipe_dir


def test_fixtures_directory_returns_all_files_sorted(tmp_path: Path) -> None:
    bundle = FileBundle(make_recipe_dir(tmp_path))
    docs = bundle.fixtures("sample-docs")
    assert [d.filename for d in docs] == ["a.txt", "b.txt"]
    assert [d.text() for d in docs] == ["doc a", "doc b"]


def test_fixtures_single_file_returns_one_element_list(tmp_path: Path) -> None:
    bundle = FileBundle(make_recipe_dir(tmp_path))
    docs = bundle.fixtures("readme.txt")
    assert len(docs) == 1
    assert docs[0].text() == "just one file"


def test_fixtures_missing_raises(tmp_path: Path) -> None:
    bundle = FileBundle(make_recipe_dir(tmp_path))
    with pytest.raises(FileNotFoundError):
        bundle.fixtures("does-not-exist")


def test_fixtures_traversal_outside_fixtures_dir_is_rejected(tmp_path: Path) -> None:
    bundle = FileBundle(make_recipe_dir(tmp_path))
    with pytest.raises(ValueError):
        bundle.fixtures("../secret.txt")


def test_fixtures_traversal_via_nested_dotdot_is_rejected(tmp_path: Path) -> None:
    bundle = FileBundle(make_recipe_dir(tmp_path))
    with pytest.raises(ValueError):
        bundle.fixtures("sample-docs/../../secret.txt")


async def test_recipe_context_config_is_a_plain_mapping(tmp_path: Path) -> None:
    async def sink(_event) -> None:
        pass

    ctx = RecipeContext(
        config={"OPENAI_API_KEY": "sk-test"},
        files=FileBundle(make_recipe_dir(tmp_path)),
        emit=Emitter(sink),
        deadline=123.0,
    )
    assert ctx.config["OPENAI_API_KEY"] == "sk-test"
    assert ctx.config.get("MISSING") is None
    with pytest.raises(KeyError):
        _ = ctx.config["MISSING"]
    assert ctx.deadline == 123.0
