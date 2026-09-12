"""Ephemeral ASGI server for `catalog`'s frontend Playwright E2E suite ONLY —
NOT a production entry point (that's `distribution`'s job; no ASGI server is
a permanent dependency of this backend yet, per its own Task 0 note).

Serves `backend/tests/fixtures/recipes` (the same fixtures `recipe-framework`
itself tests against) so `frontend/e2e/*.spec.ts` has real, deterministic
recipe content — and so the offline test can exercise Serwist's actual
cross-origin runtime-caching strategy against a real backend response,
rather than a Playwright-level route mock the service worker never really
sees.

Run via `uv run --with 'uvicorn[standard]' python scripts/e2e_recipes_server.py`
from `backend/` — see `frontend/playwright.config.ts`'s `webServer` array.
"""

from pathlib import Path

import uvicorn

from skillet.api.app import create_app

RECIPES_ROOT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "recipes"

app = create_app(recipes_root=RECIPES_ROOT)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
