"""Tests for skillet.recipe.discovery — manifest-only, ordered registry."""

import importlib
import importlib.util
from pathlib import Path

import pytest

from skillet.recipe.discovery import DiscoveryError, discover

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def make_recipe(dir_path: Path, *, slug: str, order: int) -> None:
    write(
        dir_path / "recipe.toml",
        f"""
[recipe]
slug = "{slug}"
title = "{slug}"
summary = "..."
difficulty = "basic"
order = {order}
estimated_runtime_seconds = 1
""",
    )


def make_group(dir_path: Path, *, group_id: str, order: int) -> None:
    write(
        dir_path / "group.toml",
        f"""
[group]
id = "{group_id}"
title = "{group_id}"
order = {order}
""",
    )


def test_discovers_real_fixtures_never_importing_python(monkeypatch) -> None:
    def _boom(*args, **kwargs):
        raise AssertionError("discovery must never import recipe Python code")

    # Patch the actual module objects (not by dotted-string path) so
    # monkeypatch's own resolution doesn't itself trigger the patched call.
    monkeypatch.setattr(importlib.util, "spec_from_file_location", _boom)
    monkeypatch.setattr(importlib, "import_module", _boom)

    registry = discover(FIXTURES_ROOT)

    slugs = [r.manifest.slug for r in registry]
    assert "echo" in slugs
    assert "echo-with-helper" in slugs


def test_registry_get_by_slug() -> None:
    registry = discover(FIXTURES_ROOT)
    found = registry.get("echo")
    assert found is not None
    assert found.manifest.slug == "echo"
    assert found.group.id == "demo"

    assert registry.get("no-such-slug") is None


def test_ordered_by_group_order_then_recipe_order(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    make_group(root / "b-group", group_id="b-group", order=2)
    make_recipe(root / "b-group" / "10-first", slug="first", order=10)

    make_group(root / "a-group", group_id="a-group", order=1)
    make_recipe(root / "a-group" / "20-second", slug="second", order=20)
    make_recipe(root / "a-group" / "10-third", slug="third", order=10)

    registry = discover(root)
    assert [r.manifest.slug for r in registry] == ["third", "second", "first"]


def test_duplicate_slug_across_directories_raises(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    make_group(root / "g", group_id="g", order=1)
    make_recipe(root / "g" / "10-dup", slug="dup", order=10)
    make_recipe(root / "g" / "20-dup", slug="dup", order=20)

    with pytest.raises(DiscoveryError, match="dup"):
        discover(root)


def test_recipe_dir_name_not_matching_slug_raises(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    make_group(root / "g", group_id="g", order=1)
    # dir says "10-wrong-name" but the manifest's slug is "actual-slug"
    make_recipe(root / "g" / "10-wrong-name", slug="actual-slug", order=10)

    with pytest.raises(DiscoveryError, match="actual-slug"):
        discover(root)


def test_group_dir_name_not_matching_id_raises(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    make_group(root / "wrong-dir-name", group_id="actual-id", order=1)
    make_recipe(root / "wrong-dir-name" / "10-x", slug="x", order=10)

    with pytest.raises(DiscoveryError, match="actual-id"):
        discover(root)


def test_recipe_dir_missing_numeric_prefix_raises(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    make_group(root / "g", group_id="g", order=1)
    make_recipe(root / "g" / "no-prefix", slug="no-prefix", order=10)

    with pytest.raises(DiscoveryError):
        discover(root)


def test_non_group_entries_in_recipes_root_are_ignored(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    root.mkdir()
    (root / "README.md").write_text("not a group")
    make_group(root / "g", group_id="g", order=1)
    make_recipe(root / "g" / "10-x", slug="x", order=10)

    registry = discover(root)
    assert len(registry) == 1
