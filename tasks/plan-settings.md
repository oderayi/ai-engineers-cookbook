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
- [ ] Task 0: `lib/settings/types.ts` + `lib/settings/schema.ts`

### Checkpoint: Foundation
- [ ] `bun run typecheck` clean
- [ ] Human review before the parallel batch

### Phase 1: Parallel batch — 4 independent tracks
- [ ] Task 1 **[PARALLEL]**: `lib/settings/resolve.ts` (the merge policy)
- [ ] Task 2 **[PARALLEL]**: `lib/settings/storage.ts` + `lib/settings/migrations.ts`
- [ ] Task 3 **[PARALLEL]**: `hooks/use-local-storage.ts` (generic primitive)
- [ ] Task 4 **[PARALLEL]**: `lib/settings/defaults.ts` + `lib/settings/providers.ts`

### Checkpoint: Parallel batch 1 merged
- [ ] Each track's own tests pass in isolation
- [ ] No file conflicts (disjoint file sets)
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` clean on the merged tree
- [ ] Human review before hook composition

### Phase 2: Hook composition (sequential — depends on Phase 1)
- [ ] Task 5: `hooks/use-settings.ts`
- [ ] Task 6: `hooks/use-resolved-config.ts`

### Checkpoint: Hooks complete
- [ ] `bun run test`, `typecheck`, `lint` clean
- [ ] Human review before the UI parallel batch

### Phase 3: Parallel batch — 3 independent UI tracks
- [ ] Task 7 **[PARALLEL]**: `provider-key-field.tsx` + `keys-safety-note.tsx`
- [ ] Task 8 **[PARALLEL]**: `backend-url-field.tsx`
- [ ] Task 9 **[PARALLEL]**: `clear-all-button.tsx`

### Checkpoint: Parallel batch 2 merged
- [ ] Each track's own tests pass in isolation
- [ ] No file conflicts
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` clean

### Phase 4: Composition — 2 independent tracks
- [ ] Task 10 **[PARALLEL]**: `recipe-overrides.tsx` + `inheritance-badge.tsx`
      (the cross-module deliverable `catalog` will import)
- [ ] Task 11 **[PARALLEL]**: `settings-screen.tsx` (composes Task 7-9's fields)

### Checkpoint: Composition complete
- [ ] Both tracks' tests pass; no conflicts; full suite clean

### Phase 5: Wiring & sign-off (sequential)
- [ ] Task 12: `app/settings/page.tsx` + manual end-to-end verification
- [ ] Task 13: Success-criteria sign-off pass

### Checkpoint: Module complete
- [ ] All 8 success criteria in `SPEC-settings.md` individually verified
- [ ] `resolve.ts`, `storage.ts`, `migrations.ts` each ≥ 95% line coverage
- [ ] Full suite + lint + typecheck + build green
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
