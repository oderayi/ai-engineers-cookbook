# Recipes live here

This directory is the real, production recipe root (`DEFAULT_RECIPES_ROOT`
in `src/skillet/api/app.py` and `src/skillet/cli.py`) — what `make dev`,
`make docker`, and `make validate` all discover recipes from. It starts
empty in this checkout; the fixture recipes used by the test suite and the
E2E dev server live under `backend/tests/fixtures/recipes/` instead (see
`scripts/e2e_recipes_server.py`'s own doc comment for why those stay
separate from this directory).

Add a recipe with the scaffold command, never by hand:

```
make new-recipe RECIPE=<group>/<slug>
```

See `CONTRIBUTING.md` at the repo root for what a recipe's PR needs to pass
before it's mergeable, and `docs/SPEC-recipe-framework.md` for the full
recipe contract (metadata, parameters, env vars, the 1-to-1 source
guarantee).
