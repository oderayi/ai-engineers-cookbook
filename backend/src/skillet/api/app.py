"""FastAPI app factory. `recipes_root` is injectable so tests point it at
fixtures without touching the default production layout
(`backend/recipes/`).
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from skillet.api.recipes import router as recipes_router
from skillet.api.run import router as run_router

DEFAULT_RECIPES_ROOT = Path(__file__).resolve().parents[3] / "recipes"

# `catalog` is the first module to call this API from a browser origin
# (frontend on :3000, this API on :8000 in dev) — without CORS headers,
# every request fails silently at the browser, never reaching a handler.
# Comma-separated so a self-hosted deployment (SPEC-distribution.md) can
# widen it via one env var without a code change.
DEFAULT_CORS_ORIGINS = "http://localhost:3000"


def create_app(recipes_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="Skillet")
    app.state.recipes_root = recipes_root or DEFAULT_RECIPES_ROOT

    origins_env = os.environ.get("SKILLET_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    origins = [o.strip() for o in origins_env.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        # `execution`'s POST /recipes/{slug}/run needs POST in addition to
        # the read-only GETs above.
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(recipes_router)
    app.include_router(run_router)
    return app


app = create_app()
