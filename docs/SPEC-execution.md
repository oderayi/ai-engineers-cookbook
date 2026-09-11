# Spec: execution

Module id: `execution` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-11**.
Depends on: `recipe-framework`, `settings`.

## Objective

Turn a filled run form into a live, streamed recipe execution — the backend run
endpoint, the BYOK key path, and the frontend client + renderer for the event
stream.

- **What:** `POST /recipes/{slug}/run` (params + resolved config + uploaded files
  in, `text/event-stream` of `recipe-framework` events out); the `useRecipeRun`
  client hook (POST + SSE parse + cancel); and `<RunOutput>` — the renderer for
  `step / token / tool_call / log / artifact / result / error`.
- **Why:** "run it live" is the payoff of the whole product. It has to feel
  immediate (streamed, not spinner), safe (keys never touch disk or logs), and
  honest (every failure mode shown clearly).
- **User:** the learner pressing Run. `catalog` mounts `<RunOutput>` below the
  form; `workspace` keeps a run alive per tab; `trial-limits` wraps the endpoint.
- **Success:** a recipe runs end-to-end with streamed output; a grep of server
  logs and stored state after a run finds no key material; cancelling stops the
  backend task; every error type renders distinctly.

## Scope

**In:** the run endpoint (multipart request, `EventSourceResponse` stream,
disconnect → cancel); request validation (re-validate params against the recipe's
`Params`; accept `config` keys only for declared `env`; enforce upload caps);
wiring `recipe-framework`'s executor (timeout, output-size cap, event-count cap);
key hygiene (request-scoped only, log-redaction filter, no persistence); the
`useRecipeRun` hook (targets `settings.customBackendUrl` or the default backend,
`AbortController` cancel, reconnect policy = none for v1); `<RunOutput>` and its
sub-renderers (step timeline, token pane, tool-call cards, log stream, artifact
renderers for `json | table | markdown | file`, result block, error banner);
recorded-event fixtures for building the renderer without a backend.

**Out:** rate limiting, the keyless trial key, the spend kill-switch
(`trial-limits` — this module defines the `429` contract it emits and renders it);
the `Params` schema and the executor internals (`recipe-framework`); config
resolution (`settings` — the client sends an already-resolved `config` map, the
server never recomputes it); the run form and the Run button's enabled state
(`catalog`); per-tab run lifecycle and history (`workspace`); progress marks
(`workspace`).

## Confirmed decisions

1. **Single streaming POST**, not create-then-poll. `POST /recipes/{slug}/run`
   with a `multipart/form-data` body; the response is `text/event-stream`.
   `EventSource` can't POST, so the client uses `fetch` + a `ReadableStream`
   reader. Keys are in the body — never a query string, path, or `GET` header.
2. **The server never computes config.** The client resolves it via `settings`'
   `resolveConfig` and sends `config: Record<envKey, string>`. The server accepts
   a key only if it is in that recipe's declared `env`; anything else → `422`.
3. **Keys are request-scoped only.** Held in the `ResolvedConfig` passed to
   `ctx.config`, never written to disk, DB, cache, or logs. A logging filter
   redacts any value that was in `config` (and anything matching common key
   shapes) from every log record. Verified by a test + a CI log-grep.
4. **Uploads:** `multipart` file parts, matched to declared file `Params` fields.
   Caps (defaults, overridable by `trial-limits` for the hosted deployment):
   per-file ≤ 5 MB, total ≤ 20 MB, ≤ 10 files, allowed extensions from the
   field's `accept`. Over cap → `413` before any recipe code runs. File bytes
   live in a per-run temp area, deleted in a `finally`.
5. **Limits enforced here via the executor:** wall-clock 90 s, event payload
   total ≤ 256 KB, event count ≤ 2000. Breach → a single terminal `error`
   (`error_type` = `timeout` | `output_limit`) and the task is cancelled.
6. **Client disconnect cancels the run.** `AbortController` on the client →
   `sse-starlette` detects the drop → the `asyncio` task is cancelled →
   `finally` cleans up temp files. No reconnect/resume in v1.
7. **`<RunOutput>` owns event rendering** because this module owns the event
   schema. `catalog` and `workspace` mount it; they do not parse events.
8. Built against **recorded-event fixtures** (`.jsonl` per scenario: happy path,
   token stream, tool calls, each error type) before the backend endpoint exists.

## `429` contract (emitted by `trial-limits`, rendered here)

```json
{
  "error": "rate_limited",
  "scope": "trial_daily" | "global_budget",
  "message": "You've used your 2 free runs today.",
  "retry_after_seconds": 34567,
  "cta": "add_key" | "clone_local"
}
```

`<RunOutput>` renders this as the "add your own key / clone locally" nudge, not a
generic error. `trial-limits` owns the values; `execution` owns the shape and the
UI.

## Tech Stack

- Backend: FastAPI, `sse-starlette` (`EventSourceResponse`), `python-multipart`,
  Pydantic v2. Reuses `recipe-framework`'s executor.
- Frontend: `fetch` streaming + a small SSE line parser (no `EventSource`);
  `@tanstack/react-query` is *not* used for the stream (it's not request/response);
  `zod` to parse each event against the shared schema.
- Renderers: `shiki` (already a dep) for code in artifacts; `react-markdown` for
  `markdown` artifacts; a minimal JSON tree component; a plain table component.
- Tests: `pytest` + `httpx` streaming client (backend); Vitest + Testing Library
  with fixture streams (frontend); one Playwright end-to-end against a real echo
  recipe.

## Commands

Backend inherits `recipe-framework`'s (`uv run ...`). Frontend inherits
`app-shell`'s (`bun ...`).

## Project Structure

```
backend/src/skillet/
  api/
    run.py                    # POST /recipes/{slug}/run
  execution/
    request.py                # RunRequest parse: params + config + files, all caps
    keys.py                   # request-scoped config, log-redaction filter
    stream.py                 # executor events -> EventSourceResponse
  tests/execution/
    test_run_endpoint.py
    test_key_hygiene.py       # + CI step: grep logs for key material
    test_upload_caps.py
    test_cancel.py

frontend/
  lib/execution/
    run-client.ts             # postRun(slug, payload, signal) -> AsyncIterable<Event>
    sse.ts                    # streaming line parser
    events.ts                 # zod schema for the 7 event types (shared contract)
  hooks/
    use-recipe-run.ts         # { start, cancel, status, events, result, error }
  components/execution/
    run-output.tsx            # orchestrates the sub-renderers + status
    step-timeline.tsx
    token-pane.tsx
    tool-call-card.tsx
    log-stream.tsx
    artifact/{json-tree,data-table,markdown,file-download}.tsx
    rate-limit-notice.tsx     # renders the 429 contract
    run-error.tsx
  tests/execution/
    fixtures/*.jsonl
```

## Code Style

```python
# backend/src/skillet/api/run.py
@router.post("/recipes/{slug}/run")
async def run_recipe(slug: str, request: Request) -> EventSourceResponse:
    recipe = registry.get(slug) or _404(slug)
    parsed = await parse_run_request(request, recipe)   # 404/422/413 raised here
    async def events() -> AsyncIterator[ServerSentEvent]:
        async with per_run_tempdir(parsed.files) as files:
            ctx = RecipeContext(
                config=ResolvedConfig(parsed.config),   # request-scoped, never logged
                files=files,
                emit=Emitter(),
            )
            async for event in execute(recipe, parsed.params, ctx,
                                       timeout_s=90, max_bytes=256_000, max_events=2000):
                yield ServerSentEvent(data=event.model_dump_json())
    return EventSourceResponse(events())   # disconnect -> generator closed -> task cancelled
```

```ts
// frontend/hooks/use-recipe-run.ts
export function useRecipeRun(slug: string) {
  const backend = useBackendBaseUrl();            // settings.customBackendUrl || default
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const ctrl = useRef<AbortController>();

  const start = useCallback(async (payload: RunPayload) => {
    ctrl.current = new AbortController();
    dispatch({ t: "start" });
    try {
      for await (const ev of postRun(backend, slug, payload, ctrl.current.signal)) {
        dispatch({ t: "event", ev });             // ev already zod-parsed
      }
    } catch (e) {
      dispatch({ t: "transport-error", e });      // network / 4xx / 5xx / 429
    }
  }, [backend, slug]);

  const cancel = useCallback(() => ctrl.current?.abort(), []);
  return { ...selectors(state), start, cancel };
}
```

Conventions: backend follows `recipe-framework` (ruff, async, typed); frontend
follows `app-shell` (tokens, `kebab-case.tsx`, `"use client"` only on the hook +
renderers).

## Testing Strategy

- **Key hygiene (the important one):** run a recipe with a sentinel key value;
  assert it appears in neither the server logs, nor any file under the run
  tempdir after completion, nor any exception message surfaced to the client. A
  CI step greps the captured log output for the sentinel and fails on a hit.
- **Endpoint contract:** unknown slug → `404`; params failing `Params` → `422`
  with field errors; a `config` key not in the recipe's `env` → `422`; upload
  over any cap → `413`; all before any recipe code runs.
- **Streaming:** events arrive incrementally (assert first byte well before the
  recipe finishes); order preserved; exactly one terminal `result` or `error`;
  `Content-Type: text/event-stream`.
- **Cancel:** client aborts mid-run → server task receives `CancelledError` →
  tempdir removed (assert directory gone); no further events written.
- **Limits:** a recipe that sleeps 100 s → single `error` `timeout` at ~90 s; a
  recipe that emits 5000 events → `error` `output_limit`, task stopped.
- **Renderer (fixture streams):** each `.jsonl` fixture drives `<RunOutput>`;
  snapshot the timeline, token accumulation, expandable tool-call cards, each
  artifact kind, the result block, each `error_type` banner, and the `429`
  notice with its CTA.
- **Offline / transport:** network error and 5xx render `<RunError>` with a retry
  affordance; `429` renders `<RateLimitNotice>`, never `<RunError>`.
- Backend coverage: `execution/` ≥ 90%.

## Boundaries

**Always**
- Keep keys in request scope only; run every log line through the redaction
  filter; delete uploaded bytes in a `finally`.
- Re-validate params against `Params` server-side even though the client already
  did (defense in depth).
- Stream — first event out as soon as the recipe emits it; never buffer the whole
  run.
- Cancel the backend task when the client disconnects.
- Parse every event with the shared `zod` schema before rendering.

**Ask first**
- Changing the run request or `429` contract (touches `catalog`, `workspace`,
  `trial-limits`).
- Raising any upload or execution cap.
- Adding create-then-poll / resumable streams (a real design shift).
- Any new outbound host the backend contacts.

**Never**
- Put a key in a URL, query string, `GET`, log, metric, span, or error message.
- Persist keys or uploaded content past the run (no disk, DB, cache).
- Recompute or fetch config server-side — the client sends the resolved map.
- Accept a `config` key or a file field the recipe did not declare.
- Render event bytes as HTML (artifacts are data; escape/highlight only).
- Let `catalog` or `workspace` parse the event stream themselves.

## Success Criteria

1. A bundled recipe runs end-to-end: `POST /run` streams `step` → `token`* →
   `result`, rendered live by `<RunOutput>`.
2. Post-run, a sentinel key value is absent from all logs, the (now-deleted) run
   tempdir, and any client-visible error — enforced by test + CI log-grep.
3. `404` / `422` (bad params, undeclared `config` key) / `413` (upload caps) are
   returned before recipe code executes.
4. Client cancel stops the server task within ~1 s and removes the run tempdir.
5. Timeout and output-limit each produce exactly one terminal `error` event with
   the right `error_type`; the task is stopped.
6. Every event type and every `error_type`, plus the `429` rate-limit notice,
   render distinctly from fixtures with no backend running.
7. The client targets `settings.customBackendUrl` when set, the default backend
   otherwise.

## Open Questions

1. **Outbound egress control (hosted).** Recipes call LLM providers. Should the
   hosted backend restrict egress to an allowlist of provider hosts to blunt a
   recipe that (via a future URL param or a dependency) makes arbitrary requests?
   Render free makes true network policy hard. Leaning: no URL params in v1
   recipes (manifest doesn't allow them) + document the risk; revisit with
   `trial-limits`.
2. **Partial-failure UX.** If `token` streaming starts and then the upstream LLM
   errors, do we keep the partial output visible above the error banner? Leaning:
   yes, keep partial output.
3. **Artifact size.** A `file` artifact or a large `table` — inline in the event
   (counts against the 256 KB cap) or a short-lived `GET /runs/{id}/artifacts/{id}`?
   Leaning: inline + truncate for v1; endpoint later.
4. **`tool_call` result truncation** (mirrors `recipe-framework` OQ 5) — a single
   rule (e.g. 8 KB per result, elided with a note) applied in the `Emitter`.
5. **Multi-run per tab.** Can a learner start a second run while one streams in
   the same tab (cancel-and-restart vs. queue vs. block)? Coordinate with
   `workspace`. Leaning: cancel-and-restart.
