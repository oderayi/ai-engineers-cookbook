# Tasks: `recipe-framework`

Plan: [tasks/plan.md](plan.md). Spec: [docs/SPEC-recipe-framework.md](../docs/SPEC-recipe-framework.md).

---

## Phase 0: Scaffold

### Task 0: [DONE] Repo & backend package scaffold

**Description:** Initialize version control and the `backend/` Python package
skeleton so every later task has somewhere to land.

**Acceptance criteria:**
- [x] `git init` done, `.gitignore` covers Python/Node artifacts and `.env` files
- [x] `backend/pyproject.toml` declares the package, Python `>=3.12`, `uv` as the
      manager, `ruff` + `pytest` + `pytest-asyncio` + `pytest-cov` as dev deps
- [x] `backend/src/skillet/__init__.py` and `backend/src/skillet/recipe/__init__.py`
      exist (empty package markers)

**Verification:**
- [x] `cd backend && uv sync` succeeds
- [x] `cd backend && uv run python -c "import skillet.recipe"` succeeds
- [x] `git status` shows a clean initial commit

**Dependencies:** None

**Files likely touched:**
- `.gitignore`
- `backend/pyproject.toml`
- `backend/src/skillet/__init__.py`
- `backend/src/skillet/recipe/__init__.py`

**Estimated scope:** Small: 1-2 files

---

## Phase 1: Foundations

### Task 1: [DONE] Manifest schema & TOML parsing

**Description:** `RecipeManifest` and `GroupManifest` Pydantic models covering
every field in the spec's `recipe.toml` / `group.toml` examples (including
`[[recipe.env]]` and `[[recipe.example]]`), plus a `parse_recipe_toml(path)` /
`parse_group_toml(path)` pair built on stdlib `tomllib` that raise a clear,
typed error on malformed or missing-required-field input.

**Acceptance criteria:**
- [x] Both example manifests from `SPEC-recipe-framework.md` parse into the
      models without modification
- [x] A `recipe.toml` missing a required field (e.g. `slug`) raises a typed
      `ManifestError` naming the missing field, not a raw Pydantic traceback
- [x] `RecipeManifest.example[].params` is stored as a plain dict (validated
      against `Params` later, in Task 13) — this task does not do that validation

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_manifest.py`
- [x] Build succeeds: `cd backend && uv run ruff check src/skillet/recipe/manifest.py`

**Dependencies:** Task 0

**Files likely touched:**
- `backend/src/skillet/recipe/manifest.py`
- `backend/tests/recipe/test_manifest.py`

**Estimated scope:** Small: 1-2 files

---

### Task 2: [DONE] Params base & `UploadedFile` field

**Description:** The `Params` base class every recipe's input model subclasses,
and an `UploadedFile` type usable as a `list[UploadedFile]` field that carries
`accept` / `max_files` through `json_schema_extra` so `catalog`'s schema-to-form
compiler (a different module, already spec'd) can read them later.

**Acceptance criteria:**
- [x] A subclass of `Params` with a mix of `str`, `int` (with `ge`/`le`), `bool`,
      and `list[UploadedFile]` fields produces the JSON Schema shape the
      `catalog` spec's `compileForm` expects (string/number/boolean/array with
      the file metadata under `json_schema_extra`)
- [x] `UploadedFile` instances expose a `.text()` accessor (bytes read as UTF-8);
      no file I/O or size enforcement happens in this class (that's `execution`)

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_params.py`
- [x] Manual check: `Params.model_json_schema()` on a sample subclass matches
      the shape documented in `SPEC-catalog.md`'s `RunForm` code sample

**Dependencies:** Task 0

**Files likely touched:**
- `backend/src/skillet/recipe/params.py`
- `backend/tests/recipe/test_params.py`

**Estimated scope:** Small: 1-2 files

---

### Task 3: [DONE] Fixture recipes (`echo`, `echo-with-helper`)

**Description:** Two minimal, real recipe directories used by every later test
in this module. `echo` has no helper files (the trivial path). `echo-with-helper`
imports from a sibling `helpers.py` (`from .helpers import shout`) — this is the
one thing that must work for every real content recipe later, so it's proven
here rather than discovered during Task 9.

**Acceptance criteria:**
- [x] `tests/fixtures/recipes/echo/{recipe.toml,recipe.py}` — a `Params` with one
      `message: str` field; `run()` emits `step` then `result` echoing the message
- [x] `tests/fixtures/recipes/echo-with-helper/{recipe.toml,recipe.py,helpers.py}` —
      `recipe.py` imports and calls a function from `helpers.py`
- [x] Both are valid per Task 1's manifest schema and Task 2's `Params` base
      (this task doesn't yet import or run them — that's Task 9/10)

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_fixtures_shape.py`
      (a small test that just parses both manifests and confirms the files exist)
- [x] Manual check: `python -c "import ast; ast.parse(open('...').read())"` on
      both `recipe.py` files, confirming they're at least syntactically valid
      (full import validation is Task 9)

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `backend/tests/fixtures/recipes/echo/recipe.toml`
- `backend/tests/fixtures/recipes/echo/recipe.py`
- `backend/tests/fixtures/recipes/echo-with-helper/recipe.toml`
- `backend/tests/fixtures/recipes/echo-with-helper/recipe.py`
- `backend/tests/fixtures/recipes/echo-with-helper/helpers.py`

**Estimated scope:** Small: 1-2 files (5 small files, one concern)

---

### Task 4: [DONE] Event models & SSE serialization

**Description:** Pydantic models for the seven event types
(`step, token, tool_call, log, artifact, result, error`) as a discriminated
union on a `type` field, whose `.model_dump_json()` output matches the wire
examples in `SPEC-recipe-framework.md` byte-for-byte in shape (field names,
enums for `error_type` and `artifact.kind`).

**Acceptance criteria:**
- [x] Each of the 7 event types round-trips through `model_dump_json()` /
      `model_validate_json()` and matches the spec's documented JSON shape
- [x] `error_type` is a closed enum (`timeout | output_limit | recipe_error |
      bad_input | upstream_error`); `artifact.kind` is a closed enum
      (`json | table | markdown | file`)
- [x] An invalid/unknown event `type` fails validation with a clear error

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_events.py`
- [x] Manual check: paste one serialized event of each type next to the spec's
      wire-format examples and diff by eye

**Dependencies:** Task 0

**Files likely touched:**
- `backend/src/skillet/recipe/events.py`
- `backend/tests/recipe/test_events.py`

**Estimated scope:** Small: 1-2 files

---

### Task 5: [DONE] Emitter

**Description:** The `Emitter` class recipes call (`ctx.emit.step(...)`,
`.token(...)`, etc.). It is a thin, dumb sink — each method constructs the
matching event from Task 4 and pushes it to a sink callable supplied at
construction (the executor will supply the real sink in Task 10; tests supply a
list-appending stub).

**Acceptance criteria:**
- [x] Each of the 7 methods exists with the signature implied by the code sample
      in `SPEC-recipe-framework.md` and pushes the correctly-typed event
- [x] Calling methods out of order (e.g. `result` then `token`) is *not* blocked
      by the Emitter itself — ordering/terminal-event enforcement is the
      executor's job (Task 10), not this class's
- [x] A dev-mode check (assertion, not exception) flags a `step` `start` with no
      matching `finish`/`error` by the time the recipe returns — logged, not
      raised, since the executor injects a terminal event regardless

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_emitter.py`

**Dependencies:** Task 4

**Files likely touched:**
- `backend/src/skillet/recipe/emitter.py`
- `backend/tests/recipe/test_emitter.py`

**Estimated scope:** Small: 1-2 files

---

### Task 6: [DONE] `RecipeContext` & `FileBundle`

**Description:** The `RecipeContext` dataclass recipes receive (`config`,
`files`, `emit`, `deadline`), and `FileBundle`, whose `.fixtures(name)` reads
only from the recipe's own `fixtures/` directory (never an arbitrary path).
`config` here is a minimal read-only `Mapping[str, str]` type — this module
does not build it (that's `settings`/`execution`'s job), only defines the shape
recipes read from.

**Acceptance criteria:**
- [x] `FileBundle.fixtures("sample-docs")` resolves inside that recipe's own
      `fixtures/` dir and raises (not silently returns empty) for a path outside
      it, including `../` traversal attempts
- [x] `RecipeContext.config["SOME_KEY"]` behaves like a plain read-only mapping;
      missing-key access raises `KeyError` (recipes are expected to check
      membership or use `.get`)
- [x] `ctx.deadline` is a plain `float` (monotonic timestamp); this class does
      not enforce it — Task 10's executor does

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_context.py`
- [x] Manual check: a `../../etc/passwd`-style `fixtures()` call is rejected by
      a dedicated test, not just informally verified

**Dependencies:** Task 5

**Files likely touched:**
- `backend/src/skillet/recipe/context.py`
- `backend/tests/recipe/test_context.py`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint A: Foundations (after Tasks 0–6)
- [x] `cd backend && uv run pytest` — all green (50/50)
- [x] `cd backend && uv run ruff check` — clean
- [x] No task above required importing a recipe module dynamically — that
      starts in Phase 3
- [ ] **Human review before Phase 2**

---

## Phase 2: Discovery & source

### Task 7: [DONE] Recipe discovery

**Description:** `discovery.py` scans a recipes root (an injectable path, so
tests point at `tests/fixtures/recipes/`, production points at `recipes/`),
parses every `group.toml` / `recipe.toml` via Task 1's manifest parser, and
builds an ordered, in-memory registry keyed by slug — **without importing any
Python**.

**Acceptance criteria:**
- [x] Registry is ordered by `(group.order, recipe.order)`
- [x] A duplicate `slug` across two recipe directories raises a clear
      `DiscoveryError` naming both directories
- [x] A recipe directory name that doesn't match its own `recipe.toml` `slug`
      raises a clear `DiscoveryError`
- [x] Discovering the fixtures from Task 3 never triggers a Python import
      (verified with a monkeypatched `importlib` that raises if called)

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_discovery.py`

**Dependencies:** Task 1

**Files likely touched:**
- `backend/src/skillet/recipe/discovery.py`
- `backend/tests/recipe/test_discovery.py`

**Estimated scope:** Medium: 3-5 files (includes fixture tweaks for the
duplicate-slug / mismatch test cases, added as extra temp fixture dirs within
the test file, not under the shared `tests/fixtures/recipes/`)

---

### Task 8: [DONE] Source reader & hashing

**Description:** `source.py` — given a discovered recipe's directory, enumerate
its `recipe.py` plus sibling `.py` helper files (`echo-with-helper`'s `helpers.py`
proves this), read bytes, compute per-file SHA-256 and one `bundleSha256`, and
return the `SourceBundle` shape (`path, language, text, sha256` per file, plus
the bundle hash) documented in the spec's API section.

**Acceptance criteria:**
- [x] `echo`'s bundle has exactly one file; `echo-with-helper`'s has exactly two
      (`recipe.py`, `helpers.py`), both included
- [x] `language` is derived from file extension (`python` for `.py`)
- [x] Re-reading the same recipe twice produces identical hashes (determinism);
      changing one byte in the fixture changes only that file's hash and the
      bundle hash, not the other file's hash

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/recipe/test_source.py`

**Dependencies:** Task 7

**Files likely touched:**
- `backend/src/skillet/recipe/source.py`
- `backend/tests/recipe/test_source.py`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint B: Discovery & source (after Tasks 7–8)
- [x] Discovery + source tests pass against both fixture recipes
- [x] Duplicate-slug and dir-name/slug-mismatch detection each have a dedicated
      passing test
- [x] Still zero Python-import-of-recipe-code anywhere in the suite so far

---

## Phase 3: Executor

### Task 9: Recipe loading & contract validation

**Description:** `executor.load_recipe(recipe_dir, manifest)` — the one place
that dynamically imports a recipe module, registering it so sibling relative
imports (`from .helpers import …`) resolve correctly (per the plan's top risk).
Validates the imported module defines a `Params` subclass and an `async def
run(params, ctx)` with the right signature; raises a typed
`RecipeContractError` naming exactly what's wrong otherwise.

**Acceptance criteria:**
- [ ] Both `echo` and `echo-with-helper` load successfully, including
      `echo-with-helper`'s relative import of `helpers.py`
- [ ] A recipe module missing `Params`, missing `run`, or with a non-`async`
      `run` each raise a distinct, clearly-worded `RecipeContractError`
- [ ] Loading the same recipe twice in one process doesn't crash (idempotent
      re-import / module-cache handling)

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_executor_load.py`

**Dependencies:** Task 2, Task 7

**Files likely touched:**
- `backend/src/skillet/recipe/executor.py` (load_recipe only)
- `backend/tests/recipe/test_executor_load.py`

**Estimated scope:** Medium: 3-5 files (import machinery is fiddly enough to
warrant a couple of malformed-recipe fixtures alongside the two good ones)

---

### Task 10: Execution loop

**Description:** `executor.execute(recipe, params, ctx, *, timeout_s, max_bytes,
max_events)` — an async generator that runs `recipe.run(params, ctx)` as a task,
drains the `Emitter`'s sink into the yielded event stream, enforces the wall-clock
timeout and the two caps, and guarantees exactly one terminal event
(`result`/`error`) even if the recipe forgets one or raises.

**Acceptance criteria:**
- [ ] `echo` and `echo-with-helper` each run end-to-end, yielding events in the
      order emitted, terminated by exactly one `result`
- [ ] A recipe that sleeps past `timeout_s` is cancelled and yields exactly one
      terminal `error` with `error_type = "timeout"` — no further events after it
- [ ] A recipe whose cumulative emitted-event bytes exceed `max_bytes` (or event
      count exceeds `max_events`) is stopped with exactly one terminal `error`,
      `error_type = "output_limit"`
- [ ] A recipe that raises an uncaught exception yields exactly one terminal
      `error`, `error_type = "recipe_error"`, with the traceback logged
      server-side but **not** included in the event payload

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_executor_run.py`
- [ ] Manual check: run a deliberately slow test recipe locally and confirm the
      process has no lingering task after the timeout fires (`asyncio.all_tasks()`
      count returns to baseline)

**Dependencies:** Task 5, Task 6, Task 9

**Files likely touched:**
- `backend/src/skillet/recipe/executor.py` (execute)
- `backend/tests/recipe/test_executor_run.py`
- `backend/tests/fixtures/recipes/_slow` and `_noisy` (test-only fixtures for
  the timeout and output-cap cases; not part of the "real" fixture set from
  Task 3)

**Estimated scope:** Medium: 3-5 files

---

### Task 11: Isolation-swap guard test

**Description:** The test that proves adding a recipe requires zero changes
under `src/skillet/` — success criterion 7. Writes a throwaway recipe directory
to a temp path at test time, points discovery at it, and runs it through the
full discovery → load → execute pipeline.

**Acceptance criteria:**
- [ ] The temp recipe is written entirely inside the test function (not checked
      into `tests/fixtures/`) and is discovered, loaded, and executed
      successfully using only Tasks 7/9/10's public functions
- [ ] The test asserts (via `git diff` or an equivalent check, or simply by
      construction — importing no new `src/skillet` symbols) that nothing under
      `src/skillet/` needed to change to support it

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_isolation_swap.py`

**Dependencies:** Task 7, Task 10

**Files likely touched:**
- `backend/tests/recipe/test_isolation_swap.py`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint C: Executor (after Tasks 9–11)
- [ ] Both fixture recipes run end-to-end through `execute()` with correct
      event ordering
- [ ] Timeout, output-cap, and recipe-exception paths each have a dedicated
      passing test with the right `error_type`
- [ ] No lingering asyncio tasks after a timeout (checked manually or via a
      test using `asyncio.all_tasks()`)
- [ ] **Human review before Phase 4** (this is the point where the module
      becomes runnable end-to-end, before it's exposed over HTTP)

---

## Phase 4: Read-only API

### Task 12: FastAPI app skeleton + `GET /recipes`

**Description:** `api/app.py` (app factory) and `api/recipes.py`'s
`GET /recipes`, returning grouped summaries from Task 7's discovery registry
only.

**Acceptance criteria:**
- [ ] Response shape matches the spec's summary fields (`slug, title, summary,
      group, difficulty, order, estimatedRuntimeSeconds`), grouped and ordered
      per discovery
- [ ] A test monkeypatches the recipe-import path (`importlib.import_module` or
      equivalent) to raise, and `GET /recipes` still returns `200` — proving it
      never imports recipe code (success criterion 8)

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_api_recipes_list.py`
- [ ] Manual check: `uv run fastapi dev src/skillet/api/app.py` and
      `curl localhost:8000/recipes` returns the two fixture recipes

**Dependencies:** Task 7

**Files likely touched:**
- `backend/src/skillet/api/app.py`
- `backend/src/skillet/api/recipes.py`
- `backend/tests/recipe/test_api_recipes_list.py`

**Estimated scope:** Small: 1-2 files

---

### Task 13: `GET /recipes/{slug}` full detail

**Description:** Extends `api/recipes.py` with the detail endpoint: manifest
fields + `useCases` + `readmeMarkdown` (nullable) + `examples` + `inputSchema`
(via a lazy `load_recipe` call to get `Params.model_json_schema()`) +
`sourceFiles` + `env`.

**Acceptance criteria:**
- [ ] For both fixtures, `inputSchema` matches `Params.model_json_schema()`
      exactly
- [ ] Each fixture recipe's `[[recipe.example]].params` (if any) validates
      against its `Params` model — a test adds an example to a fixture with a
      deliberately invalid `params` table and confirms the endpoint (or a
      dedicated contract check) flags it
- [ ] `readmeMarkdown` is `null` when no `README.md` exists in the recipe dir,
      and the file's contents otherwise
- [ ] Unknown `slug` returns `404`

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_api_recipe_detail.py`

**Dependencies:** Task 9, Task 12

**Files likely touched:**
- `backend/src/skillet/api/recipes.py`
- `backend/tests/recipe/test_api_recipe_detail.py`

**Estimated scope:** Medium: 3-5 files (may need a `README.md` added to one
fixture recipe to exercise the non-null path)

---

### Task 14: `GET /recipes/{slug}/source`

**Description:** Extends `api/recipes.py` with the source endpoint, returning
Task 8's `SourceBundle`.

**Acceptance criteria:**
- [ ] Response for `echo-with-helper` includes both `recipe.py` and `helpers.py`
      with correct per-file and bundle hashes
- [ ] Unknown `slug` returns `404`

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_api_source.py`

**Dependencies:** Task 8, Task 12

**Files likely touched:**
- `backend/src/skillet/api/recipes.py`
- `backend/tests/recipe/test_api_source.py`

**Estimated scope:** Small: 1-2 files

---

### Task 15: The 1-to-1 source-hash test (critical)

**Description:** The test that proves success criterion 2 — the served source
*is* the source that runs. For every fixture recipe: hash the bytes
`GET /recipes/{slug}/source` returns, hash the bytes read directly from the
module's `__file__` and its sibling `.py` files on disk, and hash what
`executor.load_recipe` actually imported (via `__file__` on the loaded module
object) — all three must match.

**Acceptance criteria:**
- [ ] All three hashes match for `echo` and for `echo-with-helper` (both files)
- [ ] The test is written so that deliberately corrupting one byte of a fixture
      file on disk (temporarily, within the test) changes all three hashes
      identically — proving the comparison isn't vacuously trivial

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_source_mapping.py`

**Dependencies:** Task 10, Task 14

**Files likely touched:**
- `backend/tests/recipe/test_source_mapping.py`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint D: Read-only API (after Tasks 12–15)
- [ ] `GET /recipes` verified not to import any recipe module (success
      criterion 8)
- [ ] `GET /recipes/{slug}` returns `inputSchema`, `sourceFiles`, `env`,
      `examples`, `readmeMarkdown` per the `catalog` cross-module contract
      (success criterion 9)
- [ ] 1-to-1 source-hash test passes (success criterion 2)
- [ ] **Human review before Phase 5**

---

## Phase 5: CLI & hardening

### Task 16: `skillet recipes validate`

**Description:** The CLI command every recipe (including future content
recipes) must pass before it's considered shippable: manifest parses, module
loads and satisfies the contract (reuses Task 9), declared fixtures exist on
disk, every `recipe.env` entry has a non-empty `provider`, and every
`recipe.example[].params` validates against `Params`. Non-zero exit with a
clear per-recipe report on any failure.

**Acceptance criteria:**
- [ ] Both fixture recipes pass `validate` cleanly
- [ ] A recipe with a missing declared fixture, an env entry with no
      `provider`, or an invalid example each fail `validate` with a message
      naming the recipe and the specific problem
- [ ] Exit code is `0` iff every recipe passes

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_cli_validate.py`
- [ ] Manual check: `cd backend && uv run skillet recipes validate` against the
      fixtures root exits `0`

**Dependencies:** Task 9

**Files likely touched:**
- `backend/src/skillet/cli.py`
- `backend/tests/recipe/test_cli_validate.py`

**Estimated scope:** Medium: 3-5 files (several malformed-recipe fixtures to
exercise each failure mode)

---

### Task 17: `skillet recipes list` & `skillet recipes new`

**Description:** `list` prints the discovery registry (grouped, ordered).
`new <group>/<slug>` scaffolds a new recipe directory from a template
(`recipe.toml` + a minimal `recipe.py` + empty `fixtures/`), ready to be filled
in and pass `validate`.

**Acceptance criteria:**
- [ ] `skillet recipes list` output order matches discovery's order
- [ ] `skillet recipes new demo/hello` creates a directory that passes
      `skillet recipes validate` immediately, unmodified
- [ ] Running `new` with an already-existing `group/slug` fails with a clear
      error instead of overwriting

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest tests/recipe/test_cli_list_new.py`
- [ ] Manual check: run `new`, inspect the generated directory by eye

**Dependencies:** Task 7, Task 16

**Files likely touched:**
- `backend/src/skillet/cli.py`
- `backend/src/skillet/recipe/templates/` (new recipe template files)
- `backend/tests/recipe/test_cli_list_new.py`

**Estimated scope:** Small: 1-2 files

---

### Task 18: Coverage & success-criteria sign-off pass

**Description:** Close any coverage gaps in `src/skillet/recipe/` to reach the
spec's ≥90% target, and produce an explicit checklist mapping each of
`SPEC-recipe-framework.md`'s 9 numbered Success Criteria to the specific test(s)
that verify it (most already exist from earlier tasks — this task is the
audit, plus whatever small test additions the audit reveals are missing).

**Acceptance criteria:**
- [ ] `uv run pytest --cov=skillet.recipe --cov-report=term-missing` reports
      ≥ 90% line coverage
- [ ] A short table (in the PR description or a comment in this task) lists
      Success Criteria 1–9 each against the test file(s) that cover it
- [ ] `uv run ruff check` and `uv run ruff format --check` are clean

**Verification:**
- [ ] Tests pass: `cd backend && uv run pytest --cov=skillet.recipe --cov-report=term-missing`
- [ ] Manual check: the coverage report and the criteria-to-test table are
      reviewed by a human before this module is considered done

**Dependencies:** Tasks 0–17

**Files likely touched:** Whatever gaps the coverage report reveals — expected
to be small additions to existing test files, not new modules.

**Estimated scope:** Small: 1-2 files

---

## Checkpoint E: Module complete (after Task 18)
- [ ] All 9 success criteria in `SPEC-recipe-framework.md` individually verified
- [ ] `src/skillet/recipe/` ≥ 90% line coverage
- [ ] Full suite + lint green
- [ ] **Human review and sign-off** — this module is what `app-shell`'s
      backend-independent frontend work does *not* need, but everything from
      `catalog` onward that talks to a real backend does
