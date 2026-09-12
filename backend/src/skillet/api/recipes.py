"""GET /recipes, GET /recipes/{slug}, GET /recipes/{slug}/source.

`GET /recipes` is served from manifests only (via `discover`) — it never
imports a recipe's Python module. The other two endpoints import lazily,
only for the one recipe requested. See docs/SPEC-recipe-framework.md.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from skillet.api.schemas import (
    EnvVarOut,
    ExampleOut,
    RecipeDetail,
    RecipeSummary,
    SourceBundleOut,
    SourceFileRef,
    SourceFileWithContent,
)
from skillet.recipe.discovery import DiscoveredRecipe, discover
from skillet.recipe.executor import RecipeContractError, load_recipe
from skillet.recipe.source import read_source

router = APIRouter(prefix="/recipes", tags=["recipes"])


def _recipes_root(request: Request) -> Path:
    return request.app.state.recipes_root


def _find_or_404(slug: str, request: Request) -> DiscoveredRecipe:
    found = discover(_recipes_root(request)).get(slug)
    if found is None:
        raise HTTPException(status_code=404, detail=f"no such recipe: {slug!r}")
    return found


@router.get("", response_model=list[RecipeSummary])
def list_recipes(request: Request) -> list[RecipeSummary]:
    registry = discover(_recipes_root(request))
    return [
        RecipeSummary(
            slug=r.manifest.slug,
            title=r.manifest.title,
            summary=r.manifest.summary,
            group=r.group.id,
            group_title=r.group.title,
            group_icon=r.group.icon,
            difficulty=r.manifest.difficulty,
            order=r.manifest.order,
            estimated_runtime_seconds=r.manifest.estimated_runtime_seconds,
        )
        for r in registry
    ]


@router.get("/{slug}", response_model=RecipeDetail)
def get_recipe(slug: str, request: Request) -> RecipeDetail:
    found = _find_or_404(slug, request)

    try:
        loaded = load_recipe(found.dir, found.manifest.entrypoint.module)
    except RecipeContractError as exc:
        raise HTTPException(status_code=500, detail=f"recipe {slug!r} is broken: {exc}") from exc

    for example in found.manifest.example:
        try:
            loaded.params_cls.model_validate(example.params)
        except ValidationError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"recipe {slug!r} example {example.title!r} has invalid params: {exc}",
            ) from exc

    readme_path = found.dir / "README.md"
    readme_markdown = readme_path.read_text() if readme_path.is_file() else None

    bundle = read_source(found.dir, found.manifest.entrypoint.module)

    return RecipeDetail(
        slug=found.manifest.slug,
        title=found.manifest.title,
        summary=found.manifest.summary,
        group=found.group.id,
        group_title=found.group.title,
        group_icon=found.group.icon,
        difficulty=found.manifest.difficulty,
        order=found.manifest.order,
        estimated_runtime_seconds=found.manifest.estimated_runtime_seconds,
        use_cases=found.manifest.use_cases,
        readme_markdown=readme_markdown,
        examples=[
            ExampleOut(title=e.title, summary=e.summary, expect=e.expect, params=e.params)
            for e in found.manifest.example
        ],
        input_schema=loaded.params_cls.model_json_schema(),
        source_files=[SourceFileRef(path=f.path, language=f.language) for f in bundle.files],
        env=[
            EnvVarOut(
                key=e.key, provider=e.provider, required=e.required, description=e.description
            )
            for e in found.manifest.env
        ],
    )


@router.get("/{slug}/source", response_model=SourceBundleOut)
def get_recipe_source(slug: str, request: Request) -> SourceBundleOut:
    found = _find_or_404(slug, request)
    bundle = read_source(found.dir, found.manifest.entrypoint.module)
    return SourceBundleOut(
        files=[
            SourceFileWithContent(path=f.path, language=f.language, text=f.text, sha256=f.sha256)
            for f in bundle.files
        ],
        bundle_sha256=bundle.bundle_sha256,
    )
