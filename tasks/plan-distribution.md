# Implementation Plan: `distribution`

Spec: [docs/SPEC-distribution.md](../docs/SPEC-distribution.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Eighth and final module built, per the approved build order. Depends on
`recipe-framework` and `execution` (both done — and, transitively,
`trial-limits`/`workspace` are also both done, so nothing blocks this).

## Overview

Pure infrastructure/docs: a `Makefile` front door, two Dockerfiles +
`docker-compose.yml`, consolidated env-var documentation, `LICENSE`, a CI
workflow, and hosted-deploy manifests (`render.yaml` + documented Vercel
settings). No application code changes in `backend/src/skillet/` or
`frontend/` — the one cross-module amendment the spec flags (`trial-limits`'
`any_trial_key_configured()` short-circuit) was **already built and tested
during the `trial-limits` module itself** (confirmed by reading
`gate.py`/`author_key.py` and `backend/tests/trial_limits/test_author_key.py`
— `any_trial_key_configured()` and its 422-not-429 fallback already exist
and are covered). `distribution`'s job for that piece is purely the
*default absence* of `SKILLET_TRIAL_*` in `.env.example`/Compose that makes
it apply locally — nothing to build there.

## Env vars inventory (grounding for Task 2's consolidated docs)

Found by grepping `os.environ.get(...)` across `backend/src/skillet/` and
`process.env.` across `frontend/lib/` — not guessed:

**Backend:**
| Var | Required? | Default | Source |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | only if a trial key is configured | — | `api/app.py` |
| `UPSTASH_REDIS_REST_TOKEN` | only if a trial key is configured | — | `api/app.py` |
| `SKILLET_TRIAL_COOKIE_SECRET` | only if a trial key is configured | — | `api/app.py` |
| `SKILLET_CORS_ORIGINS` | no | `http://localhost:3000` | `api/app.py` |
| `SKILLET_TRIAL_DAILY_BUDGET_USD` | no | `5.00` | `trial_limits/budget.py` |
| `SKILLET_TRIAL_DAILY_CAP` | no | `2` | `trial_limits/counters.py` |
| `SKILLET_TRIAL_OPENAI_API_KEY` | no (absence = BYOK-only mode) | unset | `trial_limits/author_key.py` |

**Frontend:**
| Var | Required? | Default | Source |
|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | no | `http://localhost:8000` | `lib/execution/backend-url.ts`, `lib/api/recipes.ts` |

Per-recipe BYOK keys (e.g. `OPENAI_API_KEY`) are recipe-declared and dynamic
(`recipe.toml`'s own `env` entries, per `recipe-framework`), not a fixed set
— documented in the README as "each recipe declares what it needs, shown in
its own run form," not enumerated var-by-var here.

## Architecture decisions

- **Makefile first, everything else references it.** README, CONTRIBUTING,
  and `ci.yml` all point at `make <target>` rather than duplicating raw
  `uv run`/`bun run` invocations — one source of truth for "what command
  does X," matching Confirmed Decision 7 (CI runs the same commands a
  contributor runs locally). Built first so every other task can cite real,
  working target names instead of guessing them.
- **No parallel subagent dispatch for this module.** Every other file here
  (README, CONTRIBUTING, `ci.yml`) names Makefile targets or env-var names
  that must match exactly, and the two Dockerfiles must match what
  `docker-compose.yml` and `render.yaml` expect — tight enough
  cross-referencing that splitting this across agents would trade a small
  time saving for real drift risk (a contributor-facing doc citing a target
  that doesn't exist, or a compose file port that doesn't match what a
  Dockerfile exposes). Per `planning-and-task-breakdown`'s own "needs
  coordination" guidance: define the shared contract (the Makefile) first,
  then build the rest sequentially against it.
- **The env-var completeness check is a pragmatic regex scan, not a full
  markdown/AST parse.** It looks for backtick-quoted, ALL-CAPS identifiers
  matching known env-var prefixes (`SKILLET_`, `UPSTASH_`, `NEXT_PUBLIC_`) in
  the four specs the spec text names, plus the literal `OPENAI_API_KEY`
  pattern for provider keys, and asserts each one it finds appears (with a
  non-empty description on the same line) in one of the two `.env.example`
  files. Good enough to catch the drift scenario the spec describes (a
  future module spec adds a var and forgets to document it) without needing
  a real markdown parser.

## Task List

### Phase 1: Foundation
- Task 1: `Makefile` + `LICENSE` + license fields in both manifests
- Task 2: `backend/.env.example` + `frontend/.env.local.example` (consolidated env docs)

### Checkpoint: Foundation
- `make dev` boots both services against the real `.env.example`-documented vars (copied to real `.env`/`.env.local` locally, gitignored)
- `make test`, `make lint`, `make validate` all pass

### Phase 2: Docker
- Task 3: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `make docker` target

### Checkpoint: Docker parity
- `docker compose up --build` produces a working app at the same local URLs as `make dev`

### Phase 3: CI + hosted deploy
- Task 4: `.github/workflows/ci.yml` (two jobs: backend, frontend — the exact `make` commands)
- Task 5: `render.yaml` + deploy documentation (Vercel settings, no committed file)

### Checkpoint: CI green
- CI workflow runs successfully (or, if no real GitHub Actions runner is available in this environment, the workflow YAML is validated for syntax and each step manually cross-checked against the Makefile targets it invokes)

### Phase 4: Docs + repo scaffolding
- Task 6: root `README.md` (quickstart, architecture overview, consolidated env-var table, "add a recipe" pointer, deploy section)
- Task 7: `CONTRIBUTING.md` (points to `recipe-framework`'s scaffold command + contract test)
- Task 8: env-var documentation completeness script + CI wiring

### Checkpoint: Docs complete
- Completeness script passes against the real specs and real `.env.example` files

## Phase 5: Sign-off
- Task 9: Success-criteria sign-off pass (7 criteria) appended to this plan

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No real GitHub Actions runner available in this dev environment to prove CI actually goes green | Medium — criterion 3's "CI is green" can't be fully proven locally | Validate `ci.yml`'s YAML syntax, and manually run the exact command sequence it specifies locally (`make test && make lint && make validate`) as the closest available proxy; disclose this gap explicitly in the sign-off rather than silently claiming full verification |
| `docker compose up --build` requires a working Docker daemon, which may not be running/available in this sandboxed environment | Medium — same class of gap as above for criterion 1 | Build both Dockerfiles to the letter of Confirmed Decision 4 (uv-based multi-stage backend, bun-based multi-stage frontend with `output: "standalone"`) and validate via `docker build` alone (image builds successfully) even if a full `compose up` can't be exercised; disclose if compose itself can't be run |
| `render.yaml` can't be deployed to a real Render account from here | Low — this criterion is inherently only provable by an actual account holder | Validate the manifest's schema/shape against Render's documented format and cross-check every referenced env var exists in the backend's `.env.example`; disclose that the actual deploy click-through is unverifiable from this environment |
| The env-var completeness regex scan produces false positives/negatives against prose that isn't really an env var reference | Low | Scope the regex tightly to known prefixes plus the one literal exception (`OPENAI_API_KEY`), and hand-verify its output against the inventory table above before trusting it in CI |

## Open Questions

None — all resolved in the spec itself (see its own Open Questions section):
LICENSE name (Steven Oderayi), CI matrix (single OS/version), `render.yaml`
committed (yes), no keep-warm cron.

## Sign-off: Success Criteria (Task 9)

Each of `SPEC-distribution.md`'s 7 numbered Success Criteria, mapped to what verifies it.

| # | Criterion | Verified by |
|---|---|---|
| 1 | `make docker` on a clean checkout (only `make`, `docker`, internet) results in a working app at the documented local URLs, zero other setup | Real, repeated end-to-end runs against a real Docker daemon in this environment (started for this purpose, not assumed available): `docker compose up --build` from a checkout with no `.env`/`.env.local` present — both `http://localhost:8000/recipes` and `http://localhost:3000/` return `200`, with the frontend container genuinely reaching the backend over the Compose network (confirmed by contrast with an isolated single-container probe that DID show a connection-refused error). Re-run once more after the later `gate.py` fix, still green |
| 2 | `make dev` on a clean checkout (`uv`, `bun`, Python/Node available) does the same, installing dependencies itself | Real, repeated boot tests: `make dev` from a checkout with no `.env`/`.env.local` — both files auto-copied from their `.example` counterparts, both services reach `200`, catalog loads (empty, correctly — no recipes exist yet in this checkout), CORS default correctly applied. Re-run after the `gate.py` fix, still green |
| 3 | `make test`/`make lint`/`make validate` pass locally and are the exact commands CI runs | All three pass locally (267 backend + 655 frontend tests, zero lint errors). `.github/workflows/ci.yml`'s own header comment explicitly documents which Makefile targets each job calls; **genuinely verified on real GitHub Actions**, not just locally — a real push surfaced two real CI-only failures (a stale `setup-uv` tag, and a typecheck gap only visible from a truly clean checkout) that this environment's local runs had been masking; both fixed, and the very next push's CI run is fully green on both jobs (confirmed via `gh run watch`) |
| 4 | With no `SKILLET_TRIAL_*` set, every run request either succeeds or fails `422` — never `429` | **A genuine, previously-undetected gap was found and fixed here** — see `tasks/todo-distribution.md`'s own write-up. A real request (multipart form, no trial vars set, a recipe requiring a key) originally returned `200` with the key silently `null`, not a `422` — `trial_limits`' own `gate_trial_run` had no enforcement for this exact case, despite its own comment claiming "execution's own Params validation" handled it (it didn't; no such validation exists). Fixed with a minimal, targeted `HTTPException(422, ...)` addition to `gate_trial_run`, verified by a new real HTTP-level test (`test_run_endpoint_wiring.py::test_missing_required_key_with_no_trial_key_configured_returns_a_real_http_422`) plus the updated `test_gate.py` unit test — both green, full `trial_limits` suite (99 tests) and full backend suite (267 tests) re-verified |
| 5 | Every env var declared across `recipe-framework`/`execution`/`trial-limits`/`settings` appears, documented, in one of the two `.env.example` files | `backend/scripts/check_env_docs.py` (`make check-env-docs`), verified with a real negative control (temporarily removed a var's documentation, confirmed the script fails naming exactly that var, restored the file byte-identical to the committed version) — wired into CI, confirmed green on a real GitHub Actions run |
| 6 | `render.yaml` deploys the backend on a fresh Render account with only secrets to fill in; the frontend deploys to Vercel via standard auto-detection with `frontend/` as root | Every shape claim (`type`, `runtime: docker`, `dockerfilePath`/`dockerContext` being relative to the repo root, `sync: false`'s prompt-once-at-Blueprint-creation behavior) checked against a live fetch of Render's own current Blueprint spec docs, not memory. Every env var referenced exists in `backend/.env.example` (scripted cross-check). **Disclosed, not fully provable from this environment:** no real Render account or Vercel project was available to click through an actual deploy — this is the one criterion whose final step (a human clicking "Deploy" on each platform) is inherently outside what an agent in this environment can execute end-to-end. Real gap actually found and fixed while preparing for this exact criterion: `backend/Dockerfile`'s `CMD` hardcoded `--port 8000`, which would have silently failed on Render's actual dynamic `$PORT` assignment (confirmed via Render's own docs, which call relying on port auto-detection "fragile") — fixed and verified against both a no-`PORT` container (local Compose, still defaults to 8000) and a `PORT=10000` container (Render's likely real value), both `200` |
| 7 | `LICENSE` present, both manifests declare MIT | `LICENSE` (MIT text, Steven Oderayi) at repo root; `backend/pyproject.toml`'s `license = { text = "MIT" }` (pre-existing, confirmed) and `frontend/package.json`'s `"license": "MIT"` (added this module) |

**Full command suite, run locally and re-verified on real GitHub Actions:**
`make test` (267 backend + 655 frontend), `make lint`, `make validate`, `make check-redaction`, `make check-env-docs` — all green on both. `bun run build`, `docker compose up --build`, and `make dev` all independently re-verified end-to-end after the final `gate.py` fix.

**Honestly disclosed, not fully closeable from this environment:** Criterion 6's actual click-through deploy to a live Render account and Vercel project. Everything short of that final human action (manifest shape, env var completeness, Dockerfile correctness including the `$PORT` fix) was verified as thoroughly as this environment allows.

**Real bugs found and fixed during this module** (full write-ups in `tasks/todo-distribution.md`): no permanent ASGI server dependency; `backend/recipes/` didn't exist; `frontend/.gitignore` blocked the new example file; `uv sync`'s default editable install would have broken the Docker image; `httpx` was a dev-only dependency despite being a real runtime one; `DEFAULT_RECIPES_ROOT`'s path arithmetic broke under a real (non-editable) install; `docker-compose.yml`'s plain `env_file` hard-errors on a missing file; `backend/Dockerfile` ignored Render's dynamic `$PORT`; a stale `setup-uv` Action tag; a frontend typecheck gap only visible from a truly clean checkout; and the `gate_trial_run` 422 gap above — eleven real, previously-latent issues, each found through actual empirical verification (real Docker builds, a real Docker daemon, a real GitHub Actions run, real HTTP requests) rather than assumed correct.
