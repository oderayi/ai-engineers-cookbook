"""Ephemeral ASGI server for `catalog`'s frontend Playwright E2E suite ONLY —
NOT a production entry point. `distribution` promoted `uvicorn[standard]`
from an ad hoc `--with` dependency to a real one
(`backend/pyproject.toml`'s `[project.dependencies]`) and added the actual
production entrypoint (`make dev`'s `dev-backend` target: `uvicorn
skillet.api.app:app`) — this script stays a separate, E2E-only server
because it serves fixture content, not `backend/recipes/`.

Serves `backend/tests/fixtures/recipes` (the same fixtures `recipe-framework`
itself tests against) so `frontend/e2e/*.spec.ts` has real, deterministic
recipe content — and so the offline test can exercise Serwist's actual
cross-origin runtime-caching strategy against a real backend response,
rather than a Playwright-level route mock the service worker never really
sees.

Run via `uv run python scripts/e2e_recipes_server.py` from `backend/` — see
`frontend/playwright.config.ts`'s `webServer` array.
"""

from pathlib import Path

import uvicorn

from skillet.api.app import create_app

RECIPES_ROOT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "recipes"

app = create_app(recipes_root=RECIPES_ROOT)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
