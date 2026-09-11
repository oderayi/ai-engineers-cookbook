"""Tests for `skillet recipes list` and `skillet recipes new`."""

from pathlib import Path

from skillet.cli import cmd_list, cmd_new, cmd_validate

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def test_list_matches_discovery_order(capsys) -> None:
    exit_code = cmd_list(FIXTURES_ROOT)
    lines = capsys.readouterr().out.strip().splitlines()
    assert exit_code == 0
    assert lines == [
        "demo/echo  (Echo)",
        "demo/echo-with-helper  (Echo with helper)",
    ]


def test_new_creates_a_recipe_that_immediately_validates(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    exit_code = cmd_new(root, "demo/hello")
    capsys.readouterr()

    assert exit_code == 0
    recipe_dir = root / "demo" / "10-hello"
    assert (recipe_dir / "recipe.toml").is_file()
    assert (recipe_dir / "recipe.py").is_file()
    assert (root / "demo" / "group.toml").is_file()

    assert cmd_validate(root) == 0


def test_new_second_recipe_in_same_group_gets_next_order(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    cmd_new(root, "demo/first")
    cmd_new(root, "demo/second")
    capsys.readouterr()

    assert (root / "demo" / "10-first").is_dir()
    assert (root / "demo" / "20-second").is_dir()
    assert cmd_validate(root) == 0


def test_new_does_not_overwrite_existing_recipe(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    cmd_new(root, "demo/hello")
    original = (root / "demo" / "10-hello" / "recipe.py").read_text()
    capsys.readouterr()

    exit_code = cmd_new(root, "demo/hello")
    err = capsys.readouterr().err

    assert exit_code == 1
    assert "already exists" in err
    assert (root / "demo" / "10-hello" / "recipe.py").read_text() == original
