# Tasks: `trial-limits`

Plan: [tasks/plan-trial-limits.md](plan-trial-limits.md). Spec: [docs/SPEC-trial-limits.md](../docs/SPEC-trial-limits.md).

---

## Phase 1: Foundation — parallel batch

### Task 1 [PARALLEL — Track A]: `trial_limits/cookie.py`

**Description:** Sign and verify the `sk_aid` anonymous-id cookie.

**Acceptance criteria:**
- [x] `issue(secret: bytes) -> str`: a fresh opaque random id (`secrets.token_urlsafe(16)`) HMAC-SHA256-signed with `secret`, returned as `"{anon_id}.{sig}"`
- [x] `verify(cookie_value: str, secret: bytes) -> str | None`: returns the recovered `anon_id` for a value this module issued; returns `None` (never raises) for a missing separator, a tampered signature, or an empty string
- [x] Uses `hmac.compare_digest` for signature comparison (timing-safe)
- [x] `COOKIE_NAME = "sk_aid"`, `COOKIE_MAX_AGE` = 1 year, matching the spec's own constants

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_cookie.py`
- [x] `uv run ruff check .`

**Dependencies:** None

**Files likely touched:**
- `backend/src/skillet/trial_limits/__init__.py`
- `backend/src/skillet/trial_limits/cookie.py`
- `backend/tests/trial_limits/__init__.py`
- `backend/tests/trial_limits/test_cookie.py`

**Estimated scope:** Small: 1-2 files

---

### Task 2 [PARALLEL — Track B]: `trial_limits/redis_client.py`

**Description:** A thin async wrapper over Upstash Redis's REST API, exposing exactly the four commands this module needs.

**Acceptance criteria:**
- [x] `UpstashRedis(base_url: str, token: str)` — constructed once at app startup, held on `app.state.trial_redis`
- [x] `async def incr(key: str) -> int`, `async def incrby(key: str, amount: int) -> int`, `async def expire(key: str, seconds: int) -> None`, `async def get(key: str) -> str | None` — each a single HTTPS call via `httpx.AsyncClient`, using Upstash's REST command format (verify the real request/response shape from Upstash's own REST API docs rather than guessing — e.g. `GET {base_url}/incr/{key}` with `Authorization: Bearer {token}`, response `{"result": <int>}`)
- [x] `respx` (added as a dev dependency) mocks every HTTP call in tests — no live Upstash account touched
- [x] A non-2xx response or malformed JSON body raises a clear, typed exception (not a bare `KeyError`/`json.JSONDecodeError` leaking out)

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_redis_client.py`
- [x] `uv run ruff check .`

**Dependencies:** None

**Files likely touched:**
- `backend/src/skillet/trial_limits/redis_client.py`
- `backend/tests/trial_limits/test_redis_client.py`
- `backend/pyproject.toml` (`respx`, `time-machine` dev deps)

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Foundation (after Tasks 1-2)
- [x] Each track's tests pass (191 backend tests total); no conflicts; `uv run ruff check .` clean
- [x] Per the standing "just proceed" instruction, proceeding directly to Phase 2

---

## Phase 2: Identity + counters + budget — parallel batch

### Task 3 [PARALLEL — Track A]: `trial_limits/identity.py`

**Description:** Derives the rate-limit identity (IP hash + anonymous cookie id) from a request, issuing a fresh cookie when absent/invalid.

**Acceptance criteria:**
- [x] `Identity(ip_hash: str, anon_id: str)` — `ip_hash = sha256(request.client.host)` (hex digest); `anon_id` from `cookie.verify(...)` on the existing `sk_aid` cookie, or a freshly `cookie.issue(...)`-ed one when absent/invalid
- [x] `Identity.from_request(request: Request, secret: bytes) -> Identity` — the one constructor; also returns (or otherwise makes available to the caller) whether a NEW cookie needs to be set on the response, and its value — document the exact mechanism chosen (e.g. a second return value, an attribute, or setting it directly via a response object passed in) since `gate_trial_run`/the endpoint needs to actually call `Set-Cookie` on a fresh identity
- [x] The issued cookie's attributes match the spec exactly: `httpOnly`, `Secure`, `SameSite=Lax`, ~1-year `Max-Age`

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_identity.py`
- [x] `uv run ruff check .`

**Dependencies:** Task 1

**Files likely touched:**
- `backend/src/skillet/trial_limits/identity.py`
- `backend/tests/trial_limits/test_identity.py`

**Estimated scope:** Small: 1-2 files

---

### Task 4 [PARALLEL — Track B]: `trial_limits/counters.py`

**Description:** Per-identity daily trial-run counters (IP-hash-keyed and cookie-keyed, both independently capped), UTC-day-suffixed, self-expiring.

**Acceptance criteria:**
- [x] `_day_key(scope: str, ident: str) -> str` → `f"trial:count:{scope}:{ident}:{YYYYMMDD}"` (UTC)
- [x] `increment_and_check(redis, identity) -> bool` — bumps BOTH the `ip` and `cookie` scoped counters unconditionally (a denied attempt still counts — the "casual limiting" design, asserted explicitly in a test so it can't be "fixed" by accident later), returns `True` only if both are `<= DAILY_TRIAL_CAP` after incrementing
- [x] `EXPIRE` is set to `COUNTER_TTL_SECONDS` (~25h) only on the increment that returns `1` (that key's first write of the day) — verified directly (a mock asserting `expire` is called exactly once across repeated increments within the same day)
- [x] `time-machine` test: advancing the clock past UTC midnight and incrementing again starts a fresh count at `1` on the new day's key, regardless of the old key's remaining TTL
- [x] `DAILY_TRIAL_CAP` reads `SKILLET_TRIAL_DAILY_CAP` env var, default `2`

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_counters.py`
- [x] `uv run ruff check .`

**Dependencies:** Task 2

**Files likely touched:**
- `backend/src/skillet/trial_limits/counters.py`
- `backend/tests/trial_limits/test_counters.py`

**Estimated scope:** Small: 1-2 files

---

### Task 5 [PARALLEL — Track C]: `trial_limits/budget.py`

**Description:** The global daily spend counter and kill-switch.

**Acceptance criteria:**
- [x] `_budget_key() -> str` → `f"trial:budget:{YYYYMMDD}"` (UTC)
- [x] `is_exhausted(redis) -> bool` — `True` when the current day's spend `>= DAILY_BUDGET_MICROS`
- [x] `record_estimated_cost(redis, amount_micros=ESTIMATED_COST_MICROS_PER_RUN) -> None` — `INCRBY`s the budget key, sets `EXPIRE` only when this call created the key (the returned total equals `amount_micros`)
- [x] `time-machine` test: the budget key resets at the UTC day boundary same as the per-identity counters
- [x] `DAILY_BUDGET_MICROS` reads `SKILLET_TRIAL_DAILY_BUDGET_USD` (default `5.00`, converted to micros)

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_budget.py`
- [x] `uv run ruff check .`

**Dependencies:** Task 2

**Files likely touched:**
- `backend/src/skillet/trial_limits/budget.py`
- `backend/tests/trial_limits/test_budget.py`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Identity + counters + budget (after Tasks 3-5)
- [x] Each track's tests pass (221 total, 96% coverage on `trial_limits/`); no conflicts; `uv run ruff check .` clean
- [x] Per the standing "just proceed" instruction, proceeding directly to Phase 3

---

## Phase 3: The gate itself (sequential)

### Task 6: `trial_limits/author_key.py`

**Description:** Provider → author trial-key env-var resolution.

**Acceptance criteria:**
- [x] `TRIAL_KEY_ENV: dict[str, str]` — `{"openai": "SKILLET_TRIAL_OPENAI_API_KEY"}`, a one-line addition point for a second provider
- [x] `resolve(provider: str) -> str` — raises `TrialUnavailable` (not a bare `KeyError`) when the provider is unknown or its env var is unset/empty
- [x] `any_trial_key_configured() -> bool` — `True` iff at least one `TRIAL_KEY_ENV` value has a non-empty env var set

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_author_key.py`
- [x] `uv run ruff check .`

**Dependencies:** None

**Files likely touched:**
- `backend/src/skillet/trial_limits/author_key.py`
- `backend/tests/trial_limits/test_author_key.py`

**Estimated scope:** Small: 1 file

---

### Task 7: `trial_limits/contract.py`

**Description:** Builds the two `429` bodies this module can produce, in the exact shape `execution`'s `RateLimitPayload` (frontend) / `docs/SPEC-execution.md`'s `429` contract expects.

**Acceptance criteria:**
- [x] `trial_daily_error(retry_after_seconds: int) -> ...` → `{"error": "rate_limited", "scope": "trial_daily", "message": ..., "retry_after_seconds": ..., "cta": "add_key"}`
- [x] `global_budget_error(retry_after_seconds: int) -> ...` → same shape, `"scope": "global_budget"`, `"cta": "clone_local"`
- [x] `retry_after_seconds` for both = seconds remaining until the next UTC midnight, computed once, consistently (a small shared helper, not duplicated math)
- [x] The returned shape matches `frontend/lib/execution/rate-limit.ts`'s `RateLimitPayload` zod schema field-for-field — cross-checked directly against that file, not re-derived from memory of the spec text alone
- [x] `message` text is real, user-facing copy (not a placeholder) for each scope, matching Confirmed Decision 9's guidance

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_contract.py`
- [x] `uv run ruff check .`

**Dependencies:** None

**Files likely touched:**
- `backend/src/skillet/trial_limits/contract.py`
- `backend/tests/trial_limits/test_contract.py`

**Estimated scope:** Small: 1 file

---

### Task 8: `trial_limits/gate.py` + app-startup wiring

**Description:** `gate_trial_run`, the FastAPI dependency that ties everything together, per the spec's own Code Style sample — plus wiring `app.state.trial_redis`/`app.state.cookie_secret` into `create_app()`.

**Acceptance criteria:**
- [x] `gate_trial_run(recipe, parsed_config, request) -> TrialDecision` (`TrialDecision.config: dict[str, str]`) matching the spec's own sample function shape
- [x] All required keys present in `parsed_config` → pure BYOK, `TrialDecision(config=parsed_config)` unchanged, **no Redis call, no cookie check** (verified by a mock that fails the test if Redis is called)
- [x] `any_trial_key_configured()` is `False` → no-op, pass through unchanged (Confirmed Decision 11) — no Redis call, no cookie issued
- [x] Otherwise: budget check first (raise `429` global_budget if exhausted) → identity resolution → counters check (raise `429` trial_daily if either counter is over cap) → author-key injection for exactly the missing required key(s), client-supplied values untouched → `record_estimated_cost` **before** returning the grant
- [x] `TrialUnavailable` during injection (a provider with no configured key, even though `any_trial_key_configured()` was true for a DIFFERENT provider) → `429` global_budget, not an unhandled exception
- [x] `create_app()` builds `UpstashRedis` from `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` env vars (or leaves `app.state.trial_redis = None` if unset — documented as a distinct, non-silent misconfiguration path per the plan's Architecture Decision 7, not conflated with "no trial key configured") and `app.state.cookie_secret` from `SKILLET_TRIAL_COOKIE_SECRET`

**Verification:**
- [x] Tests pass: `cd backend && uv run pytest tests/trial_limits/test_gate.py`
- [x] `uv run ruff check .`

**Dependencies:** Tasks 3, 4, 5, 6, 7

**Files likely touched:**
- `backend/src/skillet/trial_limits/gate.py`
- `backend/src/skillet/api/app.py` (state wiring only — not yet calling `gate_trial_run` from the route; that's Task 9)
- `backend/tests/trial_limits/test_gate.py`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Gate complete (after Tasks 6-8)
- [ ] `test_gate.py` covers BYOK bypass, partial-config injection (only missing required keys filled, client-supplied values untouched), all 4 429/grant paths, the no-trial-key no-op, and the Redis-unconfigured case
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 4

---

## Phase 4: Wiring into `execution` + integration (sequential)

### Task 9: Wire `gate_trial_run` into `backend/src/skillet/api/run.py`

**Description:** The real integration point — `execution`'s route calls `gate_trial_run` after `parse_run_request`, before `run_event_stream`.

**Acceptance criteria:**
- [ ] `run_recipe` calls `gate_trial_run(recipe.manifest, parsed.config, request)` (or the closest equivalent given `parsed`'s real shape — adjust to `ParsedRunRequest`'s actual fields) between parsing and streaming, using the returned `TrialDecision.config` in place of `parsed.config` from that point on (i.e. build a new `ParsedRunRequest`-equivalent, or pass the resolved config directly into `run_event_stream` — whichever keeps `stream.py` untouched, since it already takes `parsed.config` generically)
- [ ] A denied request's `429` is raised (and any `Set-Cookie` from a freshly-issued identity is still attached to that response) before `run_event_stream`/`execute()` ever runs
- [ ] A granted request's response still sets `Set-Cookie` for a freshly-issued anonymous id (a BYOK request may still be a first-time visitor and should still get a cookie issued, if this module's own `Identity.from_request` is even reached for it — confirm and document whether BYOK requests reach identity resolution at all, since Confirmed Decision 2 says BYOK skips "every check in this module" including presumably the cookie; a first-time BYOK visitor may simply never get `sk_aid` until their first keyless-trial-eligible run — document this as the real, spec-consistent behavior rather than silently adding cookie issuance to the BYOK path)
- [ ] `execution`'s own existing 167 tests all pass unmodified (no `SKILLET_TRIAL_*` env vars set in that test environment → `gate_trial_run` is a no-op for all of them)

**Verification:**
- [ ] `cd backend && uv run pytest` — full suite (execution's 167 + trial_limits' new tests) green
- [ ] `uv run ruff check .`
- [ ] Manual: a real request with `SKILLET_TRIAL_OPENAI_API_KEY` set and a recipe missing that key gets a real trial-granted run; the same identity's 3rd request that day (with `SKILLET_TRIAL_DAILY_CAP=2`) gets a real `429`

**Dependencies:** Task 8

**Files likely touched:**
- `backend/src/skillet/api/run.py`
- `backend/tests/execution/test_run_endpoint.py` (only if wiring changes what an existing test observes — avoid otherwise)
- `backend/tests/trial_limits/test_gate.py` (extended with real endpoint-level cases, per the spec's own Testing Strategy)

**Estimated scope:** Medium: 3-5 files

---

### Task 10: Key hygiene + CI log-grep + coverage

**Description:** Mirrors `execution`'s own key-hygiene test and CI script, for the author's trial key.

**Acceptance criteria:**
- [ ] `test_key_hygiene.py`: a sentinel value in `SKILLET_TRIAL_OPENAI_API_KEY` never appears in a `429` body, any log line emitted during gating, or any exception raised by `author_key.resolve` — across a real granted-run request through the full endpoint (reusing `execution`'s own `RedactingFilter`/`redaction_context`, per Confirmed Decision 8 — no new redaction mechanism)
- [ ] A CI log-grep script (`backend/scripts/check_trial_key_redaction.py` or extending `execution`'s own `check_log_redaction.py` — your call, document it) fails the build if the sentinel appears anywhere in captured output, verified against a real negative control the same way `execution`'s own script was
- [ ] `trial_limits/` package reaches ≥ 90% line coverage

**Verification:**
- [ ] `cd backend && uv run pytest --cov=skillet.trial_limits --cov-report=term-missing`
- [ ] `uv run ruff check .`

**Dependencies:** Task 9

**Files likely touched:**
- `backend/tests/trial_limits/test_key_hygiene.py`
- `backend/scripts/check_trial_key_redaction.py` (or extended existing script)

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Module complete (after Tasks 1-10)
- [ ] Full backend suite green, ruff clean, `trial_limits/` ≥ 90% coverage
- [ ] Per the standing "just proceed" instruction, proceeding directly to Phase 5

---

## Phase 5: Sign-off

### Task 11: Success-criteria sign-off pass

**Description:** Map each of `SPEC-trial-limits.md`'s 7 numbered Success Criteria to the test(s) that verify it, matching the precedent from every prior module.

**Acceptance criteria:**
- [ ] A sign-off table (appended to `tasks/plan-trial-limits.md`) lists all 7 criteria against their verification, honestly noting any partial/carried-forward criterion
- [ ] `cd backend && uv run pytest && uv run ruff check .` clean; `trial_limits/` ≥ 90% coverage

**Verification:**
- [ ] Full command suite above, run once at the end

**Dependencies:** Tasks 1-10

**Files likely touched:**
- `tasks/plan-trial-limits.md` (sign-off table appended)

**Estimated scope:** Small: 1 file

---

## Checkpoint: Module complete (after Task 11)
- [ ] All 7 success criteria individually verified
- [ ] Full backend suite + ruff + coverage green
- [ ] Per the standing "just proceed" instruction, `trial-limits` is complete; `distribution` may now begin consuming it (alongside `workspace`), per the approved build order
