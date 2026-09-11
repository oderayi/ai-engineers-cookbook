# Spec: distribution

Module id: `distribution` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-11**.
Depends on: `recipe-framework`, `execution`.

## Objective

Make the repo trivially runnable — one command locally (two first-class paths:
native `uv` + `bun`, and Docker), and the manifests that put the hosted demo on
Render + Vercel — plus the MIT repo scaffolding that makes cloning and
contributing straightforward.

- **What:** a root `Makefile` front door (`make dev`, `make docker`, `make
  test`, `make new-recipe`); a `docker-compose.yml` running both services; a
  root README with a quickstart; consolidated env-var documentation; `LICENSE`
  (MIT); a GitHub Actions CI workflow running every module's test suite;
  `render.yaml` + Vercel project settings for the hosted deployment.
- **Why:** reach depends on the local-clone path being genuinely one command —
  and on the hosted demo actually being deployable the way the intent describes.
  This module is where "clone and run" and "click deploy" become true.
- **User:** the learner cloning the repo; the author deploying and maintaining
  the hosted instance; a future contributor adding a recipe.
- **Success:** a clean checkout runs with exactly one command via either path;
  `docker compose up` and `make dev` produce the same working app; CI is green
  on the same commands a contributor runs locally; the hosted manifests deploy
  without manual dashboard clicking beyond secrets.

## Scope

**In:** `Makefile`; `docker-compose.yml` + `backend/Dockerfile` +
`frontend/Dockerfile`; root `README.md` (quickstart, architecture overview,
"add a recipe" pointer); `backend/.env.example` + `frontend/.env.local.example`
consolidating every module's env vars with one-line descriptions; `LICENSE`
(MIT); `.github/workflows/ci.yml`; `render.yaml`; Vercel project config
(`frontend/vercel.json` if needed — Next.js auto-detects, so likely just
documented settings, not a file); the local/self-hosted trial-limits carve-out
(below); top-level repo layout (`CONTRIBUTING.md` pointer to
`recipe-framework`'s scaffold command).

**Out:** the app code and tests themselves (every other module); what the CI
workflow *checks* beyond "run each module's existing commands" (each module
defines its own test/lint/typecheck commands; this module only wires them into
one workflow); any paid infrastructure or account setup beyond what's needed to
click-deploy the free tiers already decided in the intent.

## Confirmed decisions

1. **Two first-class local paths, one front door.** A root `Makefile` is the
   single thing a learner is told to type:
   - `make dev` — native: `uv sync` + `bun install` if needed, then both dev
     servers concurrently in one terminal (prefixed, interleaved logs), Ctrl-C
     stops both.
   - `make docker` — `docker compose up --build`: no local Python/Node needed
     at all beyond Docker itself.
   - Both produce the same app at the same local URLs.
2. **`make` as the front door, not a custom shell script**, because it's a
   near-universal convention and gives one memorized verb (`make dev`) regardless
   of path. Documented caveat: Windows needs WSL or Git Bash (the target
   audience — Python-literate beginners — already needs a real terminal per the
   intent's audience assumption).
3. **Local/self-hosted deployments run BYOK-only — `trial-limits` never
   activates without its own config.** `gate_trial_run` treats itself as
   disabled (pure pass-through to the BYOK path) whenever
   `SKILLET_TRIAL_OPENAI_API_KEY` (or any configured provider's trial-key env
   var) is unset — which is the default in `.env.example` and in
   `docker-compose.yml`. A missing *required* key with no trial key configured
   is then an ordinary `422` ("this recipe needs `OPENAI_API_KEY`"), not a
   `429` — there is no free trial to gate when nobody funded one. This is the
   mechanism that makes "clone locally to run everything without limits" true
   without a second code path in `trial-limits`. *(Small amendment to
   `trial-limits`, flagged below — additive, doesn't change its approved
   success criteria.)*
4. **Docker images:** `backend/Dockerfile` — `uv`-based multi-stage build,
   final stage copies the synced venv + `recipes/`, no dev dependencies.
   `frontend/Dockerfile` — `bun`-based, Next.js `output: "standalone"`,
   multi-stage (deps → build → run). Both are what Render/a self-hoster would
   also use in production, not dev-only images — one Dockerfile per service
   serves local Docker Compose and hosted deployment alike.
5. **Env vars are documented in exactly two example files**, one per service,
   because FastAPI and Next.js have different conventions (`backend/.env`
   loaded by `uv run`/Docker; `frontend/.env.local` loaded by Next.js). The root
   README has one consolidated table (var, service, required?, description,
   which module defined it) linking to both files — no third source of truth.
6. **`render.yaml`** defines the backend as a Render free-tier web service
   (build: the backend Dockerfile or `uv sync`; start: `uvicorn` entrypoint;
   env vars referenced, not valued, per Render's secret-group convention).
   Vercel needs no committed config beyond the standard Next.js auto-detection
   (root directory = `frontend/`); documented as dashboard settings in the
   README's deploy section, not a checked-in file, since a `vercel.json` would
   only duplicate what auto-detection already gets right.
7. **CI runs the same commands a contributor runs locally** — no CI-only
   scripts. One workflow, two jobs (`backend`, `frontend`), each just invoking
   that module's own `uv run` / `bun run` commands as already defined in their
   specs, plus the cross-cutting `skillet recipes validate` and the 1-to-1
   source-hash test from `recipe-framework`.
8. **MIT license.** `LICENSE` at the repo root; `package.json` /
   `pyproject.toml` both declare `"license": "MIT"`.
9. **Adding a recipe needs no distribution changes.** `recipe-framework`'s
   `skillet recipes new <group>/<slug>` scaffold is the documented path;
   `CONTRIBUTING.md` points to it and to the parametrized contract test as the
   thing a contributor's PR must pass — it doesn't duplicate that module's docs.

## Cross-module note (`trial-limits` amendment — additive, needs sign-off)

`gate_trial_run` gains a startup check: if no provider has a configured
`SKILLET_TRIAL_*_API_KEY`, the dependency short-circuits to "BYOK required, no
gating" for every request — never calling Redis, never issuing the anonymous
cookie. A request missing a required key then fails with `execution`'s ordinary
`422` validation error, not a `429`. This doesn't change any of `trial-limits`'
existing Confirmed Decisions, Boundaries, or Success Criteria for the *hosted*
case (where a trial key is configured) — it only defines the no-trial-key
case, which was previously unspecified.

## Tech Stack

- `make` (build orchestration front door)
- Docker + Docker Compose
- GitHub Actions
- `uv` (backend, already decided), `bun` (frontend, already decided)
- No new application-level dependency

## Commands

```
Local (native):    make dev
Local (docker):    make docker
Run all tests:     make test          # -> uv run pytest && bun run test
Validate recipes:  make validate      # -> uv run skillet recipes validate
Scaffold a recipe: make new-recipe    # -> uv run skillet recipes new <group>/<slug>
Lint everything:   make lint          # -> ruff + eslint
```

## Project Structure

```
/
  Makefile
  docker-compose.yml
  LICENSE
  README.md
  CONTRIBUTING.md
  render.yaml
  .github/
    workflows/
      ci.yml
  backend/
    Dockerfile
    .env.example
    pyproject.toml
    src/skillet/...             # recipe-framework, execution, trial-limits, settings-consuming API
    recipes/...
  frontend/
    Dockerfile
    .env.local.example
    package.json
    app/ components/ lib/ hooks/...   # app-shell, catalog, settings, execution, workspace
  docs/
    intent/v1.md
    CAPABILITY-MAP.md
    SPEC-*.md
```

## Code Style

`Makefile` (illustrative, not exhaustive):

```makefile
.PHONY: dev docker test validate new-recipe lint

dev:
	@cd backend && uv sync --quiet
	@cd frontend && bun install --silent
	@$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	@cd backend && uv run fastapi dev src/skillet/api/app.py

dev-frontend:
	@cd frontend && bun dev

docker:
	docker compose up --build

test:
	@cd backend && uv run pytest
	@cd frontend && bun run test

validate:
	@cd backend && uv run skillet recipes validate

new-recipe:
	@cd backend && uv run skillet recipes new $(RECIPE)

lint:
	@cd backend && uv run ruff check
	@cd frontend && bun run lint
```

`docker-compose.yml`:

```yaml
services:
  backend:
    build: ./backend
    env_file: backend/.env
    ports: ["8000:8000"]
  frontend:
    build: ./frontend
    env_file: frontend/.env.local
    environment:
      NEXT_PUBLIC_BACKEND_URL: http://backend:8000
    ports: ["3000:3000"]
    depends_on: [backend]
```

The no-trial-key short-circuit itself is specified in `trial-limits`'
Confirmed Decision 11 and its `gate.py` / `author_key.py` code samples
(`any_trial_key_configured()`) — this module only supplies the *default absence*
of `SKILLET_TRIAL_*` in `backend/.env.example` and Compose that makes it apply
locally.

## Testing Strategy

- **`make dev` and `make docker` both boot the same app**: a smoke test (shell
  script, run in CI) starts each path, polls the backend's `/recipes` and the
  frontend's `/`, asserts `200` from both, then tears down.
- **CI parity:** the CI workflow's steps are literally `make test`, `make lint`,
  `make validate` — a contributor can reproduce a CI failure locally by running
  the same three commands, verified by a doc-comment in `ci.yml` referencing
  the Makefile targets it calls (no drift between "what CI runs" and "what's
  documented").
- **BYOK-only local mode:** with `backend/.env` containing no
  `SKILLET_TRIAL_*` var, a request missing a required key gets `422`, never
  `429`; with one present, the existing `trial-limits` test suite's behavior is
  unchanged (regression-tested there, not duplicated here).
- **Env var documentation completeness:** a small script/test asserts every env
  var referenced in `recipe-framework`, `execution`, `trial-limits`, and
  `settings`' specs appears in `backend/.env.example` or
  `frontend/.env.local.example` with a non-empty description — catches drift
  when a future module spec adds a var and forgets to document it.
- **License/metadata:** `LICENSE` exists and is the MIT text; both manifests
  declare `MIT`.

## Boundaries

**Always**
- Keep `make dev` and `make docker` producing an equivalent running app.
- Keep CI invoking the same commands documented for local use — no hidden
  CI-only steps.
- Document every new env var in the relevant `.env.example` the same PR that
  introduces it (enforced by the completeness check above).
- Ship both Dockerfiles as the same images used in hosted deployment, not
  dev-only stand-ins.

**Ask first**
- Adding a third local-run path (e.g. a Nix flake, a devcontainer) — evaluate
  against "does this replace or sit alongside `make dev`/`make docker`."
  before undertaking it.
- Changing which env vars are required vs. optional for a working local start.
- Changing the CI provider or workflow structure.

**Never**
- Introduce a local-only code path in `recipe-framework` or `execution` that
  hosted doesn't also exercise (the BYOK-only carve-out in `trial-limits` is the
  one deliberate, documented exception, and it activates by *absence* of config,
  not by an environment flag that could drift).
- Commit real secrets in any `.env.example`, `render.yaml`, or Compose file —
  placeholders only.
- Let `docker-compose.yml` or the Dockerfiles diverge from what's actually
  deployed to Render (they must be the same images).

## Success Criteria

1. On a clean checkout with only `make`, `docker`, and internet access:
   `make docker` results in a working app at the documented local URLs with zero
   other setup.
2. On a clean checkout with `uv`, `bun`, and Python/Node available: `make dev`
   does the same, installing dependencies itself.
3. `make test`, `make lint`, and `make validate` each pass locally and are the
   exact commands CI runs (verified by the CI-parity check).
4. With no `SKILLET_TRIAL_*` env var set, every run request either succeeds
   (learner supplied their own key) or fails with `422` — never `429`.
5. Every env var declared across `recipe-framework`, `execution`,
   `trial-limits`, and `settings` appears, documented, in one of the two
   `.env.example` files.
6. `render.yaml` deploys the backend on a fresh Render account with only
   secret values needing to be filled in; the frontend deploys to Vercel via
   standard Next.js auto-detection with `frontend/` as the root directory.
7. `LICENSE` is present and both package manifests declare MIT.

## Open Questions

1. ~~`LICENSE` copyright name.~~ **Resolved: Steven Oderayi.**
2. ~~CI matrix scope.~~ **Resolved: single OS/version** (Ubuntu latest, the
   Python/Node versions already pinned elsewhere) — no multi-OS or
   multi-version matrix in v1.
3. ~~Render `render.yaml` vs. dashboard-only setup.~~ **Resolved: commit
   `render.yaml`** — reproducible, and a self-hoster's fork deploys the same way.
4. ~~Keep-warm ping for Render's cold start.~~ **Resolved: loading-state only**,
   no keep-warm cron — `app-shell`'s "waking up" state is sufficient for v1.
