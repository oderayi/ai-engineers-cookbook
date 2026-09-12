# Spec: recipe-framework

Module id: `recipe-framework` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-09**.

## Objective

Define the contract every Skillet recipe follows and the backend machinery that
discovers, displays, and executes recipes.

- **What:** a recipe = a self-contained directory with a TOML manifest, one
  Python entrypoint module (plus optional recipe-local helpers and fixtures),
  that the backend can list, show byte-for-byte, and run with UI-supplied inputs
  while streaming structured progress events.
- **Why:** the teaching promise is "read the real code, then run it." That only
  holds if the file shown *is* the file run (the **1-to-1 source guarantee**) and
  if adding a recipe never means touching the app.
- **User:** two of them — the *learner* (reads source, fills the form, watches it
  run) and the *recipe author* (writes a directory, runs one validate command,
  ships). This module serves the author-facing contract and the executor; the
  learner-facing UI is `catalog` / `workspace`.
- **Success:** a new recipe is added with zero changes under `src/skillet/`, and
  an automated test proves the served source bytes equal the bytes the executor
  imports.

## Scope

**In:** recipe directory layout; `recipe.toml` / `group.toml` schemas; the
`Params` input-model base; `RecipeContext`; the `emit` event set and SSE wire
format; recipe discovery; the executor (import, run, timeout, output caps);
source-reading + hashing; the `skillet recipes` CLI; the read-only recipe API
(`GET /recipes`, `GET /recipes/{slug}`, `GET /recipes/{slug}/source`).

**Out:** the run endpoint and BYOK key handling (`execution`); rate limiting and
keyless trial (`trial-limits`); global/per-recipe settings merge *policy*
(`settings` — this module only consumes an already-resolved config object); all
UI (`catalog`, `workspace`, `app-shell`); the specific v1 recipes (their own
mini-specs once this is approved).

## Confirmed decisions

1. Recipes are **Python-only** (they run on the FastAPI backend).
2. **One shared, lean dependency set** for all v1 recipes — no per-recipe venv
   isolation. Hosted RAG uses API embeddings, not local models (512MB RAM on
   Render free).
   - **Default teaching stack: LangChain / LangGraph** (`langchain-core`,
     `langgraph`, provider packages like `langchain-openai` — *not* the umbrella
     `langchain` package with every integration). Other frameworks (Google ADK,
     CrewAI, ...) are added to the shared set only when a specific recipe
     genuinely needs one; each such addition is an "ask first" per the Boundaries.
   - Watch the resident footprint — the shared set must still import and run
     inside Render free's 512MB.
3. A recipe is a **directory**, not a lone file (room for manifest, code,
   fixtures).
4. **No arbitrary user code execution in v1.** Learners change values validated
   against the recipe's `Params` model and upload files matching declared file
   params — nothing else. On the hosted deployment, recipe source is
   **immutable**: the only accepted input is recipe-specific user input.
5. A recipe runs **identically hosted and locally**. "Hosted" only adds the
   `trial-limits` gate in front; it does not change the recipe or the executor.
6. Inputs are declared **two ways**: `recipe.toml` for catalog metadata (read
   without importing Python), a `Params` Pydantic model in `recipe.py` for the
   runnable inputs (single source of truth for the form and for validation,
   always visible in the displayed source).
7. Entrypoint: `async def run(params: Params, ctx: RecipeContext) -> None`. The
   recipe `emit`s events; it does not return a payload. Streaming is the default.
8. Closed event set: `step`, `token`, `tool_call`, `log`, `artifact`, `result`,
   `error`.
9. Displayed source = **the recipe module + any recipe-local helper files in the
   directory**, as tabs. Shared framework code (`RecipeContext`, `emit`, the
   `Params` base) is imported and *not* shown — plumbing, not the lesson. The
   `Params` subclass lives in `recipe.py` so it is always visible.
10. Isolation for v1: **same-process `asyncio` task** with a hard wall-clock
    timeout and an output-size cap. `run()` + `emit()` are designed so a
    subprocess/worker executor can replace the in-process one later without
    changing the recipe contract.
11. **Model selection is recipe-owned** (module constant or `Params` field). No
    settings-level model config, no `*_MODEL` env convention in v1.
12. Each recipe may declare optional **static worked examples**
    (`[[recipe.example]]`): `title`, `summary`, `expect` (prose), and a `params`
    table that must validate against `Params`. No expected output is stored.

## Read-only recipe API (this module owns it)

- `GET /recipes` → grouped summaries. **Served from manifests only — no recipe
  Python module is imported.** Each item: `slug, title, summary, group,
  groupTitle, groupIcon, difficulty, order, estimatedRuntimeSeconds`.
- `GET /recipes/{slug}` → full detail:
  - manifest fields + `useCases`
  - `groupTitle`, `groupIcon` — the recipe's group's own `title`/`icon` from
    `group.toml` (`group` itself stays the bare id; a consumer wanting the
    group's own metadata previously had to invent a second lookup —
    exposed directly instead)
  - `readmeMarkdown` — contents of the optional `README.md`, or `null`
  - `examples` — the `[[recipe.example]]` entries (`title, summary, expect, params`)
  - `inputSchema` — the `Params` model as JSON Schema (`model_json_schema()`),
    including `json_schema_extra` widget hints
  - `sourceFiles` — ordered `[{ path, language }]` for the files the source
    endpoint returns
  - `env` — the `[[recipe.env]]` entries (`key, provider, required, description`)
- `GET /recipes/{slug}/source` → the source bundle: for each file in
  `sourceFiles`, `{ path, language, text, sha256 }`, plus a `bundleSha256`.

**Amendment (approved 2026-09-12, for `catalog`):** `groupTitle`/`groupIcon`
added to both `RecipeSummary` and `RecipeDetail` — `discovery.py` already
resolves each recipe's full `GroupManifest` to sort the list
(`(group.order, recipe.order)`), but the wire contract only ever exposed the
bare `group` id, leaving `catalog`'s sidebar nav tree with no group title to
render. Also added: `CORSMiddleware` on the FastAPI app (`catalog` is the
first module to call this API from a browser origin), allowed origins
configurable via `SKILLET_CORS_ORIGINS` (comma-separated), defaulting to
`http://localhost:3000`. Neither change affects any existing success
criterion.

## Tech Stack

- Python **3.12+**
- FastAPI, Pydantic **v2**
- `sse-starlette` for SSE responses
- `tomllib` (stdlib) for manifest parsing
- `uv` for environment + script running
- `ruff` for lint + format
- `pytest` + `pytest-asyncio` + `pytest-cov` for tests

## Commands

```
Install:      uv sync
Validate:     uv run skillet recipes validate
List recipes: uv run skillet recipes list
Scaffold:     uv run skillet recipes new <group>/<slug>
Dev server:   uv run fastapi dev src/skillet/api/app.py
Test:         uv run pytest
Test + cov:   uv run pytest --cov=skillet --cov-report=term-missing
Lint:         uv run ruff check
Format:       uv run ruff format
```

## Project Structure

Monorepo (assumption — see Open Questions):

```
backend/
  pyproject.toml
  src/skillet/
    recipe/                  # THE FRAMEWORK
      __init__.py            # public: RecipeContext, Params, RecipeTimeout
      params.py              # Params base (Pydantic), UploadedFile field type
      context.py             # RecipeContext, ResolvedConfig, FileBundle
      events.py              # Event models + SSE serialization
      emitter.py             # Emitter: .step/.token/.tool_call/.log/.artifact/.result/.error
      discovery.py           # scan recipes/, parse group.toml + recipe.toml
      executor.py            # import module, run(), enforce timeout + size cap
      source.py              # read recipe source files, SHA-256 per file + bundle
      manifest.py            # RecipeManifest / GroupManifest Pydantic models
    api/
      app.py                 # FastAPI app factory
      recipes.py             # GET /recipes, /recipes/{slug}, /recipes/{slug}/source
    cli.py                   # `skillet recipes ...`
  recipes/                   # CONTENT (no imports from here into src/)
    <group-id>/
      group.toml
      <NN>-<recipe-slug>/
        recipe.toml
        recipe.py
        helpers.py           # optional, shown
        fixtures/            # optional sample inputs
  tests/
    recipe/                  # unit tests for the framework
      test_discovery.py
      test_executor.py
      test_events.py
      test_source_mapping.py
    recipes/
      test_all_recipes_valid.py   # parametrized over every recipe dir
    fixtures/
      recipes/echo/          # a trivial recipe used only by tests
frontend/                    # out of scope for this spec
```

### `group.toml`

```toml
[group]
id = "rag"                   # must equal the directory name
title = "Retrieval-Augmented Generation"
order = 20                   # position among groups
summary = "Ground an LLM in your own documents."
```

### `recipe.toml`

```toml
[recipe]
slug = "rag-basics"          # stable id, unique across all recipes, == dir name minus NN- prefix
title = "RAG over your documents"
summary = "Index a set of documents and answer questions grounded in them."
difficulty = "basic"         # basic | intermediate | advanced
order = 10                   # position within the group (mirrors the NN- dir prefix)
estimated_runtime_seconds = 20

use_cases = [
  "Question answering over a private knowledge base",
  "Customer-support assistants scoped to your docs",
]

[[recipe.env]]
key = "OPENAI_API_KEY"
provider = "openai"
required = true
description = "Used for both embeddings and the chat completion."

# Optional. Static worked examples. `params` must validate against `Params`.
# The UI renders these and offers a "Try this example" button that pre-fills
# the run form. No expected-output is stored (it drifts, can't be verified) —
# `expect` is prose describing what the learner should see.
[[recipe.example]]
title = "Ask about the sample docs"
summary = "Uses the bundled sample-docs fixture set."
expect = "A 2–3 sentence answer citing the onboarding policy, plus the retrieved chunks."
[recipe.example.params]
question = "How many vacation days do new hires get?"
top_k = 4

[recipe.entrypoint]
module = "recipe"            # recipe.py; must define `Params` and `run`
```

Only env keys listed here may be overridden per-recipe, and only with string
values (enforced by `settings` + the run endpoint; stated here as the contract).

**Model selection is recipe-owned in v1** — either a visible module-level
constant in `recipe.py` (part of the lesson) or a `Params` field when the recipe
lets the learner choose. There is no settings-level model config and no
`*_MODEL` env key convention in v1.

## Code Style

A complete minimal recipe (`recipes/rag/10-rag-basics/recipe.py`):

```python
"""RAG over your documents — index a document set, answer questions grounded in it."""

from pydantic import Field

from skillet.recipe import Params as BaseParams, RecipeContext
from skillet.recipe.params import UploadedFile

from .helpers import chunk, embed, top_k_matches


class Params(BaseParams):
    question: str = Field(
        ..., min_length=1, description="What to ask over the documents."
    )
    top_k: int = Field(
        4, ge=1, le=20, description="How many chunks to retrieve as context."
    )
    documents: list[UploadedFile] = Field(
        default_factory=list,
        description="Documents to index. Leave empty to use the bundled sample set.",
        json_schema_extra={"accept": [".txt", ".md", ".pdf"], "max_files": 10},
    )


async def run(params: Params, ctx: RecipeContext) -> None:
    docs = params.documents or ctx.files.fixtures("sample-docs")

    await ctx.emit.step("index", "Indexing documents", status="start")
    chunks = [c for d in docs for c in chunk(d.text())]
    vectors = await embed(chunks, api_key=ctx.config["OPENAI_API_KEY"])
    await ctx.emit.step("index", "Indexing documents", status="finish",
                        detail=f"{len(chunks)} chunks")

    await ctx.emit.step("retrieve", "Retrieving context", status="start")
    matches = top_k_matches(params.question, chunks, vectors, k=params.top_k)
    await ctx.emit.step("retrieve", "Retrieving context", status="finish")
    await ctx.emit.artifact("context", kind="markdown",
                            name="Retrieved chunks",
                            data="\n\n---\n\n".join(matches))

    await ctx.emit.step("generate", "Generating answer", status="start")
    async for tok in stream_answer(params.question, matches, ctx.config["OPENAI_API_KEY"]):
        await ctx.emit.token(tok)
    await ctx.emit.step("generate", "Generating answer", status="finish")

    await ctx.emit.result({"question": params.question, "chunks_used": len(matches)})
```

Conventions:

- `snake_case` functions/vars, `PascalCase` classes, module docstring on every
  recipe (its first line is a fallback `summary`).
- The recipe imports only from `skillet.recipe` (framework) and its own package
  (`.helpers`). No import from `skillet.api` or `skillet.recipe.executor`.
- Every `emit.step` call pairs a `start` with a `finish` or `error` on the same
  `id`.
- Exactly one terminal event per run: `emit.result(...)` or `emit.error(...)`
  (the executor injects an `error` if the recipe raises or times out).
- Fixture access only through `ctx.files.fixtures(...)`; never open files by path.

### Event wire format (SSE)

Each event is one `data:` line of JSON on the `/execution` stream (that endpoint
lives in the `execution` module; the schema is owned here):

```json
{"type":"step","id":"index","name":"Indexing documents","status":"start","detail":null,"ts":1.23}
{"type":"token","text":"Paris"}
{"type":"tool_call","id":"tc1","name":"web_search","args":{"q":"..."},"result":{"...":"..."},"ts":4.5}
{"type":"log","level":"info","message":"cache miss","ts":4.6}
{"type":"artifact","id":"context","kind":"markdown","name":"Retrieved chunks","data":"...","url":null}
{"type":"result","data":{"chunks_used":4},"ts":9.9}
{"type":"error","error_type":"timeout","message":"exceeded 90s","recoverable":false,"ts":90.0}
```

`artifact.kind` ∈ `json | table | markdown | file`. `error_type` ∈
`timeout | output_limit | recipe_error | bad_input | upstream_error`.

## Testing Strategy

- **Framework:** `pytest` in `tests/recipe/`. Target **≥ 90% line coverage** on
  `src/skillet/recipe/` — this code is load-bearing for the product promise.
- **Manifest/discovery:** parse valid + invalid `group.toml` / `recipe.toml`;
  ordering by `(group.order, recipe.order)`; duplicate-slug detection; dir-name
  vs `slug`/`id` mismatch detection.
- **Executor:** event ordering preserved; timeout → single `error`
  (`error_type=timeout`); output over cap → single `error`
  (`error_type=output_limit`); recipe raising → `error`
  (`error_type=recipe_error`) with traceback in server logs but not in the event;
  missing terminal event → executor appends one.
- **1-to-1 source (the critical test):** for every bundled recipe, assert
  `sha256(bytes served by GET /recipes/{slug}/source)` ==
  `sha256(bytes read from the module's __file__ and sibling .py files)` ==
  the hash the executor records at import time.
- **Recipe contract (parametrized over every dir in `recipes/`):** `recipe.toml`
  valid; module imports; defines `Params` subclass of the base; `run` is
  `async` with signature `(params, ctx)`; declared fixtures exist on disk;
  every `recipe.env` key has a non-empty `provider`.
- **Isolation-swap guard:** a test that adds a recipe dir under a temp
  `recipes/` root and runs it end-to-end through the executor **without importing
  anything from `tests/`** — proving "new recipe, zero `src/` changes."
- **Integration:** the `tests/fixtures/recipes/echo` recipe run through the
  executor yields the exact expected event sequence.

## Boundaries

**Always**
- Run `uv run skillet recipes validate` and `uv run pytest` before every commit.
- Every new recipe ships with its fixtures and is covered by the parametrized
  contract test.
- Keep anything a learner must understand *inside* the recipe directory and in
  the displayed source; if it's hidden behind an import it must be pure plumbing.
- Enforce the wall-clock timeout and output-size cap on every run.

**Ask first**
- Adding a shared recipe dependency (it counts against hosted RAM — flag it).
- Changing the `emit` event set or the SSE wire format (breaks the UI contract).
- Changing the recipe directory layout or manifest schema.
- Raising the timeout or output cap.

**Never**
- Execute user-supplied code, or accept an env var / parameter not declared by
  the recipe.
- Allow a per-recipe override of an env key absent from that recipe's
  `recipe.toml`.
- Serve a recipe as runnable when `validate` fails for it.
- Persist API keys or uploaded file contents **server-side** past the lifetime of
  a single run (no disk, no DB, no logs). Client-side, the frontend caches the
  learner's own key in `localStorage` — that is a `settings` concern, not this
  module's.
- Let recipe code read the filesystem outside its own `fixtures/` and the
  uploaded `FileBundle`.

## Success Criteria

1. `uv run skillet recipes validate` passes for all bundled recipes in CI.
2. Automated test: served source bytes == executor-imported bytes (SHA-256) for
   every recipe.
3. A `Params` value that fails validation is rejected with a field-level error
   **before** any recipe code runs.
4. An override for an env key not in `recipe.toml` is rejected.
5. A run exceeding the deadline is terminated and produces exactly one `error`
   event with `error_type = "timeout"`.
6. Events reach the client in the order the recipe emitted them, terminated by
   exactly one `result` or one `error`.
7. Adding a new recipe requires zero changes under `src/skillet/` (proven by the
   isolation-swap test).
8. `GET /recipes` responds without importing any recipe Python module (manifest
   read only) — verified by a test that patches import to raise.
9. `GET /recipes/{slug}` returns `inputSchema`, `sourceFiles`, `env`, `examples`,
   and `readmeMarkdown`; `examples[].params` each validate against the recipe's
   `Params` model (checked by the parametrized contract test).

## Open Questions

1. ~~Monorepo vs. split repos.~~ **Resolved: monorepo** (`backend/` + `frontend/`).
2. ~~Long-form teaching content.~~ **Resolved:** optional `README.md` per recipe,
   returned as `readmeMarkdown` and rendered as the expanded description in
   `catalog`. Plus structured `[[recipe.example]]` blocks.
3. **Uploaded-file limits.** `max_files` / `accept` live in the `Params` field;
   the size cap and total-payload cap are enforced by `execution` /
   `trial-limits`. Need default numbers.
4. **Startup validation.** Dev mode imports every recipe at boot (fail-fast);
   prod imports lazily on first run. Confirm that split.
5. **`tool_call` result size.** Large tool results (e.g. a full web page) need a
   truncation rule before they hit the event stream.
