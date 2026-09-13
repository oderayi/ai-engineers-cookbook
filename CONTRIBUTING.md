# Contributing

## Adding a recipe

Scaffold it — never hand-write the directory structure:

```
make new-recipe RECIPE=<group>/<slug>
```

This creates `backend/recipes/<group>/<slug>/` with a `recipe.toml`
manifest, a starting `recipe.py`, and a `fixtures/` directory. Fill in the
manifest (title, summary, difficulty, parameters, declared env vars) and
`recipe.py`'s `run()` function — see
[`docs/SPEC-recipe-framework.md`](docs/SPEC-recipe-framework.md) for the
full contract, in particular the **1-to-1 source guarantee**: the exact file
your recipe ships is the exact file that runs — no build step, no
transpilation, no hidden wrapper — so what a learner reads in the UI is
never a lie.

Before opening a PR, your recipe (and the rest of the repo) must pass:

```
make validate         # uv run skillet recipes validate — every recipe's manifest,
                       # example params, and fixture references, checked
                       # dynamically for every recipe under backend/recipes/,
                       # yours included, with no extra wiring on your part
make test              # the full backend + frontend suite
make lint               # ruff + eslint
make check-redaction    # fails if a secret ever leaks into real captured log output
```

These are the same commands CI runs on every PR
(`.github/workflows/ci.yml`) — green locally means green in CI.

## Everything else

Bug fixes, docs, and other changes: open a PR against `main`. Keep the
change focused — one logical change per PR, matching the module-by-module,
one-task-per-commit history this repo was built with (`git log` is a good
reference for the expected granularity). Run `make test && make lint`
before pushing.

## Project structure

See the root [`README.md`](README.md#architecture) for the module map, and
[`docs/CAPABILITY-MAP.md`](docs/CAPABILITY-MAP.md) for what each module owns
and depends on. Each module has its own spec at `docs/SPEC-<module>.md`.

## License

By contributing, you agree your contribution is licensed under this
repo's [MIT license](LICENSE).
