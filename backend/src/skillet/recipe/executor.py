"""Dynamically import a recipe module and validate it satisfies the recipe
contract: a `Params` subclass and an `async def run(params, ctx)`.

This is the one place in the framework that ever imports a recipe's Python
code — including a sibling relative import (`from .helpers import ...`),
which every real content recipe with more than one file depends on working.
See docs/SPEC-recipe-framework.md.
"""

from __future__ import annotations

import importlib.util
import inspect
import sys
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from importlib.machinery import ModuleSpec
from pathlib import Path
from types import ModuleType

from skillet.recipe.context import RecipeContext
from skillet.recipe.params import Params

RunFn = Callable[[Params, RecipeContext], Awaitable[None]]


class RecipeContractError(Exception):
    """A recipe module doesn't satisfy the framework's contract, or couldn't
    be imported at all."""


@dataclass(frozen=True)
class LoadedRecipe:
    module: ModuleType
    params_cls: type[Params]
    run: RunFn


def load_recipe(recipe_dir: Path, entrypoint_module: str = "recipe") -> LoadedRecipe:
    """Import `<recipe_dir>/<entrypoint_module>.py` and validate its contract.

    Raises `RecipeContractError` naming exactly what's wrong: missing file,
    import failure, missing `Params`, missing/non-async/wrong-signature `run`.
    """
    module = _import_recipe_module(recipe_dir, entrypoint_module)

    params_cls = getattr(module, "Params", None)
    if not (isinstance(params_cls, type) and issubclass(params_cls, Params)):
        raise RecipeContractError(
            f"{recipe_dir}: must define a `Params` class that subclasses skillet.recipe.Params"
        )

    run = getattr(module, "run", None)
    if run is None or not inspect.iscoroutinefunction(run):
        raise RecipeContractError(f"{recipe_dir}: must define `async def run(params, ctx)`")

    param_names = list(inspect.signature(run).parameters)
    if param_names != ["params", "ctx"]:
        raise RecipeContractError(
            f"{recipe_dir}: run() must have exactly the signature (params, ctx), "
            f"got ({', '.join(param_names)})"
        )

    return LoadedRecipe(module=module, params_cls=params_cls, run=run)


def _import_recipe_module(recipe_dir: Path, entrypoint_module: str) -> ModuleType:
    entrypoint_path = recipe_dir / f"{entrypoint_module}.py"
    if not entrypoint_path.is_file():
        raise RecipeContractError(f"{recipe_dir}: entrypoint not found: {entrypoint_path}")

    # A fresh synthetic package name per call keeps repeated/concurrent loads
    # (even of the same recipe) from colliding in sys.modules. The recipe_dir
    # is registered as that package's search path so a sibling relative
    # import (`from .helpers import ...`) resolves against it.
    package_name = f"_skillet_recipe_{uuid.uuid4().hex}"
    package_spec = ModuleSpec(package_name, loader=None, is_package=True)
    package_spec.submodule_search_locations = [str(recipe_dir)]
    package = importlib.util.module_from_spec(package_spec)
    sys.modules[package_name] = package

    module_name = f"{package_name}.{entrypoint_module}"
    module_spec = importlib.util.spec_from_file_location(module_name, entrypoint_path)
    if module_spec is None or module_spec.loader is None:
        raise RecipeContractError(
            f"{recipe_dir}: could not build an import spec for {entrypoint_path}"
        )

    module = importlib.util.module_from_spec(module_spec)
    sys.modules[module_name] = module
    try:
        module_spec.loader.exec_module(module)
    except RecipeContractError:
        raise
    except Exception as exc:
        raise RecipeContractError(f"{recipe_dir}: failed to import — {exc}") from exc

    return module
