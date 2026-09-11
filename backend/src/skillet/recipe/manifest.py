"""Recipe and group manifest schemas, parsed from recipe.toml / group.toml.

Manifests are read with stdlib `tomllib` only — this module never imports a
recipe's Python code. See docs/SPEC-recipe-framework.md for the manifest shape.
"""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError


class ManifestError(Exception):
    """Raised when a recipe.toml / group.toml fails to read or validate."""


class RecipeEnvEntry(BaseModel):
    key: str
    provider: str
    required: bool = False
    description: str = ""


class RecipeExample(BaseModel):
    title: str
    summary: str = ""
    expect: str = ""
    # Validated against the recipe's Params model later (Task 13) — not here.
    params: dict[str, Any] = Field(default_factory=dict)


class RecipeEntrypoint(BaseModel):
    module: str = "recipe"


class RecipeManifest(BaseModel):
    slug: str
    title: str
    summary: str
    difficulty: Literal["basic", "intermediate", "advanced"]
    order: int
    estimated_runtime_seconds: int
    use_cases: list[str] = Field(default_factory=list)
    env: list[RecipeEnvEntry] = Field(default_factory=list)
    example: list[RecipeExample] = Field(default_factory=list)
    entrypoint: RecipeEntrypoint = Field(default_factory=RecipeEntrypoint)


class GroupManifest(BaseModel):
    id: str
    title: str
    order: int
    summary: str = ""
    icon: str | None = None


def _load_toml(path: Path) -> dict[str, Any]:
    try:
        with path.open("rb") as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as exc:
        raise ManifestError(f"{path}: invalid TOML — {exc}") from exc
    except OSError as exc:
        raise ManifestError(f"{path}: could not read file — {exc}") from exc


def _validate(model: type[BaseModel], data: dict[str, Any], path: Path, table: str) -> Any:
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        missing = [
            ".".join(str(p) for p in err["loc"]) for err in exc.errors() if err["type"] == "missing"
        ]
        if missing:
            raise ManifestError(
                f"{path}: missing required field(s) in [{table}]: {', '.join(missing)}"
            ) from exc
        raise ManifestError(f"{path}: invalid [{table}] table — {exc}") from exc


def parse_recipe_toml(path: Path) -> RecipeManifest:
    """Parse and validate a recipe.toml. Raises ManifestError on any problem."""
    raw = _load_toml(path)
    if "recipe" not in raw:
        raise ManifestError(f"{path}: missing top-level [recipe] table")
    return _validate(RecipeManifest, raw["recipe"], path, "recipe")


def parse_group_toml(path: Path) -> GroupManifest:
    """Parse and validate a group.toml. Raises ManifestError on any problem."""
    raw = _load_toml(path)
    if "group" not in raw:
        raise ManifestError(f"{path}: missing top-level [group] table")
    return _validate(GroupManifest, raw["group"], path, "group")
