"""Task 15 — the 1-to-1 source guarantee (success criterion 2). The bytes
served by GET /recipes/{slug}/source, the bytes on disk, and the actual file
the executor imported must all agree — not just "same path is same path" but
proven via the imported module objects' own `__file__` attributes.
"""

import hashlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from skillet.api.app import create_app
from skillet.recipe.discovery import discover
from skillet.recipe.executor import load_recipe

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def make_client(root: Path = FIXTURES_ROOT) -> TestClient:
    return TestClient(create_app(recipes_root=root))


@pytest.mark.parametrize("slug", ["echo", "echo-with-helper"])
def test_served_source_matches_disk_and_the_actual_imported_file(slug: str) -> None:
    resp = make_client().get(f"/recipes/{slug}/source")
    assert resp.status_code == 200
    served = resp.json()

    recipe_dir = discover(FIXTURES_ROOT).get(slug).dir
    loaded = load_recipe(recipe_dir)

    assert served["files"], "expected at least one source file"
    for file in served["files"]:
        disk_bytes = (recipe_dir / file["path"]).read_bytes()

        # served text/hash match the disk bytes exactly
        assert file["text"] == disk_bytes.decode("utf-8")
        assert file["sha256"] == hashlib.sha256(disk_bytes).hexdigest()

        # AND the module object the executor actually holds points at that
        # exact file — not merely "the same path string", but the concrete
        # module __file__ importlib recorded when it ran the import.
        stem = Path(file["path"]).stem
        if stem == "recipe":
            imported_module = loaded.module
        else:
            imported_module = sys.modules[f"{loaded.module.__package__}.{stem}"]
        assert Path(imported_module.__file__).read_bytes() == disk_bytes


def test_corrupting_one_file_changes_all_three_consistently(tmp_path: Path) -> None:
    root = tmp_path / "recipes"
    recipe_dir = root / "g" / "10-x"
    recipe_dir.mkdir(parents=True)
    (root / "g" / "group.toml").write_text('[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    (recipe_dir / "recipe.toml").write_text(
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n"
    )
    (recipe_dir / "recipe.py").write_text(
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({})\n"
    )

    client = make_client(root)
    before = client.get("/recipes/x/source").json()["files"][0]

    (recipe_dir / "recipe.py").write_text(
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({'changed': True})\n"
    )

    after = client.get("/recipes/x/source").json()["files"][0]

    assert after["sha256"] != before["sha256"]
    assert after["text"] != before["text"]
    # and the freshly-reloaded executor import reflects the new bytes too
    loaded_after = load_recipe(recipe_dir)
    assert (
        Path(loaded_after.module.__file__).read_bytes() == (recipe_dir / "recipe.py").read_bytes()
    )
