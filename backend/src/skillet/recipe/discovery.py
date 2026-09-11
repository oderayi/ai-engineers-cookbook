"""Recipe discovery: scan a recipes root, parse manifests only, and build an
ordered registry keyed by slug.

Never imports a recipe's Python code — only `group.toml` / `recipe.toml` via
`skillet.recipe.manifest`. See docs/SPEC-recipe-framework.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from skillet.recipe.manifest import (
    GroupManifest,
    RecipeManifest,
    parse_group_toml,
    parse_recipe_toml,
)

_RECIPE_DIR_RE = re.compile(r"^\d+-(.+)$")


class DiscoveryError(Exception):
    """Raised when the recipes root is malformed: a duplicate slug, a
    directory name that doesn't match its own manifest, etc."""


@dataclass(frozen=True)
class DiscoveredRecipe:
    manifest: RecipeManifest
    group: GroupManifest
    dir: Path


class Registry:
    """An ordered, in-memory view of every recipe under a recipes root."""

    def __init__(self, recipes: list[DiscoveredRecipe]) -> None:
        self._recipes = recipes
        self._by_slug = {r.manifest.slug: r for r in recipes}

    def __iter__(self):
        return iter(self._recipes)

    def __len__(self) -> int:
        return len(self._recipes)

    def get(self, slug: str) -> DiscoveredRecipe | None:
        return self._by_slug.get(slug)


def recipe_slug_from_dir_name(dir_name: str) -> str | None:
    """`10-rag-basics` -> `rag-basics`; returns None if there's no NN- prefix."""
    match = _RECIPE_DIR_RE.match(dir_name)
    return match.group(1) if match else None


def discover(recipes_root: Path) -> Registry:
    """Scan `recipes_root` for `<group-id>/<NN>-<slug>/` directories.

    Non-group entries directly under the root (stray files, a README) are
    ignored. Raises `DiscoveryError` on a duplicate slug or any directory name
    that doesn't match its own manifest.
    """
    discovered: list[DiscoveredRecipe] = []
    seen_slugs: dict[str, Path] = {}

    for group_dir in sorted(p for p in recipes_root.iterdir() if p.is_dir()):
        group_toml = group_dir / "group.toml"
        if not group_toml.is_file():
            continue

        group = parse_group_toml(group_toml)
        if group_dir.name != group.id:
            raise DiscoveryError(
                f"{group_dir}: directory name does not match group.toml id {group.id!r}"
            )

        for recipe_dir in sorted(p for p in group_dir.iterdir() if p.is_dir()):
            recipe_toml = recipe_dir / "recipe.toml"
            if not recipe_toml.is_file():
                continue

            manifest = parse_recipe_toml(recipe_toml)

            dir_slug = recipe_slug_from_dir_name(recipe_dir.name)
            if dir_slug is None:
                raise DiscoveryError(
                    f"{recipe_dir}: directory name must be prefixed <NN>-<slug>, "
                    f"e.g. '10-{manifest.slug}'"
                )
            if dir_slug != manifest.slug:
                raise DiscoveryError(
                    f"{recipe_dir}: directory name does not match "
                    f"recipe.toml slug {manifest.slug!r}"
                )

            if manifest.slug in seen_slugs:
                raise DiscoveryError(
                    f"duplicate recipe slug {manifest.slug!r}: "
                    f"{seen_slugs[manifest.slug]} and {recipe_dir}"
                )
            seen_slugs[manifest.slug] = recipe_dir

            discovered.append(DiscoveredRecipe(manifest=manifest, group=group, dir=recipe_dir))

    discovered.sort(key=lambda r: (r.group.order, r.manifest.order))
    return Registry(discovered)
