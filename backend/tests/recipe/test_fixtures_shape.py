"""Task 3: the two fixture recipes are well-formed per the manifest schema and
are at least syntactically valid Python. Importing/running them is Task 9/10 —
this test deliberately does neither.

Both live under the `demo` group (`demo/10-echo`, `demo/20-echo-with-helper`),
matching the spec's `<group-id>/<NN>-<slug>/` layout — plain recipe dirs
without a group wrapper aren't a shape discovery (Task 7) supports.
"""

import ast
from pathlib import Path

from skillet.recipe.manifest import parse_group_toml, parse_recipe_toml

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"
DEMO = FIXTURES_ROOT / "demo"
ECHO = DEMO / "10-echo"
ECHO_WITH_HELPER = DEMO / "20-echo-with-helper"


def test_demo_group_manifest_is_valid() -> None:
    group = parse_group_toml(DEMO / "group.toml")
    assert group.id == "demo"


def test_echo_manifest_is_valid() -> None:
    manifest = parse_recipe_toml(ECHO / "recipe.toml")
    assert manifest.slug == "echo"
    assert manifest.entrypoint.module == "recipe"


def test_echo_with_helper_manifest_is_valid() -> None:
    manifest = parse_recipe_toml(ECHO_WITH_HELPER / "recipe.toml")
    assert manifest.slug == "echo-with-helper"


def test_echo_files_exist() -> None:
    assert (ECHO / "recipe.toml").is_file()
    assert (ECHO / "recipe.py").is_file()


def test_echo_with_helper_files_exist() -> None:
    assert (ECHO_WITH_HELPER / "recipe.toml").is_file()
    assert (ECHO_WITH_HELPER / "recipe.py").is_file()
    assert (ECHO_WITH_HELPER / "helpers.py").is_file()


def test_echo_with_helper_recipe_imports_helpers() -> None:
    """Confirms the fixture actually exercises the sibling-import path it
    claims to, without importing the module (that's Task 9)."""
    source = (ECHO_WITH_HELPER / "recipe.py").read_text()
    assert "from .helpers import" in source


def _assert_syntactically_valid(path: Path) -> None:
    ast.parse(path.read_text(), filename=str(path))


def test_all_fixture_recipe_python_files_are_syntactically_valid() -> None:
    for recipe_py in FIXTURES_ROOT.glob("*/*/recipe.py"):
        _assert_syntactically_valid(recipe_py)
    for helper_py in FIXTURES_ROOT.glob("*/*/helpers.py"):
        _assert_syntactically_valid(helper_py)
