# Implementation Plan: `execution`

Spec: [docs/SPEC-execution.md](../docs/SPEC-execution.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Fifth module built, per the approved build order. Depends on
`recipe-framework` (done, `backend/`) and `settings` (done, `frontend/`).
Consumes `catalog`'s run form / recipe page (done) — this module mounts
`<RunOutput>` below it and wires the Run button to an actual run, per
`SPEC-catalog.md`'s own scope note ("execution owns the SSE client and the
output renderer, mounted by this page below the form").

## Overview

Turns a filled, valid run form into a live, streamed recipe execution: a
backend endpoint wrapping `recipe-framework`'s already-complete executor in
HTTP/SSE transport, and a frontend client + hook + renderer for the 7-event
stream. Built bottom-up: the wire contract (events) first, then the
transport (SSE parsing, the client, the hook), then the renderer (built
against recorded fixtures, per the spec's own Confirmed Decision 8), then
backend, then the real cross-module wiring into `catalog`'s recipe page.

## Architecture Decisions

- **The backend execution engine already exists — this module is the HTTP
  transport layer around it, not an execution engine from scratch.**
  `recipe-framework`'s `executor.execute()` (already implemented, already
  tested) does everything Confirmed Decisions 5-6 ask for: wall-clock
  timeout, output-byte/event-count caps, cancellation via `asyncio.
  CancelledError`, and the "exactly one terminal event" guarantee. This
  module's backend job is narrower than the spec's own prose might suggest:
  parse and validate the HTTP request into `(Params, config, files)`, call
  `execute()`, and stream its output as SSE — not re-implement any of the
  limit/cancellation logic `recipe-framework` already owns and already
  tests. Backend test scope follows from this: re-testing timeout/
  output-limit behavior at the HTTP layer would duplicate
  `recipe-framework`'s own `test_executor_run.py` coverage; this module's
  own tests verify the *wiring* (a real HTTP request produces the right SSE
  stream), not the executor's internal enforcement a second time.
- **Uploaded files become `Params` field values, not `ctx.files`.**
  `RecipeContext.files: FileBundle` (already built) is exclusively a
  recipe's own bundled `fixtures/` directory — unrelated to a run request's
  uploads. A `Params` field typed `list[UploadedFile]` is how a recipe
  receives uploads directly (Pydantic validates `UploadedFile` instances by
  identity, per `params.py`). The spec's own Code Style sample
  (`per_run_tempdir(parsed.files)` assigned to `RecipeContext.files`)
  reads, taken literally, as if uploads flow through `ctx.files` — that
  would require redefining `FileBundle`, which `recipe-framework` already
  shipped, tested, and signed off with a narrower, correct meaning. This
  module's temp directory instead stages raw upload bytes during multipart
  parsing (per Confirmed Decision 4, "file bytes live in a per-run temp
  area"), and the parsed request builds `UploadedFile(filename, content)`
  instances assigned directly into the matching `Params` field(s) —
  `ctx.files` stays exactly what `recipe-framework` already built.
  `RecipeContext.files` is still constructed normally, from the recipe's
  own directory, and passed through unchanged.
- **`useBackendBaseUrl()` is built here, not in `catalog`.** `catalog`'s own
  `lib/api/recipes.ts` deliberately used a fixed `NEXT_PUBLIC_BACKEND_URL`
  env var instead, documenting at the time that a runtime-configurable base
  URL (`settings.customBackendUrl || default`) was `execution`'s concern —
  this module builds that hook for real, per the spec's own Code Style
  sample, and `catalog`'s read-only fetches are free to keep using their
  simpler fixed URL (no code change needed there; a future refactor to
  share the hook is optional, not required by any success criterion here).
- **Frontend event schema is snake_case, not camelCase.** Every other
  backend response `catalog`/`settings` consume goes through
  `schemas.py`'s `CamelModel` (camelCase on the wire). `recipe.events.py`'s
  7 event types are plain `pydantic.BaseModel`s with no alias generator —
  confirmed by actually serializing one of each (`uv run python -c
  "...model_dump_json()..."`, not assumed): `error_type`, `tool_call`,
  `ts`, `recoverable`, etc. all stay snake_case on the wire. `lib/execution/
  events.ts`'s zod schema must mirror this exactly, not the camelCase
  convention every other frontend model in this codebase follows.
- **Recorded-event fixtures come before any renderer**, per the spec's own
  Confirmed Decision 8 and matching this codebase's now-consistent pattern
  (`recipe-framework`'s fixture recipes, `catalog`'s `tests/fixtures/
  catalog/`): one `.jsonl` file per scenario (happy path, token stream,
  tool calls, each of the 5 `error_type`s, the `429` contract), each line a
  real, schema-valid serialized event.
- **The catalog integration is a real, in-scope task, not a stretch goal.**
  `run-form.tsx`'s `onSubmit` prop currently no-ops with a `// TODO
  (execution)` comment, and `recipe-view.tsx` doesn't mount anything below
  the form — both were left exactly this way, on purpose, for this module
  to complete. This plan includes wiring them as a real, late-phase task,
  not an afterthought.

## Task List

### Phase 1: Foundation — parallel batch (frontend wire contract)
- [ ] Task 1 **[PARALLEL]**: `lib/execution/events.ts` (zod schema, verified against real `model_dump_json()` output)
- [ ] Task 2 **[PARALLEL]**: `lib/execution/sse.ts` (streaming `text/event-stream` line parser)

### Checkpoint: Foundation
- [ ] Each track's tests pass; `bun run typecheck`, `lint`, `test` clean
- [ ] Human review before the client/fixtures batch

### Phase 2: Client + fixtures — parallel batch
- [ ] Task 3 **[PARALLEL]**: `tests/execution/fixtures/*.jsonl` (recorded-event scenarios)
- [ ] Task 4 **[PARALLEL]**: `lib/execution/run-client.ts` (`postRun` — composes Tasks 1+2, builds the multipart request)

### Checkpoint: Client + fixtures merged
- [ ] `bun run typecheck`, `lint`, `test` clean
- [ ] Human review before the hook

### Phase 3: The run hook (sequential)
- [ ] Task 5: `hooks/use-recipe-run.ts` + `lib/execution/backend-url.ts` (`useBackendBaseUrl`)

### Checkpoint: Hook complete
- [ ] `bun run test`, `typecheck`, `lint` clean
- [ ] Human review before backend work

### Phase 4: Backend — parallel batch, then sequential endpoint
- [ ] Task 6 **[PARALLEL]**: `backend/src/skillet/execution/request.py` (parse + validate: 404/422/413, all before recipe code runs)
- [ ] Task 7 **[PARALLEL]**: `backend/src/skillet/execution/keys.py` (log-redaction filter)
- [ ] Task 8: `backend/src/skillet/api/run.py` + `execution/stream.py` (the endpoint — sequential, depends on 6+7)
- [ ] Task 9: Backend integration tests (key-hygiene + CI log-grep, endpoint contract, streaming, cancel — depends on Task 8; does NOT re-test `recipe-framework`'s own timeout/output-limit enforcement)

### Checkpoint: Backend complete
- [ ] `cd backend && uv run pytest`, `uv run ruff check .` clean; `execution/` ≥ 90% coverage
- [ ] Human review before the renderer batch

### Phase 5: Renderers — parallel batch, 3 tracks
- [ ] Task 10 **[PARALLEL — Track A]**: `step-timeline.tsx`, `token-pane.tsx`, `log-stream.tsx`
- [ ] Task 11 **[PARALLEL — Track B]**: `tool-call-card.tsx`, `run-error.tsx`, `rate-limit-notice.tsx`
- [ ] Task 12 **[PARALLEL — Track C]**: `artifact/{json-tree,data-table,markdown,file-download}.tsx`

### Checkpoint: Renderers merged
- [ ] Each track's tests pass; no conflicts; `bun run typecheck`, `lint`, `test` clean
- [ ] Human review before the orchestrator

### Phase 6: Orchestration (sequential)
- [ ] Task 13: `components/execution/run-output.tsx` (composes Task 5's hook + Phase 5's renderers)

### Checkpoint: Renderer complete
- [ ] Every event type + every `error_type` + the `429` notice render distinctly from fixtures, no backend running
- [ ] Human review before cross-module wiring

### Phase 7: Cross-module wiring + E2E (sequential)
- [ ] Task 14: Wire `<RunOutput>` into `catalog`'s `app/r/[slug]/recipe-view.tsx`; connect `RunForm`'s `onSubmit` to `useRecipeRun().start`
- [ ] Task 15: Playwright E2E against a real echo recipe, end to end (real backend + real frontend, matching `catalog`'s own E2E infrastructure)

### Checkpoint: Integration complete
- [ ] `bun run build` succeeds; manual + E2E check against a live backend passes
- [ ] Human review before sign-off

### Phase 8: Sign-off (sequential)
- [ ] Task 16: Success-criteria sign-off pass

### Checkpoint: Module complete
- [ ] All 7 success criteria individually verified
- [ ] Backend `execution/` ≥ 90% coverage; full suite + lint + typecheck + build + E2E green
- [ ] Human review before `trial-limits`/`workspace` begin consuming this module

## Parallelization Notes

| Batch | Track | Files | Depends on |
|---|---|---|---|
| 1 | A (Task 1) | `lib/execution/events.ts` + test | Nothing (verified against real backend output directly) |
| 1 | B (Task 2) | `lib/execution/sse.ts` + test | Nothing (pure text parsing) |
| 2 | A (Task 3) | `tests/execution/fixtures/*.jsonl` | Task 1 (schema shape) |
| 2 | B (Task 4) | `lib/execution/run-client.ts` + test | Tasks 1, 2 |
| 4 | A (Task 6) | `backend/src/skillet/execution/request.py` + tests | `recipe-framework` only |
| 4 | B (Task 7) | `backend/src/skillet/execution/keys.py` + tests | Nothing |
| 5 | A (Task 10) | `step-timeline.tsx`, `token-pane.tsx`, `log-stream.tsx` + tests | Tasks 1, 3 |
| 5 | B (Task 11) | `tool-call-card.tsx`, `run-error.tsx`, `rate-limit-notice.tsx` + tests | Tasks 1, 3 |
| 5 | C (Task 12) | `artifact/*.tsx` (4 files) + tests | Tasks 1, 3 |

No track reads or writes another track's files. Backend (Phase 4) and
frontend (Phases 1-3, 5-6) are entirely independent of each other and could
in principle run concurrently — sequenced here only because they're
reviewed/integrated by the same person (me), not because of a real
dependency, so backend runs after the frontend hook phase purely for
pacing, not correctness.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Frontend `events.ts` schema drifts from the real snake_case wire format (easy to assume camelCase, matching every other model in this codebase) | High — every renderer downstream depends on this | Verified directly against real `model_dump_json()` output before writing any zod schema, not assumed from convention |
| A key value leaks into a log line, an exception message, or a temp file left on disk | Critical — the module's own "Never" boundary | Task 7's redaction filter + Task 9's sentinel-value test and CI log-grep, matching the spec's own "the important one" framing |
| Re-testing `recipe-framework`'s executor internals at the HTTP layer, duplicating existing coverage without adding signal | Low-medium (wasted effort, not a defect) | Task 9 explicitly scoped to HTTP-layer wiring only; a timeout/output-limit test at this layer only needs to prove the *stream* carries the resulting `error` event through correctly, not re-derive the 90s/256KB/2000-event thresholds |
| `catalog`'s `recipe-view.tsx`/`run-form.tsx` prop shapes have drifted since that module shipped | Medium | Task 14 imports the real components and their real exported types directly — a compile error surfaces drift immediately |

## Open Questions

Carried from the spec, not blocking for these tasks:
- Outbound egress control (hosted) — spec leans "no URL params in v1
  recipes + document the risk"; not attempted here, `trial-limits`'
  concern later.
- Partial-failure UX (keep partial output above an error) — spec leans
  yes; `run-output.tsx` (Task 13) implements this directly.
- Artifact size (inline vs. a dedicated endpoint) — spec leans "inline +
  truncate for v1"; Task 12's artifact renderers implement truncation,
  no new endpoint.
- `tool_call` result truncation rule — spec leans "a single rule (e.g. 8
  KB), applied in the Emitter" — this is `recipe-framework`'s `Emitter`
  (already shipped, no truncation currently implemented there); flagged
  as a follow-up for that module rather than worked around here.
- Multi-run per tab — spec leans "cancel-and-restart"; `workspace`'s
  concern, not blocking this module's own success criteria.
