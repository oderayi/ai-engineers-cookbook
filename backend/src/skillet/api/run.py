"""POST /recipes/{slug}/run — streaming SSE endpoint. See docs/SPEC-execution.md.

Unknown slug -> `404`; a request `execution.request.parse_run_request`
rejects -> the mapped `422`/`413` it raises -> `trial_limits.gate_trial_run`
grants or denies (`429`, or `500` for a real deployment misconfiguration) ->
all before `execute()` (via `execution.stream.run_event_stream`) ever runs
any recipe code.
"""

from __future__ import annotations

import dataclasses
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from sse_starlette import EventSourceResponse

from skillet.execution.request import parse_run_request
from skillet.execution.stream import run_event_stream
from skillet.recipe.discovery import DiscoveredRecipe, discover
from skillet.recipe.executor import RecipeContractError, load_recipe
from skillet.trial_limits.gate import gate_trial_run

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

    # `gate_trial_run` needs a real `Response` to call `.set_cookie(...)` on
    # for a freshly-issued `sk_aid` — but this endpoint returns an
    # `EventSourceResponse` object directly rather than a value FastAPI
    # builds a response around, and FastAPI does NOT merge an
    # injected-`response`-parameter's headers into a directly-returned
    # `Response` (confirmed empirically: a cookie set on an injected
    # `response: Response` dependency parameter is silently discarded when
    # the endpoint returns a different `Response` instance instead). A
    # throwaway `Response()` here is mutated by the gate, and any
    # `set-cookie` header it accumulated is copied onto the real
    # `EventSourceResponse` below before returning it — the one mechanism
    # that actually reaches the client for this kind of endpoint.
    cookie_carrier = Response()
    try:
        decision = await gate_trial_run(recipe.manifest.env, parsed.config, request, cookie_carrier)
    except Exception:
        # A denial (HTTPException) or a real misconfiguration
        # (TrialLimitsMisconfigured) both happen *after*
        # parse_run_request has already staged any uploaded files into
        # parsed.tempdir — only run_event_stream's own `finally` cleans
        # that up, and it never runs if the gate raises here. Clean up
        # ourselves before propagating, so a denied trial-gated request
        # with file uploads can't leak its staged tempdir forever.
        shutil.rmtree(parsed.tempdir, ignore_errors=True)
        raise

    parsed = dataclasses.replace(parsed, config=decision.config)

    response = EventSourceResponse(run_event_stream(recipe, loaded, parsed))
    for set_cookie_value in cookie_carrier.headers.getlist("set-cookie"):
        response.raw_headers.append((b"set-cookie", set_cookie_value.encode("latin-1")))
    return response
