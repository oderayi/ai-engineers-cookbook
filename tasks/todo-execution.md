# Tasks: `execution`

Plan: [tasks/plan-execution.md](plan-execution.md). Spec: [docs/SPEC-execution.md](../docs/SPEC-execution.md).

---

## Phase 1: Foundation — parallel batch (frontend wire contract)

### Task 1 [PARALLEL — Track A]: `lib/execution/events.ts`

**Description:** The zod schema for the 7 recipe events, mirroring the
backend's exact wire format (snake_case, plain Pydantic serialization — NOT
`CamelModel`, unlike every other model in this codebase).

**Acceptance criteria:**
- [x] `StepEvent`, `TokenEvent`, `ToolCallEvent`, `LogEvent`, `ArtifactEvent`,
      `ResultEvent`, `ErrorEvent` zod schemas, field-for-field matching
      `backend/src/skillet/recipe/events.py`'s real `model_dump_json()`
      output (generated via `uv run python -c "..."`, confirmed snake_case
      with no camelCase conversion, unlike every other model this frontend
      consumes)
- [x] A discriminated union (`z.discriminatedUnion("type", [...])`) keyed on
      `type`, matching the backend's own `Field(discriminator="type")`
- [x] `error_type` is a literal union of exactly the 5 real values
      (`timeout`, `output_limit`, `recipe_error`, `bad_input`,
      `upstream_error`); `ArtifactEvent.kind` is `json | table | markdown |
      file`
- [x] Optional/nullable fields (`detail`, `url`) accept `null` (the real
      wire value for an absent optional field, confirmed via real
      serialization — not `undefined`)

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/events` (24/24)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/lib/execution/events.ts`
- `frontend/tests/execution/events.test.ts`

**Estimated scope:** Small: 1-2 files

---

### Task 2 [PARALLEL — Track B]: `lib/execution/sse.ts`

**Description:** A streaming line parser for `text/event-stream` framing
over a `fetch`-based `ReadableStream` reader (not `EventSource`, which
can't POST — per Confirmed Decision 1).

**Acceptance criteria:**
- [x] Given a `ReadableStream<Uint8Array>` (chosen so `run-client.ts` can
      hand it `Response.body` with no adapter), yields each SSE `data:`
      line's payload as it arrives, handling a `data:` field split across
      multiple chunks — including a UTF-8 multi-byte codepoint split
      mid-sequence
- [x] Handles multiple `data:` lines before a blank-line terminator by
      joining them per the SSE spec (`\n`-joined)
- [x] Ignores comment lines (`:`-prefixed) and other SSE fields (`event:`,
      `id:`, `retry:`)
- [x] Stops cleanly when the stream ends or the caller's `AbortSignal`
      fires — a pending `reader.read()` is raced against the abort event
      rather than waited out, and the reader is cancelled in a `finally`

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/sse` (21/21)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/lib/execution/sse.ts`
- `frontend/tests/execution/sse.test.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Foundation (after Tasks 1-2)
- [x] Each track's tests pass; no conflicts; `bun run typecheck`, `lint`,
      `test` clean (51 files, 418/418)
- [ ] **Human review before the client/fixtures batch**

---

## Phase 2: Client + fixtures — parallel batch

### Task 3 [PARALLEL — Track A]: recorded-event fixtures

**Description:** `.jsonl` fixtures (one real event per line, each schema-valid
per Task 1) covering every scenario the renderer needs to prove itself
against with no backend running.

**Acceptance criteria:**
- [x] At least: a happy-path run (`step` start → `token`* → `step` finish →
      `result`), a token-heavy stream, a run with `tool_call` events, one
      fixture per `error_type` (5 total), and a `429` rate-limit payload
      (the JSON shape from `SPEC-execution.md`'s own `429` contract section
      — not an SSE event, a plain rejected-response body)
- [x] Every event line parses via Task 1's zod schema with no errors (a
      test enforces this) — plus a coverage guard that all 7 event types
      and all 5 `error_type`s appear at least once somewhere
- [x] At least one fixture exercises a partial-output-then-error scenario
      (tokens stream, then an `error` — no `result`) for the "keep partial
      output visible" behavior `run-output.tsx` (Task 13) needs to prove

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/fixtures` (17/17)
- [x] `bun run typecheck`

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/tests/execution/fixtures/*.jsonl`
- `frontend/tests/execution/fixtures/index.test.ts` (schema-validity guard)

**Estimated scope:** Medium: 3-5 files

---

### Task 4 [PARALLEL — Track B]: `lib/execution/run-client.ts`

**Description:** `postRun(backend, slug, payload, signal): AsyncIterable<RecipeEvent>`
— composes Tasks 1 (event parsing) + 2 (SSE line parsing), builds the
`multipart/form-data` request.

**Acceptance criteria:**
- [x] Builds a `FormData` body: `params` (JSON string field), `config`
      (JSON string field — the already-resolved map from `settings`, sent
      verbatim, never recomputed client-side per Confirmed Decision 2), and
      one file part per uploaded file, keyed `files[<fieldName>][]` (the
      wire convention the backend task, Task 6, must match exactly —
      documented prominently in the file's own doc comment)
- [x] `POST`s via `fetch` with the given `AbortSignal`; on a non-2xx
      response, throws a typed error (`RunRequestError`, carrying `status`
      and a best-effort parsed `body`) rather than starting to iterate a
      stream that was never actually a stream
- [x] Each yielded item is already zod-parsed via Task 1 — a malformed
      event from the server throws a typed error, not a silent skip
- [x] Aborting the signal stops iteration promptly — no extra handling on
      top of `fetch`/`parseSSEStream`'s own abort behavior, by design (an
      abort-driven rejection propagates exactly as calling either directly)

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/run-client` (13/13)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 1, 2

**Files likely touched:**
- `frontend/lib/execution/run-client.ts`
- `frontend/tests/execution/run-client.test.ts`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Client + fixtures merged (after Tasks 3-4)
- [x] `bun run typecheck`, `lint`, `test` clean; no conflicts (53 files, 448/448)
- [ ] **Human review before the hook**

---

## Phase 3: The run hook (sequential)

### Task 5: `hooks/use-recipe-run.ts` + `useBackendBaseUrl`

**Description:** The reducer-based hook per the spec's Code Style sample,
plus the `useBackendBaseUrl()` hook `catalog` deliberately left for this
module to build (see plan's Architecture Decisions).

**Deviation from the plan, documented at implementation time:** the 429
contract's zod schema got its own small file (`lib/execution/rate-limit.ts`,
not listed in the plan's "Files likely touched") — needed somewhere for
`classifyFailure()` to validate `RunRequestError.body` against before
routing to `kind: "rate_limit"`, and this module's own convention (`lib/
execution/events.ts`) is "wire-contract shapes get a dedicated file," not
an inline schema buried in the hook.

**Acceptance criteria:**
- [x] `useBackendBaseUrl()`: `settings.customBackendUrl || NEXT_PUBLIC_BACKEND_URL default`
      — reads `useSettings()` (already built), matching the exact fallback
      logic the spec's own comment describes
- [x] `useRecipeRun(slug)` returns `{ status, events, result, error, start, cancel }`
      exactly
- [x] `status` transitions `idle → running → done | error`, back to `idle`
      on `cancel()` (not just a fresh `start()` — an explicit cancel needs
      to visibly return to idle too, or a user-initiated stop would look
      stuck in "running" forever); `start()` while already running aborts
      the previous run first (cancel-and-restart)
- [x] `start(payload)` creates a fresh `AbortController`, iterates
      `postRun(...)`, dispatching each event; `cancel()` aborts the current
      controller — an abort-driven rejection is recognized via the
      *locally captured* controller from that specific `start()` call, not
      whatever `ctrl.current` points at when the rejection is observed, so
      a fast cancel-then-restart can't misattribute the old run's abort to
      the new one
- [x] A transport-level failure is distinguished in `error.kind` from an
      in-stream `ErrorEvent` (`"transport"` vs `"stream"`) — and a `429`
      specifically gets its own `"rate_limit"` kind (validated against the
      real contract shape), so a later renderer task can route it to
      `<RateLimitNotice>` instead of `<RunError>`

**Verification:**
- [x] Tests pass: `cd frontend && bun run test hooks/use-recipe-run` (8/8,
      plus 5/5 for the new `rate-limit.ts` schema and 3/3 for
      `backend-url.ts`)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Task 4

**Files likely touched:**
- `frontend/hooks/use-recipe-run.ts`
- `frontend/lib/execution/backend-url.ts`
- `frontend/tests/hooks/use-recipe-run.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Hook complete
- [x] `bun run test` (56 files, 464/464), `typecheck`, `lint` clean
- [ ] **Human review before backend work**

---

## Phase 4: Backend — parallel batch, then sequential endpoint

### Task 6 [PARALLEL — Track A]: `backend/src/skillet/execution/request.py`

**Description:** Parses and validates a run request into `(Params, config,
files)` — every rejection (`404`/`422`/`413`) happens here, before any
recipe code runs.

**Acceptance criteria:**
- [x] Unknown slug → the caller can produce a `404` (this function itself
      may just raise/return a typed "not found" — the actual HTTP status
      mapping can live in Task 8's endpoint; document whichever split you
      choose) — **implemented as documented:** `parse_run_request` assumes
      an already-resolved `DiscoveredRecipe`/`LoadedRecipe`; 404 lookup
      stays one layer up, in Task 8's endpoint
- [x] Parses the `params` form field as JSON, validates against the
      recipe's real `Params` class (via `load_recipe`) — a validation
      failure surfaces field-level errors for a `422`
- [x] Parses the `config` form field as JSON; a key not in the recipe's
      declared `env` → `422` (never silently dropped, never passed through)
- [x] Multipart file parts are matched to the `Params` fields declared as
      file inputs (`list[UploadedFile]`, per `json_schema_extra`'s
      `accept`/`max_files`) and wrapped as real `UploadedFile` instances
      assigned into the parsed `Params` — see the plan's Architecture
      Decision on this (NOT `ctx.files`)
- [x] Caps enforced before recipe code runs: per-file ≤ 5 MB, total ≤ 20
      MB, ≤ 10 files, extension must be in the field's declared `accept` —
      any breach → `413`-mappable rejection
- [x] Uploaded bytes are staged in a per-run temp directory, not held
      entirely in memory for the whole request (per Confirmed Decision 4)

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/execution/test_request.py` (11/11)
- [x] `uv run ruff check .` clean

**Dependencies:** `recipe-framework` only (already built)

**Files likely touched:**
- `backend/src/skillet/execution/request.py`
- `backend/tests/execution/test_request.py`

**Estimated scope:** Medium: 3-5 files (this is the most involved backend piece)

---

### Task 7 [PARALLEL — Track B]: `backend/src/skillet/execution/keys.py`

**Description:** The log-redaction filter — every log line gets scrubbed of
any value that came in via `config`, before it's ever written anywhere.

**Acceptance criteria:**
- [x] A `logging.Filter` subclass (`RedactingFilter`) that redacts any
      string matching a known-sensitive value (the actual `config` values
      for the current run, injected via `contextvars`'
      `redaction_context(config)` context manager, so the filter doesn't
      need a request object threaded through every log call) from a
      record's message and args before it's emitted — rewrites
      `record.msg` to the fully-formatted, redacted message and clears
      `record.args` (a secret passed as a lazy `%s` arg would otherwise
      survive `record.getMessage()` unredacted)
- [x] Also redacts common key-shaped patterns as defense in depth
      (`redact_key_shaped_patterns`: provider-prefixed tokens like
      `sk-`/`ghp_`/`xox*-`, and generic 20+ char alphanumeric runs) even if
      they didn't come from this run's own `config` — documented as a
      heuristic (best-effort, not exhaustive) in the module docstring
- [x] A sentinel test: log a message containing a known fake "key" value
      through a real logger with this filter attached (via `caplog`),
      assert the captured output never contains it
- [x] Config itself is never written to disk, DB, or cache anywhere in this
      module (true by construction — the module only ever holds `config`
      in an in-memory `contextvars.ContextVar` for the duration of a `with
      redaction_context(...)` block)

**Deviation, documented at implementation time:** the first implementation
pass (subagent-dispatched, reviewed before landing) delivered only plain
`redact()`/`redact_exception()` string helpers — no `logging.Filter`, no
`contextvars`, no key-shaped heuristic — a real gap against this task's own
acceptance criteria above, since `skillet.recipe.executor`/`emitter` already
log via the stdlib `logging` module and a plain helper requires every call
site to remember to invoke it. Closed in a same-day follow-up commit adding
`redaction_context`, `RedactingFilter`, and `redact_key_shaped_patterns` on
top of the already-good `redact`/`redact_exception` (which are unchanged and
still the primitive `RedactingFilter` calls internally).

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/execution/test_keys.py` (17/17;
      task file's own filename guess, `test_key_hygiene.py`, wasn't used —
      all redaction tests, including the `logging.Filter` ones, live in
      `test_keys.py` alongside the module they test)
- [x] `uv run ruff check .` clean

**Dependencies:** None

**Files likely touched:**
- `backend/src/skillet/execution/keys.py`
- `backend/tests/execution/test_key_hygiene.py`

**Estimated scope:** Small: 1-2 files

---

### Task 8: `backend/src/skillet/api/run.py` + `execution/stream.py`

**Description:** The actual endpoint: recipe lookup, `parse_run_request`,
`execute()`, SSE streaming — per the spec's own Code Style sample.

**Acceptance criteria:**
- [x] `POST /recipes/{slug}/run`: unknown slug → `404`; a request rejected
      by Task 6's parsing → the mapped `422`/`413`, before `execute()` is
      ever called
- [x] Wraps `recipe-framework`'s `execute()` (already built — reuse it
      directly, do not reimplement any of its timeout/cap/cancellation
      logic), yielding `ServerSentEvent(data=event.model_dump_json())` per
      event
- [x] `Content-Type: text/event-stream` on the response
- [x] A client disconnect (request aborted) cancels the underlying
      `asyncio` task and cleans up the per-run temp directory in a
      `finally` — verified by checking the directory is actually gone
      after a simulated disconnect, not just assumed from `sse-starlette`'s
      own behavior — **empirically discovered along the way**: neither
      `TestClient` nor `httpx.ASGITransport` actually stream (both run the
      whole ASGI app to completion, fully buffered, before returning
      anything) or deliver a real ASGI `http.disconnect`, so this needed a
      real uvicorn server on a real socket (`tests/execution/_server.py`,
      `uvicorn` added as a dev dependency) — confirmed stable across
      repeated runs
- [x] Every log line this endpoint (or anything it calls) emits during a
      request goes through Task 7's redaction filter — **and, discovered
      while wiring this up, so does the client-visible terminal
      `ErrorEvent`/`LogEvent.message`**, which `execute()` builds
      unredacted from a recipe's raw `str(exc)`; see Task 9's own note

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/execution/test_run_endpoint.py tests/execution/test_cancel.py`
- [x] `uv run ruff check .` clean
- [x] Manual: `curl -N` against a real running backend — confirmed
      incrementally-arriving SSE lines (snake_case wire format), not one
      buffered blob

**Dependencies:** Tasks 6, 7

**Files likely touched:**
- `backend/src/skillet/api/run.py`
- `backend/src/skillet/execution/stream.py`
- `backend/tests/execution/test_run_endpoint.py`
- `backend/tests/execution/test_cancel.py`

**Estimated scope:** Medium: 3-5 files

---

### Task 9: Backend integration tests + CI log-grep

**Description:** The remaining endpoint-contract and streaming-behavior
tests Task 8 didn't already cover, plus the CI step grepping captured log
output for a sentinel key value.

**Acceptance criteria:**
- [x] Streaming: first byte arrives well before a deliberately-slow fixture
      recipe finishes (proves no whole-response buffering); event order is
      preserved; exactly one terminal `result` or `error` per run
- [x] A recipe that breaches `recipe-framework`'s own timeout/output-limit
      thresholds produces the corresponding terminal `error` event,
      streamed correctly through THIS endpoint — verifying the wiring
      carries it through, not re-deriving the 90s/256KB/2000-event
      enforcement itself (already covered by `recipe-framework`'s own
      `test_executor_run.py`)
- [x] A CI step (documented — a script or a CI config addition, your call
      on the exact mechanism) runs the test suite with a sentinel value
      injected as a fake key, captures all log output, and fails the build
      if the sentinel appears anywhere in it
- [x] `execution/` package reaches ≥ 90% line coverage (92%)

**Real gaps found and closed while writing the key-hygiene test** (the
project's "verify, don't guess" pattern doing its job again): `RedactingFilter`
(Task 7) was never actually attached to any real logger — a filter on a
*parent* logger doesn't apply to a child logger's own records (confirmed
empirically: only a `Handler`'s filters propagate that way) — fixed via
`keys.install_redacting_filter()`, wired into `create_app()`. Separately,
message-only redaction doesn't touch an attached exception traceback
(`logging.Formatter` renders it from `record.exc_text`, entirely apart from
`record.msg`) — `executor.py`'s own `logger.exception(...)` on a recipe's
uncaught exception was leaking the sentinel through the traceback even with
the filter attached; fixed by having the filter pre-compute a redacted
`exc_text`/`stack_info`. And independently, the terminal `ErrorEvent`/
`LogEvent.message` reaching the *client* was never redacted at all —
`execute()` builds it verbatim from a recipe's raw `str(exc)`; fixed via
`stream._redact_client_visible_message`, scoped to just those two
message-shaped fields per the spec's own boundary wording, not every event
field a recipe might return. Verified against a real negative control
(temporarily un-wiring `install_redacting_filter()` reproduced a real leak
that the CI script and a permanent regression test both caught).

**Verification:**
- [x] `cd backend && uv run pytest --cov=skillet.execution --cov-report=term-missing` — 92%
- [x] `uv run ruff check .` clean

**Dependencies:** Task 8

**Files likely touched:**
- `backend/tests/execution/test_run_endpoint.py` (extended)
- `backend/tests/execution/test_key_hygiene.py` (new — not in the plan's own
  guess, but the natural home for the sentinel test per the project's other
  modules' convention of one file per concern)
- `backend/scripts/check_log_redaction.py` (the log-grep mechanism — CI
  wiring itself deferred to `distribution`, which owns packaging/CI per
  `docs/CAPABILITY-MAP.md`; this script is what it should invoke)

**Estimated scope:** Small: 1-2 files (grew to ~5 once the redaction gaps
surfaced — documented above rather than silently expanding scope)

---

## Checkpoint: Backend complete (after Tasks 6-9)
- [x] `cd backend && uv run pytest` (166 passed), `uv run ruff check .` clean;
      `execution/` 92% coverage (≥ 90% target)
- [x] Per the standing "just proceed" instruction, this checkpoint's human
      review is treated as pre-approved — proceeding directly to Phase 5
      (renderers)

---

## Phase 5: Renderers — parallel batch, 3 tracks

*Each takes fully-parsed events (Task 1's types) as props — never raw JSON,
never a slug to fetch. Built and tested against Task 3's fixtures.*

### Task 10 [PARALLEL — Track A]: `step-timeline.tsx`, `token-pane.tsx`, `log-stream.tsx`

**Acceptance criteria:**
- [x] `step-timeline.tsx`: renders each `StepEvent` as a timeline entry
      (name, status, detail), start/finish pairs collapsed into one visual
      entry keyed by `id`, an unclosed step (start with no matching
      finish/error yet) shown as "in progress"
- [x] `token-pane.tsx`: accumulates `TokenEvent.text` into a single growing
      text block (this is the streamed model output) — appends, never
      replaces or re-renders the whole accumulated text from scratch on
      every token (a real perf concern for a long stream)
- [x] `log-stream.tsx`: renders `LogEvent`s in order, visually distinguishing
      `info`/`warn`/`error` levels

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/step-timeline execution/token-pane execution/log-stream` (16/16)
- [x] `bun run typecheck && bun run lint` clean

**Dependencies:** Tasks 1, 3

**Files likely touched:**
- `frontend/components/execution/step-timeline.tsx`
- `frontend/components/execution/token-pane.tsx`
- `frontend/components/execution/log-stream.tsx`
- matching test files

**Estimated scope:** Medium: 3-5 files

---

### Task 11 [PARALLEL — Track B]: `tool-call-card.tsx`, `run-error.tsx`, `rate-limit-notice.tsx`

**Acceptance criteria:**
- [x] `tool-call-card.tsx`: an expandable card per `ToolCallEvent` (name,
      args, result) — collapsed by default, matching `description-panel`'s
      own established collapsible convention where reasonable
- [x] `run-error.tsx`: one visually distinct rendering per `error_type` (5
      total) plus a retry affordance for a transport-level error (network/
      5xx) — a `429` must NOT render here (routed to `rate-limit-notice.tsx`
      instead, per the spec's own explicit distinction) — implemented as an
      optional `onRetry` prop the component never infers on its own (see the
      component's own doc comment: none of the 5 in-stream `error_type`s are
      naturally "just retry"; the orchestrator, Task 13, decides when to
      pass one, e.g. for a `RunFailure.kind === "transport"` case)
- [x] `rate-limit-notice.tsx`: renders the `429` contract's exact shape
      (`scope`, `message`, `retry_after_seconds`, `cta`) as the "add your
      own key / clone locally" nudge — `cta: "add_key"` links toward
      `settings`, `cta: "clone_local"` toward the repo/docs (your call on
      exact copy/links) — used the project's real GitHub remote URL (`git
      remote -v`), not an invented placeholder

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/tool-call-card execution/run-error execution/rate-limit-notice` (18/18)
- [x] `bun run typecheck && bun run lint` clean

**Dependencies:** Tasks 1, 3

**Files likely touched:**
- `frontend/components/execution/tool-call-card.tsx`
- `frontend/components/execution/run-error.tsx`
- `frontend/components/execution/rate-limit-notice.tsx`
- matching test files

**Estimated scope:** Medium: 3-5 files

---

### Task 12 [PARALLEL — Track C]: `artifact/{json-tree,data-table,markdown,file-download}.tsx`

**Acceptance criteria:**
- [x] One component per `ArtifactEvent.kind` (`json`, `table`, `markdown`,
      `file`), dispatched by whichever parent renders them (Task 13, not
      this task's concern)
- [x] `json-tree.tsx`: a collapsible tree view of `data` (per-node expand/
      collapse state, lighter-weight than `CollapsibleSection` which is
      styled as a full bordered section — documented as a deliberate
      deviation)
- [x] `data-table.tsx`: renders `data` as rows/columns — documented expected
      shape `{ columns: string[]; rows: unknown[][] }`, confirmed against
      the real fixture, with a runtime guard + graceful fallback for
      malformed input
- [x] `markdown.tsx`: renders `data` (a markdown string) via
      `react-markdown` + `remark-gfm`, mirroring `description-panel.tsx`'s
      exact styling/safety posture — no raw-HTML passthrough
- [x] `file-download.tsx`: for `url`-based artifacts, a labeled link/button
      — a real accessibility finding here: composing `<Button>` via Base
      UI's `render` prop forces `role="button"` onto the rendered `<a>`
      (confirmed by reading Base UI's `useButton` source), misrepresenting
      a real outbound link to assistive tech; fixed by applying the
      exported `buttonVariants` classes directly to a plain `<a href>`
      instead, preserving correct link semantics with identical styling
- [x] Each truncates a large payload with a visible "truncated" note rather
      than rendering an unbounded blob (`data-table.tsx`: 100 rows;
      `markdown.tsx`: 20,000 characters)

**Verification:**
- [x] Tests pass: `cd frontend && bun run test execution/artifact` (29/29)
- [x] `bun run typecheck && bun run lint` clean

**Dependencies:** Tasks 1, 3

**Files likely touched:**
- `frontend/components/execution/artifact/json-tree.tsx`
- `frontend/components/execution/artifact/data-table.tsx`
- `frontend/components/execution/artifact/markdown.tsx`
- `frontend/components/execution/artifact/file-download.tsx`
- matching test files

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Renderers merged (after Tasks 10-12)
- [x] Each track's tests pass; no conflicts (3 parallel subagents, disjoint
      file lists, verified via `git status` and a full independent re-run);
      `bun run typecheck`, `lint` clean, `test` 527/527 passed (66 files)
- [x] Per the standing "just proceed" instruction, this checkpoint's human
      review is treated as pre-approved — proceeding directly to Task 13
      (the orchestrator)

---

## Phase 6: Orchestration (sequential)

### Task 13: `components/execution/run-output.tsx`

**Description:** Composes Task 5's `useRecipeRun` output with Phase 5's
renderers into the single component `catalog`/`workspace` mount.

**Acceptance criteria:**
- [ ] Dispatches each event to the right sub-renderer by `type` (and
      `ArtifactEvent.kind` for artifacts) — never renders event bytes as
      HTML itself, never lets a parent reach into the event stream
- [ ] A `429` response (from `useRecipeRun`'s transport-error path) renders
      `<RateLimitNotice>`, never `<RunError>`
- [ ] Partial output (tokens/steps/tool-calls already streamed) stays
      visible above a terminal `error`'s banner — not cleared (per Open
      Question 2's leaning)
- [ ] Every event type, every `error_type`, and the `429` notice each
      render distinctly when driven directly from Task 3's fixtures, with
      no backend running (success criterion 6) — a dedicated fixture-driven
      test proves this for all 5+7+1 cases, not just a couple

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test execution/run-output`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 5, Phase 5

**Files likely touched:**
- `frontend/components/execution/run-output.tsx`
- `frontend/tests/execution/run-output.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Renderer complete
- [ ] Every event type + every `error_type` + the `429` notice render distinctly from fixtures, no backend running
- [ ] **Human review before cross-module wiring**

---

## Phase 7: Cross-module wiring + E2E (sequential)

### Task 14: Wire `<RunOutput>` into `catalog`'s recipe page

**Description:** The real integration point: `RunForm`'s `onSubmit` starts
a real run, `<RunOutput>` renders it, mounted below the form in
`recipe-view.tsx`.

**Acceptance criteria:**
- [ ] `app/r/[slug]/recipe-view.tsx` mounts `<RunOutput slug={slug} />` (or
      your close equivalent) below `<RunForm>`
- [ ] `RunForm`'s `onSubmit` payload (`{ params, recipeSlug }`) is wired to
      `useRecipeRun(slug).start(...)`, replacing the `// TODO(execution)`
      no-op left there since `catalog`'s Task 14
- [ ] `RecipeOverrides`' resolved config (already computed inside
      `RunForm` via `useResolvedConfig`) is what actually gets sent as the
      run's `config` — confirm this end-to-end, not just that a `config`
      object of *some* shape is sent
- [ ] Browsing (description/examples/source) still renders and works
      exactly as `catalog`'s own tests already prove — this task must not
      regress any of `catalog`'s existing test suite

**Verification:**
- [ ] `bun run typecheck && bun run lint`
- [ ] `bun run test` — `catalog`'s existing `recipe-view.test.tsx` and
      `run-form.test.tsx` still pass, plus new assertions for the wiring
- [ ] `bun run build` succeeds

**Dependencies:** Task 13

**Files likely touched:**
- `frontend/app/r/[slug]/recipe-view.tsx`
- `frontend/components/catalog/run-form/run-form.tsx` (only if the
  `onSubmit` prop shape itself needs to change — try to avoid this; prefer
  wiring at the call site in `recipe-view.tsx`)
- `frontend/tests/catalog/recipe-view.test.tsx` (extended)

**Estimated scope:** Medium: 3-5 files

---

### Task 15: Playwright E2E against a real echo recipe

**Description:** One real end-to-end run, against a live backend, through
the actual UI — not fixtures, not mocks.

**Acceptance criteria:**
- [ ] Reuses `catalog`'s E2E infrastructure (`backend/scripts/
      e2e_recipes_server.py`, the dual-`webServer` `playwright.config.ts`
      setup) rather than building a second parallel backend-launching
      mechanism
- [ ] Fills the real `echo` recipe's form, clicks Run, asserts streamed
      output appears (the echoed message), and a terminal state is reached
- [ ] Cancel mid-run actually stops the stream client-side (assert no
      further UI updates after cancel — the server-side task-cancellation
      /tempdir-cleanup guarantee is already covered by Task 8's backend
      test, this is the client's own cancel button/affordance)

**Verification:**
- [ ] `cd frontend && bun run test:e2e` — new spec passes, stable across 3
      consecutive runs

**Dependencies:** Task 14

**Files likely touched:**
- `frontend/e2e/run-recipe.spec.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Integration complete
- [ ] `bun run build` succeeds; manual + E2E check against a live backend passes
- [ ] **Human review before sign-off**

---

## Phase 8: Sign-off (sequential)

### Task 16: Success-criteria sign-off pass

**Description:** Map each of `SPEC-execution.md`'s 7 numbered Success
Criteria to the test(s) that verify it, matching the precedent from every
prior module.

**Acceptance criteria:**
- [ ] A sign-off table (appended to `tasks/plan-execution.md`) lists all 7
      criteria against their verification, honestly noting any partial/
      carried-forward criterion
- [ ] `cd backend && uv run pytest && uv run ruff check .` clean;
      `execution/` ≥ 90% coverage
- [ ] `cd frontend && bun run {build,lint,typecheck,test,test:e2e}` all green

**Verification:**
- [ ] Full command suite above, run once at the end

**Dependencies:** Tasks 1-15

**Files likely touched:**
- `tasks/plan-execution.md` (sign-off table appended)

**Estimated scope:** Small: 1 file

---

## Checkpoint: Module complete (after Task 16)
- [ ] All 7 success criteria individually verified
- [ ] Full suite (backend + frontend) + lint + typecheck + build + E2E green
- [ ] **Human review before `trial-limits`/`workspace` begin consuming this module**
