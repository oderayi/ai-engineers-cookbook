"""Tests for `skillet recipes list` and `skillet recipes new`."""

import sys
from pathlib import Path

import pytest

from skillet.cli import app, cmd_list, cmd_new, cmd_validate, main

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


def test_list_nonexistent_root_fails_clearly(tmp_path: Path, capsys) -> None:
    exit_code = cmd_list(tmp_path / "does-not-exist")
    err = capsys.readouterr().err
    assert exit_code == 1
    assert "no such recipes root" in err


def test_new_without_slash_fails_clearly(tmp_path: Path, capsys) -> None:
    exit_code = cmd_new(tmp_path, "no-slash-here")
    err = capsys.readouterr().err
    assert exit_code == 1
    assert "usage" in err


def test_list_and_new_via_main_entrypoint(tmp_path: Path, capsys) -> None:
    assert main(["recipes", "list", "--root", str(FIXTURES_ROOT)]) == 0
    assert main(["recipes", "new", "demo/hello", "--root", str(tmp_path)]) == 0
    capsys.readouterr()


def test_app_entrypoint_exits_with_main_return_code(monkeypatch, capsys) -> None:
    monkeypatch.setattr(sys, "argv", ["skillet", "recipes", "list", "--root", str(FIXTURES_ROOT)])
    with pytest.raises(SystemExit) as exc_info:
        app()
    capsys.readouterr()
    assert exc_info.value.code == 0
