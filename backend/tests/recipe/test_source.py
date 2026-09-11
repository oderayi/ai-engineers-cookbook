"""Tests for skillet.recipe.source — reading and hashing a recipe's source."""

import hashlib
from pathlib import Path

import pytest

from skillet.recipe.source import read_source

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes" / "demo"
ECHO = FIXTURES_ROOT / "10-echo"
ECHO_WITH_HELPER = FIXTURES_ROOT / "20-echo-with-helper"


def test_echo_bundle_has_exactly_one_file() -> None:
    bundle = read_source(ECHO)
    assert [f.path for f in bundle.files] == ["recipe.py"]
    assert bundle.files[0].language == "python"


def test_echo_with_helper_bundle_has_both_files_entrypoint_first() -> None:
    bundle = read_source(ECHO_WITH_HELPER)
    assert bundle.files[0].path == "recipe.py"
    assert {f.path for f in bundle.files} == {"recipe.py", "helpers.py"}


def test_file_hash_matches_raw_bytes() -> None:
    bundle = read_source(ECHO)
    raw = (ECHO / "recipe.py").read_bytes()
    assert bundle.files[0].sha256 == hashlib.sha256(raw).hexdigest()


def test_deterministic_across_reads() -> None:
    first = read_source(ECHO_WITH_HELPER)
    second = read_source(ECHO_WITH_HELPER)
    assert first.bundle_sha256 == second.bundle_sha256
    assert {f.sha256 for f in first.files} == {f.sha256 for f in second.files}


def test_changing_one_file_changes_only_that_files_hash(tmp_path: Path) -> None:
    recipe_dir = tmp_path / "10-x"
    recipe_dir.mkdir()
    (recipe_dir / "recipe.py").write_text("from .helpers import f\n")
    (recipe_dir / "helpers.py").write_text("def f():\n    return 1\n")

    before = read_source(recipe_dir)
    helper_hash_before = next(f.sha256 for f in before.files if f.path == "helpers.py")
    recipe_hash_before = next(f.sha256 for f in before.files if f.path == "recipe.py")

    (recipe_dir / "helpers.py").write_text("def f():\n    return 2\n")  # one-byte-ish change

    after = read_source(recipe_dir)
    helper_hash_after = next(f.sha256 for f in after.files if f.path == "helpers.py")
    recipe_hash_after = next(f.sha256 for f in after.files if f.path == "recipe.py")

    assert helper_hash_after != helper_hash_before
    assert recipe_hash_after == recipe_hash_before  # untouched file, untouched hash
    assert after.bundle_sha256 != before.bundle_sha256  # bundle hash still changes


def test_missing_entrypoint_raises() -> None:
    with pytest.raises(FileNotFoundError):
        read_source(Path("/nonexistent/recipe/dir"))


def test_non_python_files_are_excluded(tmp_path: Path) -> None:
    recipe_dir = tmp_path / "10-x"
    recipe_dir.mkdir()
    (recipe_dir / "recipe.py").write_text("x = 1\n")
    (recipe_dir / "recipe.toml").write_text("[recipe]\n")
    (recipe_dir / "README.md").write_text("# hi\n")

    bundle = read_source(recipe_dir)
    assert [f.path for f in bundle.files] == ["recipe.py"]
