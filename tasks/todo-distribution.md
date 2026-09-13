# Tasks: `distribution`

Plan: [plan-distribution.md](plan-distribution.md). Spec:
[docs/SPEC-distribution.md](../docs/SPEC-distribution.md).

## Phase 1: Foundation

### Task 1: `Makefile` + `LICENSE` + license fields

**Description:** The single front door (`make dev`, `make docker`, `make
test`, `make validate`, `make new-recipe`, `make lint`), the MIT license
text, and both manifests declaring it.

**Acceptance criteria:**
- [x] `Makefile` at repo root with targets: `dev`, `dev-backend`,
      `dev-frontend`, `docker`, `test`, `validate`, `new-recipe`, `lint`
      (per spec's Code Style sample, adapted to real paths/commands)
- [x] `LICENSE` at repo root: MIT text, copyright "Steven Oderayi"
- [x] `backend/pyproject.toml` already declares `license = { text = "MIT" }` — confirmed, no change needed
- [x] `frontend/package.json` declares `"license": "MIT"`

**Verification:**
- [x] `make dev` boots both dev servers (real boot test: backend :8000 and frontend :3000 both 200, then torn down)
- [x] `make test` runs `uv run pytest && bun run test` and both pass (265 + 655)
- [x] `make lint` runs `uv run ruff check && bun run lint` and both pass
- [x] `make validate` runs `uv run skillet recipes validate` and passes

**Real gaps found and fixed (not originally scoped, but required for `make dev`/`make validate` to work at all):**
- No permanent ASGI server dependency existed (`uvicorn` was dev-group-only, and `scripts/e2e_recipes_server.py`'s own doc comment explicitly flagged this as "distribution's job"). Promoted `uvicorn[standard]` to a real `[project.dependencies]` entry and added the real production entrypoint (`uvicorn skillet.api.app:app`, already had a module-level `app = create_app()` to target).
- `backend/recipes/` (`DEFAULT_RECIPES_ROOT`) didn't exist in a clean checkout — added it (with a short README) as a tracked, empty directory.
- `frontend/.gitignore`'s Next.js-default `.env*` pattern had no exception for `.env.local.example` (unlike the root `.gitignore`'s `!*.env.example`) — would have silently prevented the new file from ever being committed. Fixed.
- Chose "commented out by default" over `VAR=` (empty) in both `.env.example` files after verifying empirically that an empty-but-present value is NOT treated the same as absent by every `os.environ.get(KEY, default)` call site (e.g. would have silently zeroed out CORS origins).

**Dependencies:** None

**Files likely touched:**
- `Makefile` (new)
- `LICENSE` (new)
- `frontend/package.json` (add `license` field if missing)
- `backend/pyproject.toml`, `backend/uv.lock` (uvicorn[standard] promotion)
- `backend/scripts/e2e_recipes_server.py`, `frontend/playwright.config.ts` (simplified now-redundant `--with` invocation)
- `backend/recipes/README.md` (new)
- `frontend/.gitignore`

**Estimated scope:** Small: 1-3 files (grew to ~8 once the real gaps above surfaced — documented here rather than silently expanding scope)

---

### Task 2: Consolidated env-var documentation

**Description:** `backend/.env.example` and `frontend/.env.local.example`,
covering every real env var found in the codebase (see plan's inventory
table), each with a one-line description and a safe placeholder/default.

**Acceptance criteria:**
- [x] `backend/.env.example` lists all 7 backend vars from the inventory, each with a comment describing it, whether it's required, and its default (if any)
- [x] `frontend/.env.local.example` lists `NEXT_PUBLIC_BACKEND_URL`
- [x] No real secrets — placeholders only (e.g. `sk-...`), and commented out by default
- [x] `.gitignore` at root already excluded real `.env`/`.env.local` while allowing `*.env.example`; `frontend/.gitignore` needed its own matching fix (see Task 1's notes above)

**Verification:**
- [x] Real `make dev` boot (which auto-copies both `.env.example` files) confirmed BYOK-only mode: catalog loads empty with zero recipes, CORS default correctly applied — no `SKILLET_TRIAL_*` uncommented anywhere

**Dependencies:** None

**Files likely touched:**
- `backend/.env.example` (new)
- `frontend/.env.local.example` (new)

**Estimated scope:** Small: 2 files

---

## Checkpoint: Foundation (after Tasks 1-2)
- [x] `make dev` boots both services against the real `.env.example`-documented vars
- [x] `make test`, `make lint`, `make validate` all pass

---

## Phase 2: Docker

### Task 3: Dockerfiles + Compose

**Description:** `backend/Dockerfile` (uv-based multi-stage),
`frontend/Dockerfile` (bun-based multi-stage, Next.js `output: "standalone"`),
`docker-compose.yml` wiring both, `make docker` target.

**Acceptance criteria:**
- [x] `backend/Dockerfile`: multi-stage, final stage has synced venv + `recipes/`, no dev dependencies
- [x] `frontend/Dockerfile`: multi-stage (deps → build → run), requires `next.config.ts`'s `output: "standalone"` (added)
- [x] `docker-compose.yml` at repo root per spec's Code Style sample (backend on 8000, frontend on 3000, `NEXT_PUBLIC_BACKEND_URL` pointing at the `backend` service name)
- [x] `make docker` target added (already stubbed in Task 1's Makefile — confirmed wired to `docker compose up --build`)

**Verification — Docker daemon WAS available in this environment (started it; not assumed):**
- [x] `docker build ./backend` succeeds
- [x] `docker build ./frontend` succeeds
- [x] `docker compose up --build` produces `200` from both `http://localhost:8000/recipes` and `http://localhost:3000/`, with the frontend container genuinely reaching the backend container over the Compose network (confirmed: no `RecipeApiError`/connection-refused in frontend logs, unlike an isolated single-container probe run)

**Real bugs found and fixed (each confirmed empirically, not guessed):**
- `uv sync` installs the project **editable** by default (`.pth` pointing at `/app/src`) — the final Docker stage only copies `.venv/`, so the app would have failed to import at runtime. Fixed with `--no-editable` (confirmed: `site-packages/skillet` became a real copy, not a `.pth` file).
- `httpx` — a genuine runtime dependency of `trial_limits/redis_client.py` (a real `httpx.AsyncClient` for Upstash's REST API) — was declared only in the dev dependency group, invisible until this module's `--no-dev` build: `ModuleNotFoundError: No module named 'httpx'`. Promoted to `[project.dependencies]`.
- `DEFAULT_RECIPES_ROOT`'s `Path(__file__).resolve().parents[3]` arithmetic assumes an editable/source-tree install (`backend/src/skillet/api/app.py`); once truly installed (`site-packages/skillet/api/app.py`), the same arithmetic resolves to a nonexistent path inside the venv. This isn't Docker-specific — it would bite ANY real non-editable install. Added `SKILLET_RECIPES_ROOT` as an explicit override (set by the Dockerfile), leaving local dev's editable-context default untouched and verified-correct.
- `docker-compose.yml`'s plain `env_file: backend/.env` hard-errors (`docker compose config`) when the file doesn't exist — verified before shipping it, since a clean checkout has neither `.env` file yet. Fixed with the `path:`/`required: false` extended form.
- Disclosed, not fixed (Next.js's own advisory, not a failure): adding `output: "standalone"` makes Next.js warn that `next start` (still used by `frontend/package.json`'s `start` script and Playwright's E2E `webServer`) isn't officially supported with that output mode — it still fully works today (confirmed: E2E suite re-run green after the config change), so left as-is rather than restructuring already-signed-off `execution`/`app-shell` E2E infrastructure for a currently-cosmetic warning. The Docker image itself correctly uses the officially recommended `node`/`bun run server.js` invocation instead.

**Dependencies:** Task 1 (Makefile), Task 2 (env var names referenced in compose)

**Files likely touched:**
- `backend/Dockerfile` (new)
- `frontend/Dockerfile` (new)
- `docker-compose.yml` (new)
- `frontend/next.config.ts` (added `output: "standalone"`)
- `backend/pyproject.toml`, `backend/uv.lock` (httpx promoted to a real dependency)
- `backend/src/skillet/api/app.py` (`SKILLET_RECIPES_ROOT` override)

**Estimated scope:** Medium: 4 files (grew to ~7 once the real bugs above surfaced)

---

## Checkpoint: Docker parity (after Task 3)
- [x] `docker compose up --build` succeeds, verified end-to-end (not just "images build")

---

## Phase 3: CI + hosted deploy

### Task 4: CI workflow

**Description:** `.github/workflows/ci.yml`, two jobs (`backend`,
`frontend`), each invoking the exact `make` commands a contributor runs
locally.

**Acceptance criteria:**
- [x] Single workflow, triggers on push/PR
- [x] `backend` job: `astral-sh/setup-uv`, then `make test-backend`/`make lint-backend`/`make validate` (split out as new Makefile targets — see below)
- [x] `frontend` job: `bun install --frozen-lockfile`, then `make test-frontend`/`make lint-frontend`/`bun run typecheck`
- [x] A doc-comment in `ci.yml` explicitly references the Makefile targets it calls, so "what CI runs" and "what's documented" can't drift silently
- [x] Ubuntu latest, single Node/Python version (resolved from each lockfile, nothing extra to pin) — no matrix

**Design decision:** the approved spec's own `make test`/`make lint` compose BOTH services' halves in one target — unusable in a split-by-toolchain CI job (the backend job has no `bun`, and vice versa). Split each into `test-backend`/`test-frontend` and `lint-backend`/`lint-frontend`, with the original combined name now composing both — a contributor still gets exactly the commands the spec documents, and CI gets the granularity it needs, per Confirmed Decision 7 (same commands, not a CI-only script).

**Disclosed addition beyond the approved spec:** `bun run typecheck` — the spec's own Commands table has no typecheck target at all, but every prior module's own Definition of Done treated it as a required gate; omitting it from CI would be a real, silent regression from that bar for the one workflow meant to protect all future contributions.

**Real gap found and fixed while researching this task:** all three third-party Action versions I initially reached for from training-data memory (`actions/checkout@v4`, `astral-sh/setup-uv@v3`) were stale — `astral-sh/setup-uv` is at v10, `actions/checkout` at v7 (`oven-sh/setup-bun@v2` was already current). Verified each via a live fetch of the action's own README rather than trusting memory, per this session's established practice for anything with a real, checkable current state.

**Verification:**
- [x] YAML syntax validated (`python3 -c "import yaml; yaml.safe_load(...)"`, since no real GitHub Actions runner is available in this environment — disclosed)
- [x] Every command the workflow invokes run locally in sequence, exactly as the job specifies: backend (`make test-backend && make lint-backend && make validate`) and frontend (`bun install --frozen-lockfile`, `make test-frontend && make lint-frontend`, `bun run typecheck`) — all pass

**Dependencies:** Task 1 (Makefile targets), Task 3 (Docker not required for CI itself, but env vars from Task 2 are)

**Files likely touched:**
- `.github/workflows/ci.yml` (new)
- `Makefile` (split `test`/`lint` into per-service targets)

**Estimated scope:** Small: 1 file (grew to 2 for the Makefile split)

---

### Task 5: `render.yaml` + deploy docs

**Description:** Render manifest for the backend; documented (not
committed) Vercel settings for the frontend.

**Acceptance criteria:**
- [x] `render.yaml`: backend as a free-tier web service, build via the backend Dockerfile (decided over `uv sync`-based native build — the Dockerfile already exists, is already verified working, and keeps local/hosted using the literal same image, per Confirmed Decision 4), every env var from the inventory referenced (`sync: false`, not valued) rather than hardcoded
- [ ] Deploy section of the README (Task 6) documents Vercel dashboard settings — deferred to Task 6, not done here

**Real gap found and fixed while writing this task (would have broken a real Render deploy silently):** `backend/Dockerfile`'s `CMD` hardcoded `--port 8000`. Render assigns its own dynamic `$PORT` (commonly 10000, not 8000) and expects the container to bind to it — confirmed via Render's own docs, which explicitly call relying on their port auto-detection instead "fragile." Fixed by switching the Dockerfile's `CMD` to shell form so `${PORT:-8000}` actually expands, verified against BOTH a no-`PORT`-set container (defaults to 8000, keeping local Compose unchanged) and a `PORT=10000`-set container (Render's likely real value) — both returned `200`.

**Verification — every claim checked against Render's own current docs (fetched live), not memory:**
- [x] `render.yaml`'s shape (`type`, `runtime: docker`, `dockerfilePath`/`dockerContext` semantics, `sync: false` behavior) cross-checked against Render's Blueprint spec docs directly
- [x] `dockerfilePath`/`dockerContext` confirmed relative to the repo root (not to each other) — verified via a direct doc fetch rather than assumed
- [x] Every env var referenced in `render.yaml` exists in `backend/.env.example` (scripted cross-check, all 7 found)
- [x] An actual Render account/deploy isn't available in this environment — disclosed; everything above is the closest available proxy

**Dependencies:** Task 2 (env var inventory), Task 3 (Dockerfile, referenced as the build method)

**Files likely touched:**
- `render.yaml` (new)
- `backend/Dockerfile` (PORT fix)

**Estimated scope:** Small: 1 file (grew to 2 for the PORT fix)

---

## Checkpoint: CI green (after Tasks 4-5)
- [x] CI workflow YAML valid; every step's command verified locally
- [x] `render.yaml` shape-validated; env vars cross-checked

---

## Phase 4: Docs + repo scaffolding

### Task 6: Root `README.md`

**Description:** Quickstart (both paths), architecture overview,
consolidated env-var table, "add a recipe" pointer, deploy section.

**Acceptance criteria:**
- [x] Quickstart shows both `make dev` and `make docker`
- [x] One consolidated env-var table (var, service, required?, default, which module defined it) — the single source of truth the spec requires, linking to both `.env.example` files rather than duplicating their comments verbatim
- [x] Architecture overview: one paragraph + the 8-module capability map, linking to `docs/CAPABILITY-MAP.md`
- [x] "Add a recipe" section points to `skillet recipes new` / `make new-recipe`, not duplicating `recipe-framework`'s own docs
- [x] Deploy section: Render (via `render.yaml`) + Vercel (dashboard settings, no file)

**Verification:**
- [x] Every Makefile target and env var named in the README actually exists (scripted cross-check: every linked file — `docs/CAPABILITY-MAP.md`, `docs/SPEC-recipe-framework.md`, both `.env.example` files, `render.yaml`, `LICENSE`, `CONTRIBUTING.md` — confirmed present)

**Dependencies:** Tasks 1, 2, 5

**Files likely touched:**
- `README.md` (new, repo root)

**Estimated scope:** Small: 1 file

---

### Task 7: `CONTRIBUTING.md`

**Description:** Points a contributor at `recipe-framework`'s scaffold
command and the parametrized contract test their PR must pass — no
duplication of that module's own docs.

**Acceptance criteria:**
- [x] References `make new-recipe RECIPE=<group>/<slug>`
- [x] References the contract check a new recipe must pass — `make validate` (`uv run skillet recipes validate`), NOT `tests/recipe/test_source_mapping.py` (checked both: that test is parametrized over a hardcoded `["echo", "echo-with-helper"]` list, `recipe-framework`'s own internal regression test against its original fixtures — a new contributor's recipe would silently NOT be covered by it unless they also edited that test file. `skillet recipes validate` is the one that dynamically discovers and checks every recipe under `backend/recipes/`, including a brand-new one, with zero extra wiring)
- [x] References `make test`/`make lint`/`make validate`/`make check-redaction` as the PR-readiness bar

**Verification:**
- [x] Every command/test named is real (manual cross-check; the test-file mixup above was caught by actually reading both candidates' source before naming one)

**Dependencies:** Task 1, `recipe-framework` (already done)

**Files likely touched:**
- `CONTRIBUTING.md` (new)

**Estimated scope:** Small: 1 file

---

### Task 8: Env-var documentation completeness check

**Description:** A script asserting every env var referenced in
`recipe-framework`, `execution`, `trial-limits`, and `settings`'s specs
appears, with a non-empty description, in one of the two `.env.example`
files — wired into CI (Task 4).

**Acceptance criteria:**
- [x] `backend/scripts/check_env_docs.py` (matching the existing
      `check_trial_key_redaction.py` CI-script precedent): scans the 4 named
      specs for backtick-quoted identifiers matching `SKILLET_*`,
      `UPSTASH_*`, `NEXT_PUBLIC_*`, and asserts each appears with a
      non-empty preceding description comment in `backend/.env.example` or
      `frontend/.env.local.example`. `OPENAI_API_KEY`-shaped identifiers are
      deliberately excluded (see the script's own doc comment): they're
      per-recipe, dynamically declared vars with no fixed enumerable set,
      not a global var missing from the example files — flagging one would
      be a false positive against a real, intentional design choice, not
      real drift. (Checked the real specs first: as of writing only 3
      backtick-quoted vars actually appear across all 4 specs —
      `SKILLET_CORS_ORIGINS`, `SKILLET_TRIAL_DAILY_CAP`,
      `SKILLET_TRIAL_OPENAI_API_KEY` — the full 8-var inventory came from
      grepping real source, not from this narrower spec-text scan.)
- [x] Script exits non-zero (with a clear message naming the missing var) on drift; verified via a deliberate negative-control run (temporarily removing `SKILLET_CORS_ORIGINS`'s documentation, confirming exit 1 naming exactly that var, then restoring the file and diffing it byte-identical to the committed version)
- [x] Wired into `ci.yml`'s backend job as `make check-env-docs`

**Real, disclosed forward-reference picked up along the way (not originally in this task's scope, found while reading `check_trial_key_redaction.py`'s own doc comment for the Task 8 precedent):** both `execution`'s `check_log_redaction.py` and `trial-limits`' `check_trial_key_redaction.py` explicitly state in their own doc comments that "wiring this into a real CI pipeline is distribution's job" — neither had ever been wired into anything before this. Added a `make check-redaction` target (runs both) and wired it into `ci.yml`'s backend job too, alongside `check-env-docs`.

**Verification:**
- [x] `make check-env-docs` (`uv run python backend/scripts/check_env_docs.py`) passes against the real specs/example files
- [x] Negative control: script fails (exit 1, names the exact missing var) when a real var's documentation is removed from an example file
- [x] `make check-redaction` (the newly-wired-in forward-reference above) passes against the real repo too

**Dependencies:** Task 2 (env files must exist), Task 4 (CI wiring)

**Files likely touched:**
- `backend/scripts/check_env_docs.py` (new)
- `.github/workflows/ci.yml` (add the steps)
- `Makefile` (add `check-env-docs`/`check-redaction` targets)

**Estimated scope:** Small: 2 files (grew to 3 for the redaction-script forward-reference)

---

## Checkpoint: Docs complete (after Tasks 6-8)
- [x] Completeness script passes against real specs/example files (plus a proven negative control)
- [x] README/CONTRIBUTING cross-checked against real Makefile targets and env vars

---

## Real CI feedback, post-push (superseding the "no GitHub Actions runner available" disclosure above)

This repo has a real GitHub remote (`origin`) the user pushes to independently — CI genuinely ran on GitHub after the Task 4/5 push and reported two real failures back, both fixed here and re-verified locally before pushing again:

1. **`astral-sh/setup-uv@v10` doesn't resolve.** My own live doc-fetch verification (Task 4) checked the README's example and a tags listing, but the tags listing showed no bare-major floating tag at all for this action — only exact versions (`v10.1.0`, `v10.0.1`, ...). Fixed by pinning the exact tag `astral-sh/setup-uv@v10.1.0`, confirmed present in the real tag list this time (not just a README example).
2. **Frontend `bun run typecheck` failed in CI**: `Cannot find name 'LayoutProps'`/`'PageProps'`. These are Next.js's own auto-generated ambient types (`.next/types/`), created by `next build`/`next dev`/`next typegen` — my own local verification of this exact command had ALWAYS run inside a working directory that already had a `.next/` from earlier `bun run build` calls during Docker testing, so it passed locally by accident and never actually exercised what a truly clean checkout hits. Reproduced locally by deleting `.next/` and re-running `bun run typecheck` — same two errors. This isn't CI-specific: any contributor's first `bun run typecheck` on a fresh clone would hit it too. Fixed at the source — `frontend/package.json`'s own `typecheck` script now runs `next typegen &&` first — rather than papering over it with an extra CI-only step, so the fix benefits every caller, not just CI.

Both fixes re-verified against a genuinely clean local state (`.next/` and `node_modules` cache removed, `bun install --frozen-lockfile`, then the exact CI sequence) before committing, plus the full `make test`/`lint`/`validate`/`check-redaction`/`check-env-docs` suite (267 backend + 655 frontend tests, up from 265 — see the third finding below).

3. **A real, previously-undetected gap in `trial_limits`' own gate, found while trying to write a genuine live proof of Success Criterion 4** ("every run request either succeeds or fails with 422 — never 429" with no trial key configured): a manual empirical test (real multipart form request, no `SKILLET_TRIAL_*` set, a recipe declaring a required key) returned `200` with the key silently `null` — not a 422, not any error at all. Tracing it down: `gate_trial_run`'s own inline comment claimed "execution's own Params validation raises the ordinary 422 downstream," but no such validation exists anywhere in `execution`'s actual request-parsing code (confirmed by reading it) — `ctx.config` is a plain dict, never re-checked against the manifest's `required` flags after `gate_trial_run` returns. `trial_limits`' own `test_gate.py` had a test (`test_no_trial_key_configured_is_a_noop_no_redis_no_cookie`) explicitly asserting this exact silent-pass-through as correct — this was a deliberate, signed-off (if unintentionally incomplete) design, not an oversight nobody noticed until distribution's own Success Criterion 4 was the first thing to ever exercise this scenario end-to-end.

   Fixed with a minimal, targeted addition to `gate_trial_run` itself (the one place that already computes `missing_required`): raises a real `HTTPException(422, ...)` when required keys are missing and no trial key is configured at all, distinct from the pure-BYOK-success pass-through. Updated the outdated test to assert the new (correct) behavior instead, renamed it, and added a dedicated real-HTTP-level test in `test_run_endpoint_wiring.py` (a genuine `client.post(...)` returning `422`, not just the isolated `gate_trial_run` unit test) — this is the closest a test gets to Success Criterion 4's own literal wording. Full `trial_limits` suite re-verified (99 tests) plus the full backend suite (267, up from 265).

---

## Phase 5: Sign-off

### Task 9: Success-criteria sign-off pass

**Description:** Map each of `SPEC-distribution.md`'s 7 numbered Success
Criteria to its verification, honestly disclosing any criterion this
sandboxed environment can't fully prove (no Docker daemon / GitHub Actions
runner / Render account available — see plan's Risks section).

**Acceptance criteria:**
- [ ] A sign-off table (appended to `tasks/plan-distribution.md`) lists all 7 criteria against their verification
- [ ] Every full-suite command that CAN run locally in this environment does, and passes

**Verification:**
- [ ] Full command suite: `make test && make lint && make validate`, plus whatever Docker/CI checks this environment supports

**Dependencies:** Tasks 1-8

**Files likely touched:**
- `tasks/plan-distribution.md` (sign-off table appended)

**Estimated scope:** Small: 1 file

---

## Checkpoint: Module complete (after Task 9)
- [ ] All 7 success criteria individually verified (or honestly disclosed as environment-limited)
- [ ] `distribution` complete — this is the 8th and final module in the capability map; Skillet v1's full build is done
