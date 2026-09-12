# Implementation Plan: `trial-limits`

Spec: [docs/SPEC-trial-limits.md](../docs/SPEC-trial-limits.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Sixth module built, per the approved build order. Depends on `execution`
(done). Backend-only — no frontend surface of its own; `catalog`/`execution`
already render whatever `429` body this module produces.

## Overview

A FastAPI dependency, `gate_trial_run`, that `execution`'s
`POST /recipes/{slug}/run` calls after parsing the request and before the
executor starts. Decides BYOK-vs-keyless-trial per request (does `config`
already satisfy every required env key?), and for a keyless-trial candidate:
resolves a signed anonymous identity, checks two independent Upstash-Redis
daily counters (IP hash + cookie) plus a global daily spend kill-switch,
injects the author's own trial key for exactly the missing required key(s)
when granted, and raises `execution`'s own `429` shape when denied.

Built bottom-up, each piece independently testable before `gate.py` composes
them: cookie signing → identity → a thin Upstash REST client → counters →
budget → the `429` contract → the gate itself → wiring into `execution`'s
route → integration tests + CI log-grep → sign-off.

## Architecture Decisions

1. **`respx` mocks the Upstash REST client in every unit test below `gate.py`
   itself** — no live Redis dependency for the test suite. `test_gate.py`'s
   own endpoint-level tests may still use the same mocked client (via
   dependency override), never a real Upstash account. This mirrors
   `execution`'s own "never touch a real backend" testing posture for
   anything below the E2E layer (which this module has none of — it's
   backend-only).
2. **`time-machine` freezes/advances the clock for every day-boundary
   test** — counters.py/budget.py's UTC-day-suffixed keys are meaningless to
   test without controlling `datetime.now(UTC)` directly; real `sleep`-based
   day-boundary testing is a non-starter.
3. **`redis_client.py` is a thin wrapper over exactly three Upstash REST
   commands** (`INCR`, `INCRBY`, `EXPIRE`, `GET` — four, per the spec's own
   file list) — no generic Redis client, no connection pooling concerns
   (each call is a stateless HTTPS POST via `httpx.AsyncClient`, matching the
   spec's own reasoning for choosing the REST API over the binary protocol).
4. **`gate_trial_run` is a plain async function taking explicit arguments
   (`recipe`, `parsed_config`, `request`), not a FastAPI `Depends(...)`
   sub-dependency chain of its own** — matches the spec's own Code Style
   sample exactly. `execution`'s `api/run.py` wires it in via a direct
   `await gate_trial_run(...)` call (or `Depends`, whichever composes more
   simply with the existing endpoint — decided in Task 8 once the real
   integration point is examined) rather than this module guessing at
   FastAPI's dependency-injection shape for a value (`recipe`,
   `parsed_config`) that only exists after `execution`'s own
   `parse_run_request` has already run.
5. **This module never imports `skillet.recipe` directly** (per the spec's
   own Conventions line) — it receives `recipe.env` entries and the
   already-parsed `config` map as plain data from whatever calls it, keeping
   the dependency direction one-way (`execution` depends on `trial_limits`,
   never the reverse) and this module trivially unit-testable with hand-built
   fixtures instead of real `RecipeManifest`/`DiscoveredRecipe` objects.
6. **Wiring into `execution`'s real endpoint is a small, isolated diff to
   `api/run.py`** — insert one `await gate_trial_run(...)` call (and use its
   returned `config` in place of `parsed.config` from that point on) between
   `parse_run_request` and `run_event_stream`. `execution`'s own test suite
   (167 tests) must stay green throughout — `trial_limits` is additive, and
   its own no-op fallback (Confirmed Decision 11: no trial key configured →
   pass through unchanged) is exactly what keeps every existing `execution`
   test passing unmodified (none of them set `SKILLET_TRIAL_*_API_KEY`).
7. **App startup wires `request.app.state.trial_redis` and
   `request.app.state.cookie_secret`**, mirroring how `recipes_root` is
   already injected via `app.state` in `create_app()` — a `None`/absent
   `trial_redis` (no `UPSTASH_REDIS_REST_URL` configured) is a second,
   independent no-op signal alongside "no trial key configured", since a
   real deployment could have one without the other misconfigured; document
   which one `gate_trial_run` actually checks (the spec's own Confirmed
   Decision 11 only mentions the trial-key check — Redis being unconfigured
   while a trial key IS set is treated as a genuine misconfiguration, not a
   silent no-op, and surfaces as a clear startup-time or first-request error
   rather than quietly disabling gating).

## Task List

### Phase 1: Foundation — parallel batch
- Task 1 [PARALLEL — Track A]: `cookie.py` (sign/verify `sk_aid`)
- Task 2 [PARALLEL — Track B]: `redis_client.py` (thin Upstash REST wrapper) + `respx`/`time-machine` added as dev deps

### Checkpoint: Foundation
- `uv run pytest tests/trial_limits/test_cookie.py tests/trial_limits/test_redis_client.py`, `uv run ruff check .` clean

### Phase 2: Identity + counters + budget — parallel batch
- Task 3 [PARALLEL — Track A]: `identity.py` (`Identity.from_request`, ip hash + anon id) — depends on Task 1
- Task 4 [PARALLEL — Track B]: `counters.py` (per-identity daily counter, day-boundary reset) — depends on Task 2
- Task 5 [PARALLEL — Track C]: `budget.py` (global spend counter + kill-switch) — depends on Task 2

### Checkpoint: Identity + counters + budget
- Full `tests/trial_limits/` suite for these four files green; `time-machine` day-boundary tests pass

### Phase 3: The gate itself (sequential)
- Task 6: `author_key.py` (provider→env-var resolution, `any_trial_key_configured`)
- Task 7: `contract.py` (the two `429` bodies, exact shape `execution` defines)
- Task 8: `gate.py` (`gate_trial_run`, ties everything together) + app-startup wiring (`trial_redis`/`cookie_secret` on `app.state`)

### Checkpoint: Gate complete
- `test_gate.py`: BYOK bypass, partial-config injection, all 4 `429`/grant paths

### Phase 4: Wiring into `execution` + integration (sequential)
- Task 9: Wire `gate_trial_run` into `backend/src/skillet/api/run.py` — `execution`'s own 167 tests must stay green unmodified
- Task 10: `test_key_hygiene.py` (mirrors `execution`'s) + CI log-grep script + coverage check (≥ 90% on `trial_limits/`)

### Checkpoint: Module complete
- Full backend suite green (execution's 167 + trial_limits' new tests), ruff clean, ≥ 90% coverage on `trial_limits/`

### Phase 5: Sign-off
- Task 11: Success-criteria sign-off pass (7 criteria) appended to this plan

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A bug in the gate silently disables rate limiting (e.g. treats a misconfigured Redis as "no trial key" and passes every request through as BYOK) | Critical — unbounded API bill, the exact thing this module exists to prevent | Task 8's own test suite explicitly asserts the two no-op conditions (`any_trial_key_configured() is False`, `request.app.state.trial_redis is None`) are the ONLY paths that skip gating, and that a request WITH a trial key configured but a required key missing always hits Redis |
| Redis round-trip cost / latency added to every keyless-trial run | Medium (product latency, not correctness) | Explicitly out of scope for this plan — the spec accepts the Upstash REST round-trip as the tradeoff for atomic counters, no client-side caching layer attempted here |
| Global budget race between concurrent requests | Critical — the whole reason for pre-charging before the executor starts (Confirmed Decision 5) | `record_estimated_cost` is called and awaited before `run_event_stream` ever starts, verified by a test asserting the ordering, not just the individual functions' correctness |
| This module's own tests accidentally hit a real Upstash account | High — real cost, real external dependency in CI | `respx` mocks every HTTP call `redis_client.py` makes; a test that ever calls a real Upstash endpoint would need `UPSTASH_REDIS_REST_URL` set to something real, which the test suite must never require |

## Open Questions

Carried from the spec, not blocking for these tasks:
- Per-recipe cost estimation vs. a flat constant — spec leans flat constant for v1, decided (not attempted here).
- Admin override/reset for the kill-switch — out of scope for v1 per spec.
- Timezone (UTC) — decided, not revisited here.
- Forcibly cancelling an in-flight run when the kill-switch trips mid-stream — spec accepts "the budget is approximate and can overshoot slightly"; not attempted here.

## Success-criteria sign-off (Task 11)

Every numbered Success Criterion in `SPEC-trial-limits.md`, mapped to what
verifies it. Module complete: full backend suite green (265 passed),
`uv run ruff check .` clean, `trial_limits/` at 97% line coverage (≥ the
90% target). No criterion needed to carry forward as a partial — `execution`
(the one module this depends on) was already complete and its real route
was available to wire against directly in Task 9, the same reason
`execution`'s own sign-off had nothing to carry forward either.

| # | Criterion | Verified by |
|---|---|---|
| 1 | A fresh browser (no cookie) can run a recipe requiring a key it hasn't set, up to `SKILLET_TRIAL_DAILY_CAP` times in a UTC day, using the author's key server-side — proven end-to-end through `execution`'s route | `test_run_endpoint_wiring.py::test_granted_keyless_trial_run_uses_the_authors_key_and_sets_a_cookie` (a real recipe echoes back exactly the author's key it received) + `::test_third_keyless_request_same_day_is_denied_with_429` (two grants at `DAILY_TRIAL_CAP=2`, sharing one cookie jar like a real browser, then a real denial) |
| 2 | The next keyless request that day from the same identity gets exactly the `429` shape `execution` defines, with `scope: "trial_daily"`, `cta: "add_key"`, and a `retry_after_seconds` accurate to the next UTC midnight | Same test above for the shape/scope/cta; `test_contract.py`'s `seconds_until_next_utc_midnight` tests (exact boundary at midnight, one second before, at noon) for the accuracy claim independently |
| 3 | A request whose `config` already satisfies every required env key is never denied and never touches Redis, regardless of that identity's or the global budget's state — proven by a mock that fails the test if Redis is called | `test_gate.py::test_all_required_keys_present_is_pure_byok_no_redis_no_cookie` — a `FailingRedis` double whose every method raises `AssertionError` if called at all, exercised with the daily cap and budget both left in states that would deny a keyless request |
| 4 | Once the global daily budget is exhausted, every keyless-trial request — from any identity, including ones with zero prior runs — is denied with `scope: "global_budget"`, `cta: "clone_local"`, while BYOK requests continue to succeed | `test_gate.py::test_exhausted_global_budget_denies_with_global_budget_scope` + `test_run_endpoint_wiring.py::test_exhausted_global_budget_denies_before_any_recipe_code_runs` (a fresh identity, zero prior runs, still denied) + `::test_byok_request_bypasses_the_gate_entirely` (unaffected by the same exhausted-budget env) |
| 5 | A sentinel value in the author's trial-key env var never appears in a response, log line, or exception across the full test suite — enforced by a CI log-grep, mirroring `execution`'s key-hygiene guarantee | `test_key_hygiene.py` (3 tests: logs + client-visible error, a `429` body, and `author_key.resolve`'s own exception) + `scripts/check_trial_key_redaction.py`, verified against a real negative control (temporarily un-wiring `install_redacting_filter()` reproduced a real leak the script caught) |
| 6 | A cookie this module issues verifies correctly; a tampered or malformed cookie value is rejected and a fresh one is issued, never trusted as an existing identity | `test_cookie.py` (10 tests: round-trip recovery, tampered signature, missing separator, empty string, wrong secret) + `test_identity.py::test_tampered_cookie_is_treated_as_absent_and_a_fresh_one_is_issued` (the end-to-end "rejected → fresh one issued" behavior, not just `verify()` in isolation) |
| 7 | Both the per-identity counters and the global budget counter reset automatically at the UTC day boundary with no manual intervention (proven by a time-travelled test, not just documented behavior) | `test_counters.py` and `test_budget.py`'s `time_machine.travel(...)` tests — advancing the clock past UTC midnight and asserting a fresh key starts at the base count/zero spend, regardless of the previous day's now-irrelevant key |
