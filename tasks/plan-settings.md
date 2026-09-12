# Implementation Plan: `settings`

Spec: [docs/SPEC-settings.md](../docs/SPEC-settings.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Third module built, per the approved build order. Depends only on
`recipe-framework` (done). `catalog` (next after this) imports this module's
`RecipeOverrides` component into its run form — building settings first avoids
catalog guessing at an interface that doesn't exist yet.

## Overview

A frontend-only, `localStorage`-backed configuration layer: a versioned,
Zod-validated settings blob (global provider keys + custom backend URL +
per-recipe overrides), the pure `resolveConfig` merge function that is the
actual heart of the module, and two UI surfaces (a global settings screen, and
a per-recipe overrides panel `catalog` embeds). Built bottom-up: schema and
merge logic first (fully unit-testable with no DOM), then the hooks that wire
them to `localStorage`, then the UI.

## Architecture Decisions

- **A local `RecipeEnvDecl` type, not an import from catalog's future
  `lib/api/models.ts`.** The spec's own code sample imports `EnvVar` from
  `@/lib/api/models` — but `catalog` (which owns that file) is built *after*
  settings in this order. Settings defines the minimal shape it actually needs
  (`{ key, provider, required, description }`) in `lib/settings/types.ts`;
  catalog's richer `EnvVar` will be structurally identical, so passing a real
  `RecipeDetail.env` into `RecipeOverrides` later needs no adapter. This is a
  spec clarification, not a scope change — noted in `SPEC-settings.md`.
- **Two parallel batches, sequential composition between them**, matching the
  natural dependency shape: schema/merge logic has zero DOM dependency and
  splits cleanly into 4 independent tracks; the two hooks that compose them
  are inherently sequential (`use-resolved-config` needs `use-settings`); the
  UI then splits into another parallel batch once the hooks exist.
- **`resolveConfig` is built and fully tested before anything touches
  `localStorage` or the DOM.** It's pure, has zero dependencies beyond
  `types.ts`, and is the one piece every other module (`catalog`, `execution`)
  will actually call — get it right in isolation first.

## Task List

### Phase 0: Foundation (sequential)
- [x] Task 0: `lib/settings/types.ts` + `lib/settings/schema.ts`

### Checkpoint: Foundation
- [x] `bun run typecheck` clean
- [x] Human review before the parallel batch

### Phase 1: Parallel batch — 4 independent tracks
- [x] Task 1 **[PARALLEL]**: `lib/settings/resolve.ts` (the merge policy)
- [x] Task 2 **[PARALLEL]**: `lib/settings/storage.ts` + `lib/settings/migrations.ts`
- [x] Task 3 **[PARALLEL]**: `hooks/use-local-storage.ts` (generic primitive) —
      rewritten from the subagent's `useState`+`useEffect` version to
      `useSyncExternalStore`, matching `use-local-storage-boolean.ts`; a real
      `getSnapshot` reference-instability bug was found and fixed while
      building Task 5 on top of it (see that commit)
- [x] Task 4 **[PARALLEL]**: `lib/settings/defaults.ts` + `lib/settings/providers.ts`

### Checkpoint: Parallel batch 1 merged
- [x] Each track's own tests pass in isolation
- [x] No file conflicts (disjoint file sets)
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree
- [x] Human review before hook composition (continuous "proceed" greenlight)

### Phase 2: Hook composition (sequential — depends on Phase 1)
- [x] Task 5: `hooks/use-settings.ts`
- [x] Task 6: `hooks/use-resolved-config.ts` — returns
      `[ResolvedConfig, SettingsActions]` rather than bare `ResolvedConfig`
      (documented deviation, see `tasks/todo-settings.md`)

### Checkpoint: Hooks complete
- [x] `bun run test`, `typecheck`, `lint` clean
- [x] Human review before the UI parallel batch

### Phase 3: Parallel batch — 3 independent UI tracks
- [x] Task 7 **[PARALLEL]**: `provider-key-field.tsx` + `keys-safety-note.tsx`
- [x] Task 8 **[PARALLEL]**: `backend-url-field.tsx`
- [x] Task 9 **[PARALLEL]**: `clear-all-button.tsx`

### Checkpoint: Parallel batch 2 merged
- [x] Each track's own tests pass in isolation
- [x] No file conflicts
- [x] `bun run typecheck`, `bun run lint`, `bun run test` clean

### Phase 4: Composition — 2 independent tracks
- [x] Task 10 **[PARALLEL]**: `recipe-overrides.tsx` + `inheritance-badge.tsx`
      (the cross-module deliverable `catalog` will import) — implemented
      directly rather than delegated, given its criticality
- [x] Task 11 **[PARALLEL]**: `settings-screen.tsx` (composes Task 7-9's fields)

### Checkpoint: Composition complete
- [x] Both tracks' tests pass; no conflicts; full suite clean

### Phase 5: Wiring & sign-off (sequential)
- [x] Task 12: `app/settings/page.tsx` + manual end-to-end verification
- [x] Task 13: Success-criteria sign-off pass

### Checkpoint: Module complete
- [x] All 8 success criteria in `SPEC-settings.md` individually verified
- [x] `resolve.ts`, `storage.ts`, `migrations.ts` each ≥ 95% line coverage
      (all three at 100% — see sign-off table below)
- [x] Full suite + lint + typecheck + build green
- [ ] Human review before `catalog` begins consuming `RecipeOverrides`

## Parallelization Notes

| Batch | Track | Files | Depends on |
|---|---|---|---|
| 1 | A (Task 1) | `lib/settings/resolve.ts` + test | Task 0 only |
| 1 | B (Task 2) | `lib/settings/storage.ts`, `migrations.ts` + tests | Task 0 only |
| 1 | C (Task 3) | `hooks/use-local-storage.ts` + test | Nothing settings-specific (generic hook) |
| 1 | D (Task 4) | `lib/settings/defaults.ts`, `providers.ts` + tests | Task 0 only |
| 2 | A (Task 7) | `provider-key-field.tsx`, `keys-safety-note.tsx` + tests | Task 0 only (masking is self-contained) |
| 2 | B (Task 8) | `backend-url-field.tsx` + test | Task 0 only |
| 2 | C (Task 9) | `clear-all-button.tsx` + test | Task 5 (needs `useSettings`'s clear action) |
| 3 | A (Task 10) | `recipe-overrides.tsx`, `inheritance-badge.tsx` + tests | Tasks 0, 1, 6 |
| 3 | B (Task 11) | `settings-screen.tsx` + test | Tasks 5, 7, 8, 9 |

No track reads or writes another track's files. Each subagent gets the
relevant `SPEC-settings.md` excerpt, the exact file paths and prop
interfaces, and instructions to write tests first and run `bun run test` +
`lint` + `typecheck` itself before reporting back. I review and integrate
before moving to the next phase.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `RecipeOverrides`' prop interface drifts from what `catalog`'s `RunForm` code sample actually expects (`<RecipeOverrides recipe={recipe} />`) | High — `catalog` would need rework | Task 10's subagent gets the exact code sample from `SPEC-catalog.md` quoted in its prompt, not just `SPEC-settings.md`'s |
| A subagent reaches for `localStorage` directly instead of the shared `use-local-storage.ts` primitive (duplicating SSR-safety/cross-tab logic) | Medium | Explicit instruction + review checklist item; `use-local-storage.ts` lands in the same parallel batch (Task 3) so it exists before any consumer needs it |
| Masking (`provider-key-field.tsx`) accidentally leaks a key into a `console.log`, a test snapshot, or an error boundary message | Medium — directly violates a `Never` boundary | Dedicated test asserting the raw value never appears in the DOM while masked; code review checks for stray `console.log`/template-string interpolation of the value |

## Open Questions

Carried from the spec, not blocking for these tasks:
- Multiple named key profiles, export/import, encryption at rest, per-provider
  "test key" validation — all explicitly deferred in the spec itself.
- Which provider keys ship in the global screen by default — the spec leans
  "OpenAI at minimum"; Task 7/11 ship with OpenAI as the one seeded provider
  field, extensible once the v1 recipe set is locked.

## Success-criteria sign-off (Task 13)

Every numbered Success Criterion in `SPEC-settings.md`, mapped to what
verifies it. Module complete: 28 test files, 188/188 Vitest tests,
`resolve.ts`/`storage.ts`/`migrations.ts` each at 100% line coverage (via
`bun run test:coverage`, added this task — `@vitest/coverage-v8` was not
previously installed anywhere in `frontend/`), `bun run
{typecheck,lint,test,build}` all clean, plus a real manual round-trip
(Task 12) through a production server.

| # | Criterion | Verified by |
|---|---|---|
| 1 | A learner enters `OPENAI_API_KEY` once in global settings; every recipe that declares it shows it as "Inherited from global" in the run form and runs with it | `tests/settings/recipe-overrides.test.tsx` ("shows 'Inherited from global' with a masked placeholder when only a global default is set") + `tests/hooks/use-resolved-config.test.tsx` (source `"global"`, config populated). "Runs with it" is `execution`'s concern once that module exists — out of scope here, same carry-forward pattern as `app-shell`'s sign-off |
| 2 | `resolveConfig` passes the full merge table: override > global > unset, with trimming, declared-keys-only, and `missingRequired` correct | `tests/settings/resolve.test.ts` — every case in the plan's Task 1 acceptance criteria, at 100% line coverage |
| 3 | A populated settings object survives a `localStorage` write/read round-trip byte-for-byte (after normalization) with no data loss | `tests/settings/storage.test.ts` (unit round-trip) + `settings-screen.test.tsx`'s persistence tests (through the real hook stack) + Task 12's manual verification through an actual page reload against a production server |
| 4 | A legacy/unversioned blob is migrated to `CURRENT_VERSION`; a corrupt or too-new blob is replaced with defaults and the UI still renders | `tests/settings/migrations.test.ts` (migration table) + `tests/hooks/use-settings.test.tsx` ("migrates a legacy/unversioned stored blob", "falls back to emptySettings() for a malformed stored blob, without crashing", "falls back to emptySettings() for a schema-invalid stored blob") |
| 5 | Every key field is masked by default; the show/hide toggle works per-field; no key value is ever emitted to a log, URL, or non-backend origin | `tests/settings/provider-key-field.test.tsx` (masking, independent per-field toggle, no second rendering surface for the value, no `console.log`) + `tests/settings/recipe-overrides.test.tsx` ("show/hide toggle is independent per row"). No `grep`-based guard script was added beyond the test assertions — the module makes zero network calls of any kind (frontend-only, Confirmed Decision 1), so there is no code path that could put a key in a URL or send it anywhere; verified by inspection, not a dedicated grep test |
| 6 | "Clear all settings" wipes the blob; the next load shows the empty state and nothing breaks | `tests/settings/clear-all-button.test.tsx` (confirm/cancel/Escape flows) + `tests/hooks/use-settings.test.tsx` ("clearAll resets to emptySettings() and removes the stored blob") + `tests/settings/settings-screen.test.tsx` ("wires ClearAllButton's onConfirm to actions.clearAll, wiping the store") |
| 7 | With no key set, the catalog is fully browsable and the keyless trial run is not blocked; the run form shows the trial-key hint, not an error | Structural for this module: `useResolvedConfig`/`RecipeOverrides`/`SettingsScreen` all render a normal (non-error, non-blocking) empty state with no settings present — `tests/hooks/use-resolved-config.test.tsx` ("for a recipe with no matching settings at all..."), `tests/settings/settings-screen.test.tsx` ("renders correctly with an empty settings store"). The catalog's own browsability and the trial-key hint UI are `catalog`/`trial-limits`' concerns and don't exist yet — carried forward, same pattern as `app-shell`'s sign-off criterion 2 |
| 8 | `customBackendUrl` accepts only absolute `http(s)` URLs, stores them normalized, and an empty value falls back to the default backend | `tests/settings/schema.test.ts` (normalization, rejection cases, empty-string acceptance) + `tests/settings/backend-url-field.test.tsx` (client-side validation mirroring the schema) |

**Action items surfaced by this table, carried forward:**
- Criteria 1 and 7's "runs with it" / "catalog is fully browsable" halves depend on `catalog`, `execution`, and `trial-limits`, none of which exist yet — this module's own contribution to each is fully verified.
- Criterion 5's "never sent to any non-backend origin" is verified by inspection (no network code exists in this module at all) rather than a dedicated grep/test guard — worth a real guard test once `execution` introduces the first actual network call that carries a key, so a future regression there is caught by a test rather than inspection.
