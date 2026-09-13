# Skillet — the single front door for local development.
#
# `make dev`    — native: uv + bun, both dev servers concurrently.
# `make docker` — no local Python/Node needed at all beyond Docker itself.
# Both produce the same app at the same local URLs (backend :8000, frontend
# :3000). See docs/SPEC-distribution.md's Confirmed Decisions 1-2 for why
# `make` (not a custom shell script) is the one thing a learner is told to
# type. Windows needs WSL or Git Bash — the target audience already needs a
# real terminal per the product intent's audience assumption.

.PHONY: dev dev-backend dev-frontend docker test test-backend test-frontend \
	validate new-recipe lint lint-backend lint-frontend check-redaction check-env-docs

dev:
	@cd backend && uv sync --quiet
	@cd frontend && bun install --silent
	@$(MAKE) -j2 dev-backend dev-frontend

# `--env-file` requires the file to exist (verified empirically: `uv run
# --env-file <missing>` hard-errors, it doesn't silently skip) -- copying
# from the example on first run is what makes a bare `make dev` self-
# sufficient on a clean checkout (Success Criterion 2), never requiring a
# learner to manually create `.env` before their first run. Every var in it
# is optional for a working BYOK-only local start (see
# `backend/.env.example`'s own comments) -- copying it verbatim changes
# nothing about that.
dev-backend:
	@test -f backend/.env || cp backend/.env.example backend/.env
	@cd backend && uv run --env-file .env uvicorn skillet.api.app:app --reload --port 8000

# Next.js loads `.env.local` on its own (standard built-in behavior, no
# flag needed) -- only the copy-if-missing step is this Makefile's job.
dev-frontend:
	@test -f frontend/.env.local || cp frontend/.env.local.example frontend/.env.local
	@cd frontend && bun dev

docker:
	docker compose up --build

# `test`/`lint` each compose their two per-service halves -- split out so
# CI (`.github/workflows/ci.yml`) can run only the half whose toolchain that
# job actually installed, while a contributor still gets the exact same
# targets described in the spec's own Commands section by running the
# combined ones locally (Confirmed Decision 7: CI runs the same commands a
# contributor runs locally, never a CI-only script).
test: test-backend test-frontend

test-backend:
	@cd backend && uv run pytest

test-frontend:
	@cd frontend && bun run test

validate:
	@cd backend && uv run skillet recipes validate

# Usage: make new-recipe RECIPE=rag/rag-basics
new-recipe:
	@cd backend && uv run skillet recipes new $(RECIPE)

lint: lint-backend lint-frontend

lint-backend:
	@cd backend && uv run ruff check

lint-frontend:
	@cd frontend && bun run lint

# Both scripts' own doc comments explicitly flag wiring them into a real CI
# pipeline as this module's job (execution's check_log_redaction.py and
# trial_limits' check_trial_key_redaction.py) -- each runs the whole backend
# test suite as a real subprocess with a sentinel secret injected, then
# fails if that sentinel ever appears in captured stdout/stderr (a
# release-blocking leak, not just an in-process caplog assertion).
check-redaction:
	@cd backend && uv run python scripts/check_log_redaction.py
	@cd backend && uv run python scripts/check_trial_key_redaction.py

# Catches drift when a future module spec adds an env var and forgets to
# document it in either .env.example file.
check-env-docs:
	@cd backend && uv run python scripts/check_env_docs.py
