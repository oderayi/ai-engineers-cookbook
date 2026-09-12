# Tasks: `settings`

Plan: [tasks/plan-settings.md](plan-settings.md). Spec: [docs/SPEC-settings.md](../docs/SPEC-settings.md).

---

## Phase 0: Foundation (sequential)

### Task 0: `lib/settings/types.ts` + `lib/settings/schema.ts`

**Description:** The `RecipeEnvDecl` type (a local, minimal stand-in for
catalog's future richer `EnvVar` — see the plan's Architecture Decisions) and
the `SettingsV1` Zod schema exactly as specified.

**Acceptance criteria:**
- [ ] `RecipeEnvDecl` exported with `{ key: string; provider: string; required: boolean; description: string }`
- [ ] `settingsV1Schema` matches the spec's Code Style sample exactly: `version`
      (literal `1`), `global` (record of env-key → string), `customBackendUrl`
      (validated absolute http(s) URL, normalized, empty string allowed),
      `overrides` (record of slug → record of env-key → string)
- [ ] `CURRENT_VERSION = 1 as const` exported
- [ ] A `customBackendUrl` with a trailing slash is normalized (slash stripped)
      on parse; a non-http(s) URL is rejected; an empty string is accepted

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test settings/schema`
- [ ] `bun run typecheck`

**Dependencies:** None

**Files likely touched:**
- `frontend/lib/settings/types.ts`
- `frontend/lib/settings/schema.ts`
- `frontend/tests/settings/schema.test.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Foundation (after Task 0)
- [ ] `bun run typecheck` clean
- [ ] **Human review before the parallel batch**

---

## Phase 1: Parallel batch — 4 independent tracks

*Dispatched to subagents concurrently. Each touches a disjoint file set and
depends only on Task 0. Write tests first (TDD).*

### Task 1 [PARALLEL — Track A]: `resolve.ts` — the merge policy

**Description:** `resolveConfig(recipe, global, overrides)` exactly as
specified — the single most important function in this module, since
`catalog` and `execution` both consume its output shape.

**Acceptance criteria:**
- [x] Matches the spec's Code Style sample: `FieldSource = "override" | "global" | "unset"`,
      `ResolvedField { key, value, source, required }`,
      `ResolvedConfig { config, fields, missingRequired }`
- [x] Merge table, every case: override present → `"override"`; only global set
      → `"global"`; neither → `"unset"` and absent from `config`;
      whitespace-only override falls through to global; whitespace-only global
      falls through to unset; an override for an undeclared key never appears
      in `config`/`fields` (the function only ever iterates `recipe.env`, so
      this is true by construction — test it anyway); `missingRequired` lists
      exactly the declared-required keys that resolved to nothing; a recipe
      with empty `env` resolves to `{config: {}, fields: [], missingRequired: []}`
      with no error

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test settings/resolve`
- [ ] `bun run typecheck && bun run lint`
- [ ] Coverage: this file needs to reach ≥95% line coverage eventually (Task 13
      checks the final number) — write tests accordingly now rather than
      backfilling later

**Dependencies:** Task 0

**Files likely touched:**
- `frontend/lib/settings/resolve.ts`
- `frontend/tests/settings/resolve.test.ts`

**Estimated scope:** Small: 1-2 files

---

### Task 2 [PARALLEL — Track B]: `storage.ts` + `migrations.ts`

**Description:** The versioned `localStorage` blob's read/write/clear layer
and its forward-only migration runner.

**Acceptance criteria:**
- [x] `storage.ts`: `STORAGE_KEY = "skillet.settings"`; `read()` parses via
      the Zod schema (running migrations first — see below), `write(settings)`,
      `clear()`. Malformed JSON, a schema-invalid blob, or a `version` newer
      than `CURRENT_VERSION` all fall back to `emptySettings()`-shaped defaults
      without throwing (reconciled at integration to import the real
      `emptySettings()` from Task 4's `defaults.ts` instead of the inline stub)
- [x] `migrations.ts`: `migrate(raw: unknown): SettingsV1`. An unversioned/
      legacy blob upgrades to `CURRENT_VERSION` with values preserved; each
      migration step is a pure function, independently tested
- [x] A fully-populated `SettingsV1` survives a write→read round-trip
      byte-for-byte (after `customBackendUrl` normalization)
- [x] Unknown top-level fields in a stored blob are stripped, not preserved

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test settings/storage settings/migrations`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 0

**Files likely touched:**
- `frontend/lib/settings/storage.ts`
- `frontend/lib/settings/migrations.ts`
- `frontend/tests/settings/storage.test.ts`
- `frontend/tests/settings/migrations.test.ts`

**Estimated scope:** Medium: 3-5 files

---

### Task 3 [PARALLEL — Track C]: `use-local-storage.ts`

**Description:** The generic, SSR-safe, cross-tab-synced `localStorage`
primitive from the spec's Code Style sample — genuinely generic, not
settings-specific (any future module needing a typed `localStorage` slot can
reuse this, per `workspace`'s spec explicitly saying to reuse it rather than
fork one).

**Acceptance criteria:**
- [x] Matches the spec's signature: `useLocalStorage<T>(key, fallback, parse)
      -> readonly [T, setter, clear]`
- [x] SSR-safe — **implemented via `useSyncExternalStore`, not the literal
      "fallback-then-effect" two-render sample in the spec**: `getServerSnapshot`
      returns `fallback` for the server render, `getSnapshot` reads the real
      value on the client, so hydration needs no separate effect-driven second
      render and no `react-hooks/set-state-in-effect` suppression. Matches the
      pattern already established by `use-local-storage-boolean.ts` and
      `theme-toggle.tsx`. No `window` access during render either way.
- [x] A `localStorage.getItem`/`setItem` throwing (private mode, quota) is
      caught — state still updates in-memory for the session, no crash
- [x] Cross-tab: a `storage` event for the same key updates the hook's value;
      a `storage` event for a different key is ignored

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test use-local-storage`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** None (generic — doesn't even need Task 0)

**Files likely touched:**
- `frontend/hooks/use-local-storage.ts`
- `frontend/tests/hooks/use-local-storage.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 4 [PARALLEL — Track D]: `defaults.ts` + `providers.ts`

**Description:** `emptySettings()` (the canonical empty/default `SettingsV1`
object) and the env-key → provider display metadata (label, docs URL) map.

**Acceptance criteria:**
- [x] `emptySettings(): SettingsV1` returns `{ version: CURRENT_VERSION, global: {}, customBackendUrl: "", overrides: {} }`
- [x] `providers.ts` exports a `Record<string, { label: string; docsUrl?: string }>`
      seeded with at least `OPENAI_API_KEY` (per the spec's Open Question 6
      leaning — "OpenAI at minimum")
- [x] Both are pure data/functions with no DOM or `localStorage` access

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test settings/defaults settings/providers`
- [ ] `bun run typecheck`

**Dependencies:** Task 0

**Files likely touched:**
- `frontend/lib/settings/defaults.ts`
- `frontend/lib/settings/providers.ts`
- `frontend/tests/settings/defaults.test.ts`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Parallel batch 1 merged (after Tasks 1–4)
- [x] Each track's own tests pass in isolation
- [x] No file conflicts (disjoint file sets — confirmed via `git status` before staging)
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree
      (19 files, 124/124 tests)
- [x] Reconcile Task 2's stubbed default-object reference with Task 4's real `emptySettings()`
      (were value-identical; `storage.ts` now imports it)
- [x] Task 3's hook rewritten to `useSyncExternalStore` (see Task 3's note above)
      instead of the subagent's `useState`+`useEffect`+`eslint-disable` version;
      its test file adjusted accordingly (one test re-targeted from asserting a
      two-render hydration race to asserting an immediate correct read; two
      storage-event tests fixed to write to `localStorage` before dispatching
      the synthetic event, matching real cross-tab browser behavior)
- [x] Committed as 4 separate task commits (9846909, ee5873b, 33798c0, 465389b),
      ordered so each leaves the tree buildable (defaults.ts before storage.ts,
      which depends on it)
- [ ] **Human review before hook composition**

---

## Phase 2: Hook composition (sequential)

### Task 5: `hooks/use-settings.ts`

**Description:** `useSettings(): [SettingsV1, actions]` — composes
`use-local-storage.ts` with the schema/storage/migrations/defaults from
Phase 1 into the actual settings state hook the UI consumes.

**Acceptance criteria:**
- [x] Reads the persisted blob through the Zod schema + migration runner on
      mount (via `use-local-storage`'s `parse` callback)
- [x] Exposes actions: `setGlobalKey(envKey, value)`, `setBackendUrl(url)`,
      `setOverride(slug, envKey, value)`, `clearOverride(slug, envKey)`,
      `clearAll()`
- [x] `setOverride`/`setGlobalKey` store whatever key/value they're given
      without validating the key against a recipe's declared env vars —
      enforcement lives in the UI (Task 10), matching `resolve.ts`'s posture
      of trusting its caller
- [x] `clearAll()` calls through to `useLocalStorage`'s own `clear()` /
      resets to `emptySettings()` (not `storage.clear()` directly — see
      note below)

**Deviation from the plan, documented at implementation time:** `useSettings`
composes `useLocalStorage` directly (its own `parse` callback runs
`migrate()` + schema validation, mirroring `storage.ts`'s `read()`) rather
than calling `storage.ts`'s `read`/`write`/`clear` functions, which read
`window.localStorage` themselves and don't fit `useLocalStorage`'s
`parse(raw: string)` signature. `storage.ts` remains a valid standalone
utility for any future non-React/synchronous read (its own tests still
cover it) — `useSettings` just doesn't route through it for the reactive
path. Also found and fixed a latent `useLocalStorage` bug while building
this (see the separate "fix use-local-storage getSnapshot reference
instability" commit) — building the first hook whose `T` was an object,
rather than a primitive, is what surfaced it.

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test use-settings`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 0, 2, 3, 4

**Files likely touched:**
- `frontend/hooks/use-settings.ts`
- `frontend/tests/hooks/use-settings.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

### Task 6: `hooks/use-resolved-config.ts`

**Description:** `useResolvedConfig(recipe: { slug, env }): ResolvedConfig` —
composes `useSettings()` with `resolveConfig()`.

**Deviation from the plan, documented at implementation time:** returns
`[ResolvedConfig, SettingsActions]` rather than bare `ResolvedConfig`, so a
recipe's run form (a single `useResolvedConfig(recipe)` call) can both
render the resolved config and let the user edit an override right there,
without a second `useSettings()` mount. Both would subscribe to the same
underlying `useLocalStorage` either way; this just saves the caller a
second hook call for what's expected to be the common case.

**Acceptance criteria:**
- [x] For a recipe declaring a key with a global default set and no override,
      returns `source: "global"` for that field
- [x] For a recipe with no matching settings at all, returns
      `{ config: {}, fields: [...all "unset"], missingRequired: [...] }` —
      never throws, never blocks (empty state is first-class per the spec)
- [x] Recomputes when the underlying settings change (re-render on
      `useSettings`'s state changing)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test use-resolved-config`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 1, 5

**Files likely touched:**
- `frontend/hooks/use-resolved-config.ts`
- `frontend/tests/hooks/use-resolved-config.test.tsx`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Hooks complete (after Tasks 5–6)
- [x] `bun run test`, `typecheck`, `lint` clean (21 files, 144/144 tests)
- [ ] **Human review before the UI parallel batch**

---

## Phase 3: Parallel batch — 3 independent UI tracks

### Task 7 [PARALLEL — Track A]: `provider-key-field.tsx` + `keys-safety-note.tsx`

**Description:** A masked API-key input with a show/hide toggle, and the
"keys stay in your browser" messaging block used on both settings surfaces.

**Acceptance criteria:**
- [x] `provider-key-field.tsx`: renders `type="password"` by default; a
      show/hide toggle (`Eye`/`EyeOff` from `lucide-react`) flips to
      `type="text"` and back; toggling one field's visibility never affects
      another field's; the raw value is never logged or otherwise emitted
      outside the input's own value
- [x] `keys-safety-note.tsx`: a shadcn `Alert`-based block with the "your keys
      stay in this browser, sent only when you run a recipe" message

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test provider-key-field`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 0 (types only, for prop shapes if needed)

**Files likely touched:**
- `frontend/components/settings/provider-key-field.tsx`
- `frontend/components/settings/keys-safety-note.tsx`
- `frontend/tests/settings/provider-key-field.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 8 [PARALLEL — Track B]: `backend-url-field.tsx`

**Description:** The custom backend URL input, validated client-side against
the same rule as the Zod schema (absolute http(s) URL or empty).

**Acceptance criteria:**
- [x] Shows a validation message for a non-empty, non-http(s) value
- [x] Accepts an empty value (falls back to the default backend, per the spec)
- [x] Does not itself write to `localStorage` — takes `value`/`onChange` props,
      composed into `useSettings` by whoever mounts it (Task 11)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test backend-url-field`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** Task 0

**Files likely touched:**
- `frontend/components/settings/backend-url-field.tsx`
- `frontend/tests/settings/backend-url-field.test.tsx`

**Estimated scope:** Small: 1-2 files

---

### Task 9 [PARALLEL — Track C]: `clear-all-button.tsx`

**Description:** "Clear all settings" with a confirm dialog (shadcn `Dialog`)
before actually wiping the blob.

**Acceptance criteria:**
- [x] Clicking the button opens a confirmation dialog; clicking "confirm"
      calls the provided `onConfirm` (wired to `useSettings().clearAll` by
      whoever mounts it); clicking "cancel" or dismissing does nothing
- [x] Keyboard-operable (Escape closes, Enter on the trigger opens)

**Verification:**
- [ ] Tests pass: `cd frontend && bun run test clear-all-button`
- [ ] `bun run typecheck && bun run lint`

**Dependencies:** None (takes an `onConfirm` callback prop — doesn't need
`use-settings` directly)

**Files likely touched:**
- `frontend/components/settings/clear-all-button.tsx`
- `frontend/tests/settings/clear-all-button.test.tsx`

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Parallel batch 2 merged (after Tasks 7–9)
- [x] Each track's own tests pass in isolation (built by 3 parallel subagents,
      each on a disjoint file set, per the standing "parallelize heavily"
      instruction — pre-installed shared shadcn deps (Alert/Dialog/Input/
      Label/Badge) myself first so no track needed to touch `components.json`
      or risk overwriting `button.tsx`'s WCAG focus-ring fix)
- [x] No file conflicts
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged
      tree (25 files, 168/168 tests)

---

## Phase 4: Composition — 2 independent tracks

### Task 10 [PARALLEL — Track A]: `recipe-overrides.tsx` + `inheritance-badge.tsx`

**Description:** The per-recipe overrides panel `catalog`'s run form embeds
directly — **this is the module's critical cross-module deliverable; get the
prop interface exactly right.** Per `SPEC-catalog.md`'s `RunForm` code
sample, it is mounted as `<RecipeOverrides recipe={recipe} />`.

**Acceptance criteria:**
- [x] `RecipeOverrides` accepts `{ recipe: { slug: string; env: RecipeEnvDecl[] } }`
      (structurally satisfied by catalog's future richer `RecipeDetail` without
      any adapter) — no other required props
- [x] Renders one row per entry in `recipe.env`, using `useResolvedConfig`
      internally to get each field's current value/source
- [x] `inheritance-badge.tsx`: a small badge component — "Inherited from
      global" (source `"global"`), "Overridden" (source `"override"`), "Not
      set" (source `"unset"`, styled distinctly when `required: true`)
- [x] With a global key set and no override: shows "Inherited from global",
      field placeholder reflects the (masked) global value (a fixed-width
      mask, not length-preserving — the actual secret's length is itself
      information the placeholder shouldn't leak)
- [x] Typing an override flips the badge to "Overridden" and reveals a "reset
      to global" affordance; clicking it clears the override and the badge
      returns to "Inherited from global" (or "Not set" if no global exists)
- [x] A declared key with neither override nor global shows "Not set"

**Verification:**
- [x] Tests pass: `cd frontend && bun run test recipe-overrides` (9/9)
- [x] `bun run typecheck && bun run lint`
- [x] Manual check done as a compile-time-only assertion inside the test file
      itself (a local `RecipeDetail`-shaped interface assigned to
      `RecipeOverridesProps["recipe"]` with no cast) rather than a separate
      scratch file, so `bun run typecheck` checks it on every run instead of
      needing a one-off manual step — confirmed passing

Implemented directly rather than delegated to a subagent, given the
"critical cross-module deliverable" callout above; Task 11 ran in parallel
as a subagent instead.

**Dependencies:** Tasks 0, 1, 6

**Files likely touched:**
- `frontend/components/settings/recipe-overrides.tsx`
- `frontend/components/settings/inheritance-badge.tsx`
- `frontend/tests/settings/recipe-overrides.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

### Task 11 [PARALLEL — Track B]: `settings-screen.tsx`

**Description:** The global settings screen — composes Tasks 7-9's field
components with `useSettings()`. Mounted in `app-shell`'s main slot (Task 12).

**Acceptance criteria:**
- [x] Renders a `ProviderKeyField` per entry in `providers.ts` (starting with
      `OPENAI_API_KEY`), the `BackendUrlField`, the `KeysSafetyNote`, and the
      `ClearAllButton` wired to `useSettings().clearAll`
- [x] Changes to any field persist through `useSettings`'s actions (verified
      via a round-trip test: change a field, re-mount, see the new value)
- [x] Renders correctly with an empty settings store (no keys set) — the
      empty state is not an error or a blocking screen

**Verification:**
- [x] Tests pass: `cd frontend && bun run test settings-screen` (6/6)
- [x] `bun run typecheck && bun run lint`

**Dependencies:** Tasks 5, 7, 8, 9

**Files likely touched:**
- `frontend/components/settings/settings-screen.tsx`
- `frontend/tests/settings/settings-screen.test.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Composition complete (after Tasks 10–11)
- [x] Both tracks' tests pass; no file conflicts
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged
      tree (28 files, 188/188 tests)

---

## Phase 5: Wiring & sign-off (sequential)

### Task 12: `app/settings/page.tsx` + end-to-end verification

**Description:** Mount `SettingsScreen` as a real route inside the existing
`app-shell` layout (which already wraps every route in `<Shell>`).

**Acceptance criteria:**
- [x] `app/settings/page.tsx` renders `<SettingsScreen />`
- [x] `bun run dev`, navigate to `/settings`: the shell (sidebar, topbar) still
      renders around it, exactly like `/` does
- [x] Enter a key, reload the page, the key is still there (masked) — a real
      manual round-trip, not just the unit test's simulated one

**Verification:**
- [x] `cd frontend && bun run build` succeeds
- [x] Manual check as described above, via a real running server (verify no
      stale process is already bound to port 3000 first — `lsof -ti:3000` —
      per the lesson from app-shell Task 12) — done via `bun run build && bun
      run start` + Playwright, confirmed no stale process first; key survived
      a real full-page reload, masked (`type="password"`), well-formed blob
      in `localStorage`

**Dependencies:** Task 11

**Files likely touched:**
- `frontend/app/settings/page.tsx`

**Estimated scope:** Small: 1 file

---

### Task 13: Success-criteria sign-off pass

**Description:** Map each of `SPEC-settings.md`'s 8 numbered Success Criteria
to the test(s) that verify it, and confirm the coverage bar.

**Acceptance criteria:**
- [x] A sign-off table (in `tasks/plan-settings.md`, matching the precedent
      from `recipe-framework` and `app-shell`) lists all 8 criteria against
      their verification
- [x] `resolve.ts`, `storage.ts`, `migrations.ts` each individually report
      ≥95% line coverage — all three measured at **100%** line coverage via
      `bun run test:coverage` (new script; `@vitest/coverage-v8` installed,
      config added to `vitest.config.ts` — neither existed in `frontend/`
      before this task)
- [x] `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test` all green

**Verification:**
- [x] Full command suite above, run once at the end

**Dependencies:** Tasks 0–12

**Files likely touched:**
- `tasks/plan-settings.md` (sign-off table appended)
- Possibly `vitest.config.ts` (if coverage reporting isn't configured yet)

**Estimated scope:** Small: 1-2 files

---

## Checkpoint: Module complete (after Task 13)
- [x] All 8 success criteria individually verified (see sign-off table in
      `tasks/plan-settings.md`)
- [x] `resolve.ts`, `storage.ts`, `migrations.ts` each ≥ 95% line coverage
      (100% each)
- [x] Full suite + lint + typecheck + build green (28 files, 188/188 tests)
- [ ] **Human review before `catalog` begins consuming `RecipeOverrides`**
