# Tasks: `distribution`

Plan: [plan-distribution.md](plan-distribution.md). Spec:
[docs/SPEC-distribution.md](../docs/SPEC-distribution.md).

## Phase 1: Foundation

### Task 1: `Makefile` + `LICENSE` + license fields

**Description:** The single front door (`make dev`, `make docker`, `make
test`, `make validate`, `make new-recipe`, `make lint`), the MIT license
text, and both manifests declaring it.

**Acceptance criteria:**
- [ ] `Makefile` at repo root with targets: `dev`, `dev-backend`,
      `dev-frontend`, `docker`, `test`, `validate`, `new-recipe`, `lint`
      (per spec's Code Style sample, adapted to real paths/commands)
- [ ] `LICENSE` at repo root: MIT text, copyright "Steven Oderayi"
- [ ] `backend/pyproject.toml` already declares `license = { text = "MIT" }` — confirm (already true; no change needed if so)
- [ ] `frontend/package.json` declares `"license": "MIT"`

**Verification:**
- [ ] `make dev` boots both dev servers (manual Ctrl-C test)
- [ ] `make test` runs `uv run pytest && bun run test` and both pass
- [ ] `make lint` runs `uv run ruff check && bun run lint` and both pass
- [ ] `make validate` runs `uv run skillet recipes validate` and passes

**Dependencies:** None

**Files likely touched:**
- `Makefile` (new)
- `LICENSE` (new)
- `frontend/package.json` (add `license` field if missing)

**Estimated scope:** Small: 1-3 files

---

### Task 2: Consolidated env-var documentation

**Description:** `backend/.env.example` and `frontend/.env.local.example`,
covering every real env var found in the codebase (see plan's inventory
table), each with a one-line description and a safe placeholder/default.

**Acceptance criteria:**
- [ ] `backend/.env.example` lists all 7 backend vars from the inventory, each with a comment describing it, whether it's required, and its default (if any)
- [ ] `frontend/.env.local.example` lists `NEXT_PUBLIC_BACKEND_URL`
- [ ] No real secrets — placeholders only (e.g. `sk-...` or empty)
- [ ] `.gitignore` already excludes real `.env`/`.env.local` while allowing `*.env.example` (confirmed already true)

**Verification:**
- [ ] `cp backend/.env.example backend/.env` (no `SKILLET_TRIAL_*` filled in) then a manual run confirms BYOK-only mode (existing `trial-limits` test suite already covers the code path; this step just confirms the example file's defaults actually produce it)

**Dependencies:** None

**Files likely touched:**
- `backend/.env.example` (new)
- `frontend/.env.local.example` (new)

**Estimated scope:** Small: 2 files

---

## Checkpoint: Foundation (after Tasks 1-2)
- [ ] `make dev` boots both services against the real `.env.example`-documented vars
- [ ] `make test`, `make lint`, `make validate` all pass

---

## Phase 2: Docker

### Task 3: Dockerfiles + Compose

**Description:** `backend/Dockerfile` (uv-based multi-stage),
`frontend/Dockerfile` (bun-based multi-stage, Next.js `output: "standalone"`),
`docker-compose.yml` wiring both, `make docker` target.

**Acceptance criteria:**
- [ ] `backend/Dockerfile`: multi-stage, final stage has synced venv + `recipes/`, no dev dependencies
- [ ] `frontend/Dockerfile`: multi-stage (deps → build → run), requires `next.config.ts`'s `output: "standalone"` (add if not already set)
- [ ] `docker-compose.yml` at repo root per spec's Code Style sample (backend on 8000, frontend on 3000, `NEXT_PUBLIC_BACKEND_URL` pointing at the `backend` service name)
- [ ] `make docker` target added (already stubbed in Task 1's Makefile — verify wired to `docker compose up --build`)

**Verification:**
- [ ] `docker build ./backend` succeeds
- [ ] `docker build ./frontend` succeeds
- [ ] `docker compose up --build` (if a Docker daemon is available in this environment — disclose if not) produces `200` from both `http://localhost:8000/recipes` and `http://localhost:3000/`

**Dependencies:** Task 1 (Makefile), Task 2 (env var names referenced in compose)

**Files likely touched:**
- `backend/Dockerfile` (new)
- `frontend/Dockerfile` (new)
- `docker-compose.yml` (new)
- `frontend/next.config.ts` (add `output: "standalone"` if missing)

**Estimated scope:** Medium: 4 files

---

## Checkpoint: Docker parity (after Task 3)
- [ ] `docker compose up --build` (or, if unavailable, `docker build` on both images) succeeds

---

## Phase 3: CI + hosted deploy

### Task 4: CI workflow

**Description:** `.github/workflows/ci.yml`, two jobs (`backend`,
`frontend`), each invoking the exact `make` commands a contributor runs
locally.

**Acceptance criteria:**
- [ ] Single workflow, triggers on push/PR
- [ ] `backend` job: `uv sync`, then `make test`/`make lint`/`make validate`'s backend halves (or the full `make` targets, if they're not slow when the frontend half is unavailable in that job — decide and document)
- [ ] `frontend` job: `bun install`, then the frontend halves
- [ ] A doc-comment in `ci.yml` explicitly references the Makefile targets it calls, so "what CI runs" and "what's documented" can't drift silently
- [ ] Ubuntu latest, single Node/Python version (already pinned elsewhere) — no matrix

**Verification:**
- [ ] YAML syntax validated (`yamllint` or a Python `yaml.safe_load`, since no real GitHub Actions runner is available in this environment — disclosed)
- [ ] Every command the workflow invokes is manually run locally and passes

**Dependencies:** Task 1 (Makefile targets), Task 3 (Docker not required for CI itself, but env vars from Task 2 are)

**Files likely touched:**
- `.github/workflows/ci.yml` (new)

**Estimated scope:** Small: 1 file

---

### Task 5: `render.yaml` + deploy docs

**Description:** Render manifest for the backend; documented (not
committed) Vercel settings for the frontend.

**Acceptance criteria:**
- [ ] `render.yaml`: backend as a free-tier web service, build via the backend Dockerfile (or `uv sync` — decide per spec's "build: the backend Dockerfile or uv sync"), start via `uvicorn` entrypoint, every env var from the inventory referenced (`sync: false`, not valued) rather than hardcoded
- [ ] Deploy section of the README (Task 6) documents Vercel dashboard settings: root directory `frontend/`, env vars to set

**Verification:**
- [ ] `render.yaml` validated against Render's documented schema shape (manual cross-check, since an actual Render account/deploy isn't available in this environment — disclosed)
- [ ] Every env var referenced in `render.yaml` exists in `backend/.env.example`

**Dependencies:** Task 2 (env var inventory), Task 3 (Dockerfile, if referenced as the build method)

**Files likely touched:**
- `render.yaml` (new)

**Estimated scope:** Small: 1 file

---

## Checkpoint: CI green (after Tasks 4-5)
- [ ] CI workflow YAML valid; every step's command verified locally
- [ ] `render.yaml` shape-validated; env vars cross-checked

---

## Phase 4: Docs + repo scaffolding

### Task 6: Root `README.md`

**Description:** Quickstart (both paths), architecture overview,
consolidated env-var table, "add a recipe" pointer, deploy section.

**Acceptance criteria:**
- [ ] Quickstart shows both `make dev` and `make docker`
- [ ] One consolidated env-var table (var, service, required?, default, which module defined it) — the single source of truth the spec requires, linking to both `.env.example` files rather than duplicating their comments verbatim
- [ ] Architecture overview: one paragraph + the 8-module capability map, linking to `docs/CAPABILITY-MAP.md`
- [ ] "Add a recipe" section points to `skillet recipes new` / `make new-recipe`, not duplicating `recipe-framework`'s own docs
- [ ] Deploy section: Render (via `render.yaml`) + Vercel (dashboard settings, no file)

**Verification:**
- [ ] Every Makefile target and env var named in the README actually exists (manual cross-check against Tasks 1-2)

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
- [ ] References `make new-recipe RECIPE=<group>/<slug>`
- [ ] References the contract test a new recipe must pass (per `recipe-framework`'s spec — named precisely, not vaguely)
- [ ] References `make test`/`make lint`/`make validate` as the PR-readiness bar

**Verification:**
- [ ] Every command/test named is real (manual cross-check)

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
- [ ] `backend/scripts/check_env_docs.py` (matching the existing
      `check_trial_key_redaction.py` CI-script precedent): scans the 4 named
      specs for backtick-quoted identifiers matching `SKILLET_*`,
      `UPSTASH_*`, `NEXT_PUBLIC_*`, or the literal `OPENAI_API_KEY`, and
      asserts each appears with a non-empty trailing comment in
      `backend/.env.example` or `frontend/.env.local.example`
- [ ] Script exits non-zero (with a clear message naming the missing var) on drift; verified via a deliberate negative-control run (temporarily removing a var from the example file) before trusting it — matching this session's established empirical-verification practice
- [ ] Wired into `ci.yml`'s backend job (or a small standalone job)

**Verification:**
- [ ] `uv run python backend/scripts/check_env_docs.py` passes against the real specs/example files
- [ ] Negative control: script fails when a real var is removed from an example file

**Dependencies:** Task 2 (env files must exist), Task 4 (CI wiring)

**Files likely touched:**
- `backend/scripts/check_env_docs.py` (new)
- `.github/workflows/ci.yml` (add the step)

**Estimated scope:** Small: 2 files

---

## Checkpoint: Docs complete (after Tasks 6-8)
- [ ] Completeness script passes against real specs/example files (plus a proven negative control)
- [ ] README/CONTRIBUTING cross-checked against real Makefile targets and env vars

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
