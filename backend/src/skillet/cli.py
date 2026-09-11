"""The `skillet` CLI: `skillet recipes validate|list|new`.

See docs/SPEC-recipe-framework.md — this wraps discovery, load_recipe, and the
manifest schema; it introduces no new framework logic of its own.
"""

from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path

from skillet.recipe.discovery import DiscoveryError, discover, recipe_slug_from_dir_name
from skillet.recipe.executor import RecipeContractError, load_recipe

DEFAULT_RECIPES_ROOT = Path(__file__).resolve().parents[2] / "recipes"

_RECIPE_TOML_TEMPLATE = """[recipe]
slug = "{slug}"
title = "{title}"
summary = "TODO: one-sentence summary of what this recipe teaches."
difficulty = "basic"
order = {order}
estimated_runtime_seconds = 5

use_cases = [
  "TODO: a concrete use case",
]

[recipe.entrypoint]
module = "recipe"
"""

_RECIPE_PY_TEMPLATE = '''"""TODO: one-line description of what this recipe teaches."""

from skillet.recipe import Params as BaseParams
from skillet.recipe import RecipeContext


class Params(BaseParams):
    pass  # TODO: declare this recipe's inputs


async def run(params: Params, ctx: RecipeContext) -> None:
    await ctx.emit.step("main", "Running", status="start")
    await ctx.emit.step("main", "Running", status="finish")
    await ctx.emit.result({})
'''


def _referenced_fixture_names(recipe_py: Path) -> list[str]:
    """Static scan for `<...>.fixtures("name")` calls in a recipe's source —
    there's no manifest field for this, so a literal-string call argument is
    the closest thing to a "declared" fixture reference.
    """
    tree = ast.parse(recipe_py.read_text(), filename=str(recipe_py))
    names = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "fixtures"
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
        ):
            names.append(node.args[0].value)
    return names


def _validate_one(found) -> list[str]:
    """Returns human-readable problems for one recipe; empty if it passes."""
    problems: list[str] = []

    try:
        loaded = load_recipe(found.dir, found.manifest.entrypoint.module)
    except RecipeContractError as exc:
        return [str(exc)]  # nothing else is checkable without a loaded module

    for env in found.manifest.env:
        if not env.provider:
            problems.append(f"env var {env.key!r} has no provider")

    for example in found.manifest.example:
        try:
            loaded.params_cls.model_validate(example.params)
        except Exception as exc:  # pydantic.ValidationError
            problems.append(f"example {example.title!r} has invalid params: {exc}")

    entrypoint_py = found.dir / f"{found.manifest.entrypoint.module}.py"
    for name in _referenced_fixture_names(entrypoint_py):
        if not (found.dir / "fixtures" / name).exists():
            problems.append(f"references fixture {name!r} but fixtures/{name} does not exist")

    return problems


def cmd_validate(recipes_root: Path) -> int:
    if not recipes_root.is_dir():
        print(f"no such recipes root: {recipes_root}", file=sys.stderr)
        return 1

    try:
        registry = discover(recipes_root)
    except DiscoveryError as exc:
        print(f"discovery failed: {exc}", file=sys.stderr)
        return 1

    all_ok = True
    for found in registry:
        problems = _validate_one(found)
        if problems:
            all_ok = False
            print(f"FAIL {found.group.id}/{found.manifest.slug}")
            for problem in problems:
                print(f"  - {problem}")
        else:
            print(f"ok   {found.group.id}/{found.manifest.slug}")

    return 0 if all_ok else 1


def cmd_list(recipes_root: Path) -> int:
    if not recipes_root.is_dir():
        print(f"no such recipes root: {recipes_root}", file=sys.stderr)
        return 1

    for found in discover(recipes_root):
        print(f"{found.group.id}/{found.manifest.slug}  ({found.manifest.title})")
    return 0


def cmd_new(recipes_root: Path, group_slug: str) -> int:
    if "/" not in group_slug:
        print("usage: skillet recipes new <group>/<slug>", file=sys.stderr)
        return 1
    group_id, slug = group_slug.split("/", 1)

    group_dir = recipes_root / group_id
    group_toml = group_dir / "group.toml"

    if not group_toml.is_file():
        existing_groups = (
            [p for p in recipes_root.iterdir() if p.is_dir() and (p / "group.toml").is_file()]
            if recipes_root.is_dir()
            else []
        )
        group_dir.mkdir(parents=True, exist_ok=True)
        group_toml.write_text(
            f'[group]\nid = "{group_id}"\ntitle = "{group_id.replace("-", " ").title()}"\n'
            f"order = {len(existing_groups) + 1}\n"
        )

    existing_orders: list[int] = []
    for p in group_dir.iterdir():
        if not p.is_dir():
            continue
        dir_slug = recipe_slug_from_dir_name(p.name)
        if dir_slug == slug:
            print(f"recipe already exists: {p}", file=sys.stderr)
            return 1
        prefix = p.name.split("-", 1)[0]
        if prefix.isdigit():
            existing_orders.append(int(prefix))

    next_order = (max(existing_orders) + 10) if existing_orders else 10
    recipe_dir = group_dir / f"{next_order}-{slug}"
    recipe_dir.mkdir(parents=True)

    title = slug.replace("-", " ").title()
    (recipe_dir / "recipe.toml").write_text(
        _RECIPE_TOML_TEMPLATE.format(slug=slug, title=title, order=next_order)
    )
    (recipe_dir / "recipe.py").write_text(_RECIPE_PY_TEMPLATE)

    print(f"created {recipe_dir}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="skillet")
    top = parser.add_subparsers(dest="command", required=True)

    recipes = top.add_parser("recipes")
    sub = recipes.add_subparsers(dest="recipes_command", required=True)

    validate_p = sub.add_parser("validate")
    validate_p.add_argument("--root", type=Path, default=DEFAULT_RECIPES_ROOT)

    list_p = sub.add_parser("list")
    list_p.add_argument("--root", type=Path, default=DEFAULT_RECIPES_ROOT)

    new_p = sub.add_parser("new")
    new_p.add_argument("group_slug", help="e.g. rag/rag-basics")
    new_p.add_argument("--root", type=Path, default=DEFAULT_RECIPES_ROOT)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "recipes":
        if args.recipes_command == "validate":
            return cmd_validate(args.root)
        if args.recipes_command == "list":
            return cmd_list(args.root)
        if args.recipes_command == "new":
            return cmd_new(args.root, args.group_slug)

    return 1


def app() -> None:
    """Console-script entrypoint (`[project.scripts] skillet = "skillet.cli:app"`)."""
    sys.exit(main())
