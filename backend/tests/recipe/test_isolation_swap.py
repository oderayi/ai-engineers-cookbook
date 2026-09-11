"""Success criterion 7: adding a recipe requires zero changes under
src/skillet/. This test writes a brand-new recipe entirely at test time (not
under tests/fixtures/) and drives it through discovery -> load -> execute
using only Tasks 7/9/10's public functions.
"""

from pathlib import Path

from skillet.recipe.context import FileBundle
from skillet.recipe.discovery import discover
from skillet.recipe.events import ResultEvent
from skillet.recipe.executor import execute, load_recipe


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


async def test_a_brand_new_recipe_works_with_no_framework_changes(tmp_path: Path) -> None:
    root = tmp_path / "recipes"

    write(
        root / "throwaway" / "group.toml",
        """
[group]
id = "throwaway"
title = "Throwaway"
order = 1
""",
    )
    write(
        root / "throwaway" / "10-double" / "recipe.toml",
        """
[recipe]
slug = "double"
title = "Double a number"
summary = "Doubles the input number. Exists only for this test."
difficulty = "basic"
order = 10
estimated_runtime_seconds = 1
""",
    )
    write(
        root / "throwaway" / "10-double" / "recipe.py",
        "from pydantic import Field\n"
        "from skillet.recipe import Params as BaseParams, RecipeContext\n\n"
        "class Params(BaseParams):\n"
        "    n: int = Field(..., description='number to double')\n\n"
        "async def run(params: Params, ctx: RecipeContext) -> None:\n"
        "    await ctx.emit.step('double', 'Doubling', status='start')\n"
        "    await ctx.emit.step('double', 'Doubling', status='finish')\n"
        "    await ctx.emit.result({'doubled': params.n * 2})\n",
    )

    # 1. discovered via the manifest-only registry
    registry = discover(root)
    found = registry.get("double")
    assert found is not None

    # 2. loaded and validated via the executor
    loaded = load_recipe(found.dir)

    # 3. executed end-to-end
    files = FileBundle(found.dir)
    events = [ev async for ev in execute(loaded, loaded.params_cls(n=21), config={}, files=files)]

    assert isinstance(events[-1], ResultEvent)
    assert events[-1].data == {"doubled": 42}
