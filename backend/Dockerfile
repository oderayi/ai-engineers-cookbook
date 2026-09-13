# Multi-stage, uv-based build (SPEC-distribution.md Confirmed Decision 4).
# The same image serves local `docker compose up` and Render's hosted
# deployment (render.yaml) -- not a dev-only stand-in.

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
WORKDIR /app

# Dependencies first, separately from the rest of the source, so an
# unrelated code change doesn't invalidate this layer's cache.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-install-project --no-dev

# Now the real source + the real recipe content. `--no-editable`: without
# it, `uv sync` installs the project as an editable `.pth` pointing back at
# `/app/src` (confirmed empirically -- `site-packages/_editable_impl_skillet
# .pth` literally contains that path), which would silently break at runtime
# if the final stage below only copied `.venv/` and not `src/` too. A real,
# fully-installed venv needs no source tree alongside it in the final image.
COPY src/ src/
COPY recipes/ recipes/
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12-slim-bookworm
WORKDIR /app

# Only the synced venv + recipes/ -- no uv, no dev dependencies, no build
# tooling in the final image.
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/recipes /app/recipes
ENV PATH="/app/.venv/bin:${PATH}"
# The installed `skillet` package's own `DEFAULT_RECIPES_ROOT` path
# arithmetic assumes a source-tree/editable layout (correct for local `uv
# run` dev, wrong for this real installed venv) -- see `api/app.py`'s own
# comment on `SKILLET_RECIPES_ROOT` for why this is set explicitly here
# rather than left to that fallback.
ENV SKILLET_RECIPES_ROOT=/app/recipes

EXPOSE 8000
CMD ["uvicorn", "skillet.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
