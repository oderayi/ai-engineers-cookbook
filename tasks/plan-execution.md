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

## Success-criteria sign-off (Task 16)

Every numbered Success Criterion in `SPEC-execution.md`, mapped to what
verifies it. Module complete: full backend suite green (167 passed, 92%
`execution/` coverage — ≥ the 90% target), full frontend unit suite green
(550 passed), 20/20 Playwright E2E tests stable across 3 consecutive runs
of the new spec, `uv run ruff check .` / `bun run {typecheck,lint,build}`
all clean. Several genuine, independently-discovered gaps were found and
fixed while building this module's own verification (not just features
shipped), cross-referenced below: two backend logging/redaction gaps (Task
9), a testing-infrastructure discovery that `TestClient`/`ASGITransport`
can't prove real streaming or disconnect behavior (Task 8), a missing
Cancel button in the UI entirely (Task 15), and a subagent's first pass at
Task 7 under-delivering against its own acceptance criteria.

| # | Criterion | Verified by |
|---|---|---|
| 1 | A bundled recipe runs end-to-end: `POST /run` streams `step` → `token`* → `result`, rendered live by `<RunOutput>` | `e2e/run-recipe.spec.ts`'s first test — a real `echo` recipe, real backend, real browser: fills the form, clicks Run, asserts the collapsed step row and the exact echoed message in the terminal result both render. Also a real `curl -N` sanity check performed while building Task 8 (snake_case SSE lines arriving incrementally) |
| 2 | Post-run, a sentinel key value is absent from all logs, the (now-deleted) run tempdir, and any client-visible error — enforced by test + CI log-grep | `tests/execution/test_key_hygiene.py` (2 tests) + `scripts/check_log_redaction.py`, verified against a real negative control (temporarily un-wiring `install_redacting_filter()` reproduced a real leak in the log traceback, caught by the script). **Two real gaps found and closed while building this**, both undocumented risks until this test surfaced them: `RedactingFilter` (Task 7) was never attached to any real logger (a filter on a parent logger doesn't apply to a child logger's own records — confirmed empirically), and message-only redaction doesn't touch an attached exception traceback at all (`logging.Formatter` renders that from `record.exc_text`, entirely separately) — both closed in Task 9's own commit, plus a third, independent gap on the client-visible side: `execute()`'s terminal `ErrorEvent.message` was reaching the client completely unredacted, fixed via `stream._redact_client_visible_message` |
| 3 | `404` / `422` (bad params, undeclared `config` key) / `413` (upload caps) are returned before recipe code executes | `tests/execution/test_run_endpoint.py` — each rejection case writes a marker file from inside the recipe's own `run()` and asserts it was never created, proving recipe code didn't just fail loudly but never ran at all, not merely that the right status code came back |
| 4 | Client cancel stops the server task within ~1 s and removes the run tempdir | `tests/execution/test_cancel.py` — a real socket-level test (see below), stable across repeated runs; also `e2e/run-recipe.spec.ts`'s second test covers the client's own affordance (the browser button), with the server-side guarantee left to the backend test rather than re-proven at the E2E layer |
| 5 | Timeout and output-limit each produce exactly one terminal `error` event with the right `error_type`; the task is stopped | `test_output_limit_breach_is_wired_through_as_terminal_error` and `test_timeout_breach_is_wired_through_as_terminal_error` (`test_run_endpoint.py`) — both explicitly scoped to proving *this endpoint's wiring* carries the terminal event through correctly, not re-deriving `recipe-framework`'s own 90s/256KB/2000-event enforcement (already exhaustively covered by its `test_executor_run.py`). The timeout case monkeypatches `stream.py`'s own `execute` reference to a 0.05s timeout, since waiting out a real 90s timeout in a test is impractical |
| 6 | Every event type and every `error_type`, plus the `429` rate-limit notice, render distinctly from fixtures with no backend running | `tests/execution/run-output.test.tsx` — 19 tests, all 7 event types + all 5 `error_type`s + the 429 notice each proven to render distinctly, driven directly from `tests/execution/fixtures/*` with `RunOutputView` (the pure, hook-free half of `<RunOutput>`) and no mocked hook at all |
| 7 | The client targets `settings.customBackendUrl` when set, the default backend otherwise | `tests/execution/backend-url.test.ts` (3 tests, Task 5) |

**Real gaps found and fixed along the way, not just features shipped** (full
detail in each task's own commit message and `tasks/todo-execution.md`
entry):
- **Task 7** (key redaction): a subagent's first pass, dispatched from a
  paraphrased summary rather than the literal task file, delivered plain
  string-redaction helpers instead of the specified `logging.Filter` +
  `contextvars` mechanism — closed same-day, documented in the todo file
  itself as a lesson on re-reading task text verbatim before writing a
  subagent prompt.
- **Task 8** (the run endpoint): discovered empirically that neither
  `fastapi.testclient.TestClient` nor `httpx.AsyncClient(transport=
  httpx.ASGITransport(...))` support genuine incremental streaming or
  deliver a real ASGI `http.disconnect` — both run the whole ASGI app to
  completion, fully buffered, before returning anything. Required a small
  real-uvicorn-on-a-real-socket test helper (`tests/execution/_server.py`)
  for the two tests that actually need that fidelity.
- **Task 9** (key hygiene): see criterion 2's row above — two backend
  redaction gaps and one client-visible-message gap, all found by writing
  the module's own "important" test rather than assuming Tasks 7/8 already
  covered it.
- **Task 14** (catalog wiring): `run-form.tsx` never actually called
  `useResolvedConfig` before this task — `RunForm.onSubmit` had never sent
  `config` at all, despite the plan's own assumption that it already did.
- **Task 15** (E2E): no fixture recipe was slow enough for a real click to
  land reliably mid-run (added `demo/30-slow-echo`), and — more
  significantly — there was no visible, clickable Cancel button anywhere in
  the UI at all; `RunOutputHandle.cancel()` (Task 13) was only ever
  reachable via a ref, for `workspace`'s future tab-close use case. Both
  fixed before the E2E spec could be written meaningfully.

No criterion is a partial/carried-forward this time — unlike every prior
module's own sign-off table, all 7 were fully verifiable within this
module's own scope, since `catalog` (the one cross-module consumer) was
already built and available to wire against directly in Task 14.
