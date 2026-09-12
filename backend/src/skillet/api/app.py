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
from skillet.execution.keys import install_redacting_filter
from skillet.trial_limits.redis_client import UpstashRedis

DEFAULT_RECIPES_ROOT = Path(__file__).resolve().parents[3] / "recipes"

# `catalog` is the first module to call this API from a browser origin
# (frontend on :3000, this API on :8000 in dev) — without CORS headers,
# every request fails silently at the browser, never reaching a handler.
# Comma-separated so a self-hosted deployment (SPEC-distribution.md) can
# widen it via one env var without a code change.
DEFAULT_CORS_ORIGINS = "http://localhost:3000"


def create_app(recipes_root: Path | None = None) -> FastAPI:
    # Idempotent (see its own docstring) — safe even though every test in
    # this backend's own suite calls create_app() repeatedly.
    install_redacting_filter()

    app = FastAPI(title="Skillet")
    app.state.recipes_root = recipes_root or DEFAULT_RECIPES_ROOT

    # `trial_limits`' own state: both left `None` when unconfigured (the
    # default for a local/self-hosted clone — see
    # `author_key.any_trial_key_configured()`'s no-op path). A deployment
    # that funds a trial key but leaves either of these unset fails loudly
    # inside `gate_trial_run` itself (`TrialLimitsMisconfigured`), not here —
    # this factory never guesses at which combination is "intentional".
    redis_url = os.environ.get("UPSTASH_REDIS_REST_URL")
    redis_token = os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    app.state.trial_redis = (
        UpstashRedis(redis_url, redis_token) if redis_url and redis_token else None
    )

    cookie_secret = os.environ.get("SKILLET_TRIAL_COOKIE_SECRET")
    app.state.cookie_secret = cookie_secret.encode() if cookie_secret else None

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
