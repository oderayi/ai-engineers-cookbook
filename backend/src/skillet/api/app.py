"""FastAPI app factory. `recipes_root` is injectable so tests point it at
fixtures without touching the default production layout
(`backend/recipes/`).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from skillet.api.recipes import router as recipes_router

DEFAULT_RECIPES_ROOT = Path(__file__).resolve().parents[3] / "recipes"


def create_app(recipes_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="Skillet")
    app.state.recipes_root = recipes_root or DEFAULT_RECIPES_ROOT
    app.include_router(recipes_router)
    return app


app = create_app()
