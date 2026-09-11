"""Tests for skillet.recipe.executor.load_recipe — dynamic import + contract
validation. This is the one place the framework ever imports a recipe's
Python code, including sibling relative imports (`from .helpers import`).
"""

from pathlib import Path

import pytest

from skillet.recipe.executor import RecipeContractError, load_recipe

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes" / "demo"
ECHO = FIXTURES_ROOT / "10-echo"
ECHO_WITH_HELPER = FIXTURES_ROOT / "20-echo-with-helper"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def test_loads_echo() -> None:
    loaded = load_recipe(ECHO)
    assert loaded.params_cls.__name__ == "Params"
    assert loaded.run.__name__ == "run"


def test_loads_echo_with_helper_including_relative_import() -> None:
    """The one thing that must work for every real content recipe."""
    loaded = load_recipe(ECHO_WITH_HELPER)
    assert loaded.params_cls.__name__ == "Params"
    # prove the sibling import actually ran: call run() and see the helper's
    # effect (shouting), rather than just checking the module imported.
    import asyncio

    class _Ctx:
        emitted = []

    async def _drive():
        events = []

        class Emit:
            async def step(self, *a, **k):
                events.append(("step", a, k))

            async def result(self, data):
                events.append(("result", data))

        class Ctx:
            emit = Emit()

        params = loaded.params_cls(message="hi")
        await loaded.run(params, Ctx())
        return events

    events = asyncio.run(_drive())
    result_event = next(e for e in events if e[0] == "result")
    assert result_event[1]["message"] == "HI!"  # helpers.shout() uppercases + "!"


def test_loading_same_recipe_twice_does_not_crash() -> None:
    first = load_recipe(ECHO)
    second = load_recipe(ECHO)
    assert first.params_cls.__name__ == "Params"
    assert second.params_cls.__name__ == "Params"
    assert first.module is not second.module  # independently loaded, no collision


def test_missing_params_class_raises(tmp_path: Path) -> None:
    write(tmp_path / "recipe.py", "async def run(params, ctx):\n    pass\n")
    with pytest.raises(RecipeContractError, match="Params"):
        load_recipe(tmp_path)


def test_missing_run_function_raises(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\nclass Params(BaseParams):\n    pass\n",
    )
    with pytest.raises(RecipeContractError, match="run"):
        load_recipe(tmp_path)


def test_non_async_run_raises(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "def run(params, ctx):\n    pass\n",
    )
    with pytest.raises(RecipeContractError, match="async"):
        load_recipe(tmp_path)


def test_wrong_run_signature_raises(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(only_one_arg):\n    pass\n",
    )
    with pytest.raises(RecipeContractError, match="signature"):
        load_recipe(tmp_path)


def test_missing_entrypoint_file_raises(tmp_path: Path) -> None:
    with pytest.raises(RecipeContractError, match="not found"):
        load_recipe(tmp_path)


def test_syntax_error_in_recipe_raises_contract_error(tmp_path: Path) -> None:
    write(tmp_path / "recipe.py", "def broken(:\n")
    with pytest.raises(RecipeContractError):
        load_recipe(tmp_path)
