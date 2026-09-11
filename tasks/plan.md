# Implementation Plan: `recipe-framework`

Spec: [docs/SPEC-recipe-framework.md](../docs/SPEC-recipe-framework.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
This is the **first** module built, per the approved build order (nothing else
is unblocked until it works).

## Overview

Build the recipe contract and backend machinery from scratch: nothing exists in
`backend/` yet. The module has five layers — manifest/params primitives, the
event/emitter system, discovery + source reading, the executor, and the
read-only API + CLI on top — built bottom-up so every task lands on a working,
tested foundation rather than stubs. A single trivial fixture recipe (`echo`,
plus a sibling-helper variant) stands in for real content recipes, which get
their own mini-specs later.

## Architecture Decisions

- **Manifest-only discovery, lazy Python import.** `discovery.py` never imports
  recipe code — only `tomllib`. Python is imported once, on demand, by
  `executor.load_recipe()`, and only that function knows how to turn a recipe
  directory into an importable module (including sibling helper files via
  relative imports). This keeps `GET /recipes` fast and import-safe, per the
  spec's success criterion 8.
- **The executor is two functions, not one.** `load_recipe()` (import + contract
  validation) is separated from `execute()` (the async run loop) because both
  `execute()` and `skillet recipes validate` need the load/validate step without
  the run loop. Splitting them means `validate` doesn't need to actually run
  anything to catch a malformed recipe.
- **Two fixture recipes, not one.** `echo` (no helpers) proves the trivial path;
  `echo-with-helper` proves the sibling-import path (`from .helpers import …`)
  that real content recipes will rely on (`recipe-framework` Confirmed Decision
  9). Getting this wrong is a "works for the demo, breaks for every real recipe"
  class of bug, so it's exercised from Phase 1, not discovered later.
- **Timeout and caps live in the executor, not the emitter.** The `Emitter` is a
  dumb sink; `execute()` owns the `asyncio.timeout()`, the cumulative
  output-byte counter, and the event-count counter, because only it knows when
  to stop the task and what terminal event to inject.

## Task List

### Phase 0: Scaffold
- [x] Task 0: Repo & backend package scaffold

### Phase 1: Foundations (manifest, params, events, context)
- [x] Task 1: Manifest schema & TOML parsing
- [x] Task 2: Params base & UploadedFile field
- [x] Task 3: Fixture recipes (`echo`, `echo-with-helper`)
- [x] Task 4: Event models & SSE serialization
- [x] Task 5: Emitter
- [x] Task 6: RecipeContext & FileBundle

### Checkpoint A — Foundations
- [x] `uv run pytest` green (50/50), `uv run ruff check` clean
- [x] No integration yet — every task above is unit-tested in isolation
- [ ] Human review before Phase 2

### Phase 2: Discovery & source
- [x] Task 7: Recipe discovery
- [x] Task 8: Source reader & hashing

### Checkpoint B — Discovery & source
- [x] Discovery + source tests pass against both fixture recipes
- [x] Duplicate-slug and dir-name/slug-mismatch detection verified

### Phase 3: Executor
- [x] Task 9: Recipe loading & contract validation
- [x] Task 10: Execution loop (timeout, caps, terminal-event guarantee)
- [x] Task 11: Isolation-swap guard test

### Checkpoint C — Executor
- [x] Both fixture recipes run end-to-end through `execute()` with correct
      event ordering
- [x] Timeout → single `error(timeout)`; cap breach → single `error(output_limit)`
- [ ] Human review before exposing any of this over HTTP

### Phase 4: Read-only API
- [x] Task 12: FastAPI app skeleton + `GET /recipes`
- [x] Task 13: `GET /recipes/{slug}` full detail
- [x] Task 14: `GET /recipes/{slug}/source`
- [x] Task 15: The 1-to-1 source-hash test (critical)

### Checkpoint D — API
- [x] `GET /recipes` verified not to import any recipe module (success criterion 8)
- [x] 1-to-1 source-hash test passes for both fixtures (success criterion 2)

### Phase 5: CLI & hardening
- [x] Task 16: `skillet recipes validate`
- [x] Task 17: `skillet recipes list` & `skillet recipes new`
- [x] Task 18: Coverage & success-criteria sign-off pass

### Checkpoint E — Module complete
- [x] 8/9 success criteria individually verified (criterion 4 is schema-only
      here — see sign-off table)
- [x] `src/skillet/recipe/` ≥ 90% line coverage (98% across `src/skillet/`)
- [x] Full suite + lint green
- [ ] Human review before `app-shell`/other modules begin consuming this one

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dynamic import of a recipe module with sibling relative imports (`from .helpers import …`) is fiddly with `importlib` | High — breaks every real recipe that has helpers, not just the fixture | Register the recipe directory as a synthetic package via `importlib.util.spec_from_file_location` + `sys.modules` insertion under a private namespace; prove it with `echo-with-helper` in Phase 1, before the executor is built on top of it |
| Wall-clock timeout leaves orphaned resources (temp files, background tasks) on cancellation | Medium — resource leak under load | `execute()` wraps the run in `asyncio.timeout()` with cleanup in `finally`; Task 10's tests assert no lingering task after a timeout |
| Output-byte cap miscounts (e.g. counts pre-serialization size, or double-counts) | Low–Medium — cap either never trips or trips too early | Measure `len(event.model_dump_json().encode())` cumulatively, tested with an event stream engineered to land exactly at and one byte over the cap |
| `GET /recipes/{slug}` needs a lazy import (for `input_schema`) that could accidentally leak into `GET /recipes`' import-free guarantee if code is shared carelessly | Medium — silently violates success criterion 8 | Task 12's test (import patched to raise) runs against `GET /recipes` specifically and stays in the suite permanently, not just during Task 12 |

## Success-criteria sign-off (Task 18)

Every numbered Success Criterion in `SPEC-recipe-framework.md`, mapped to the
test(s) that verify it. Module complete: 118/118 tests pass, 98% coverage
across `src/skillet/` (each `recipe/` file individually ≥ 93%, comfortably
over the 90% target), `ruff check` clean.

| # | Criterion | Verified by |
|---|---|---|
| 1 | `skillet recipes validate` passes for all bundled recipes | `test_cli_validate.py::test_both_fixture_recipes_pass` (+ CI running the full suite) |
| 2 | Served source bytes == executor-imported bytes (SHA-256) | `test_source_mapping.py` (both tests — byte comparison **and** a corrupt-then-recheck case) |
| 3 | An invalid `Params` value is rejected before any recipe code runs | `test_params.py::test_constraint_violation_rejected`, `test_missing_required_field_rejected`, `test_params_forbids_undeclared_fields` — validation happens at `Params` construction, which is always before `execute()` is ever called |
| 4 | An override for an undeclared env key is rejected | **Not implemented or tested in this module.** `recipe-framework` only defines the `recipe.env` schema (Confirmed Decision/Boundary: "enforced by `settings` + the run endpoint"). This criterion's actual test belongs to `settings`'/`execution`'s own task lists — flagging here so it isn't assumed covered. |
| 5 | Timeout → exactly one `error(timeout)` | `test_executor_run.py::test_timeout_yields_single_terminal_error` |
| 6 | Events arrive in emitted order, terminated by exactly one result/error | `test_executor_run.py` (all cases assert this); `test_events.py` for the wire shape itself |
| 7 | A new recipe needs zero `src/skillet/` changes | `test_isolation_swap.py` |
| 8 | `GET /recipes` never imports recipe Python | `test_api_recipes_list.py::test_list_recipes_never_imports_recipe_python` |
| 9 | `GET /recipes/{slug}` returns `inputSchema`/`sourceFiles`/`env`/`examples`/`readmeMarkdown`, examples validated | `test_api_recipe_detail.py` (schema match, source files + env, README present/absent, invalid-example → 500, broken-module → 500) |

**Action item surfaced by this table:** criterion 4 needs a real test once
`settings`/`execution` are implemented — noting it now so it isn't silently
dropped.

## Open Questions

Carried from the spec, not blocking for these tasks (they affect *content*
recipes or other modules, not the framework itself):

- Startup validation mode (dev fail-fast vs. prod lazy import) — Task 18 can
  implement either behind a flag once decided; doesn't change any task's shape.
- Uploaded-file size/count defaults — owned by `execution`/`trial-limits`;
  `UploadedFile` (Task 2) only needs to carry `accept`/`max_files` metadata, not
  enforce numbers.
- `tool_call` result truncation rule — not implemented in Task 4/5; flagged so
  it isn't forgotten when `execution` needs it.
