# Skillet — the single front door for local development.
#
# `make dev`    — native: uv + bun, both dev servers concurrently.
# `make docker` — no local Python/Node needed at all beyond Docker itself.
# Both produce the same app at the same local URLs (backend :8000, frontend
# :3000). See docs/SPEC-distribution.md's Confirmed Decisions 1-2 for why
# `make` (not a custom shell script) is the one thing a learner is told to
# type. Windows needs WSL or Git Bash — the target audience already needs a
# real terminal per the product intent's audience assumption.

.PHONY: dev dev-backend dev-frontend docker test validate new-recipe lint

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

test:
	@cd backend && uv run pytest
	@cd frontend && bun run test

validate:
	@cd backend && uv run skillet recipes validate

# Usage: make new-recipe RECIPE=rag/rag-basics
new-recipe:
	@cd backend && uv run skillet recipes new $(RECIPE)

lint:
	@cd backend && uv run ruff check
	@cd frontend && bun run lint
