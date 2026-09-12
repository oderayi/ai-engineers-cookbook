"""POST /recipes/{slug}/run — streaming SSE endpoint. See docs/SPEC-execution.md.

Unknown slug -> `404`; a request `execution.request.parse_run_request`
rejects -> the mapped `422`/`413` it raises -> all before `execute()` (via
`execution.stream.run_event_stream`) ever runs any recipe code.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from sse_starlette import EventSourceResponse

from skillet.execution.request import parse_run_request
from skillet.execution.stream import run_event_stream
from skillet.recipe.discovery import DiscoveredRecipe, discover
from skillet.recipe.executor import RecipeContractError, load_recipe

router = APIRouter(prefix="/recipes", tags=["run"])


def _recipes_root(request: Request) -> Path:
    return request.app.state.recipes_root


def _find_or_404(slug: str, request: Request) -> DiscoveredRecipe:
    found = discover(_recipes_root(request)).get(slug)
    if found is None:
        raise HTTPException(status_code=404, detail=f"no such recipe: {slug!r}")
    return found


@router.post("/{slug}/run")
async def run_recipe(slug: str, request: Request) -> EventSourceResponse:
    recipe = _find_or_404(slug, request)

    try:
        loaded = load_recipe(recipe.dir, recipe.manifest.entrypoint.module)
    except RecipeContractError as exc:
        raise HTTPException(status_code=500, detail=f"recipe {slug!r} is broken: {exc}") from exc

    form = await request.form()
    parsed = await parse_run_request(recipe, loaded, form)

    return EventSourceResponse(run_event_stream(recipe, loaded, parsed))
