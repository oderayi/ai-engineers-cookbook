# Implementation Plan: `workspace`

Spec: [docs/SPEC-workspace.md](../docs/SPEC-workspace.md).
Capability map: [docs/CAPABILITY-MAP.md](../docs/CAPABILITY-MAP.md).
Seventh module built, per the approved build order. Depends on `catalog`
and `execution` (both done). Frontend-only — no API routes, no server-side
persistence.

## Overview

The RunJS-style multi-tab surface: a tab strip filling `app-shell`'s
top-bar slot, a tab-panel host filling its main slot that mounts one
`catalog` `<RecipeView>` per open tab (always mounted, visibility toggled
via `hidden`, never conditionally unmounted — the mechanism that keeps a
background run streaming), a `localStorage`-persisted tab list restored on
reload, and a progress ledger (`viewed`/`completed` per recipe slug) that
surfaces a badge in `catalog`'s sidebar nav.

Requires one small, already-approved cross-module amendment to `catalog`
(Cross-module contract, Open Question 1: **resolved, approved**): wiring
`<RecipeView>`'s existing-but-unfired `onStatusChange` prop to actually
fire on every `useRecipeRun` status transition, and adding an optional
`progress` prop to `nav-tree.tsx`. `<RecipeView>`'s `cancelRun()` via
`RecipeViewHandle` is **already fully wired** (to `<RunOutput>`'s real
`cancel()`, since `execution`'s own Task 14) — nothing left to do there.

Built bottom-up: the persisted-state schema + reducer + progress logic
first (pure, no React), then the hooks composing them with `settings`'
`useLocalStorage`, then the two presentational components, then the one
real cross-module amendment to `catalog`, then composition into
`app/layout.tsx`, then E2E.

## Architecture Decisions

1. **The `catalog` amendment (wiring `onStatusChange`) is this module's own
   Task 1, not a prerequisite handled elsewhere.** The spec's Cross-module
   contract section is already approved (Open Question 1), so there is no
   sign-off gate left to clear — but the actual code change (making
   `onStatusChange` fire) has NOT been made yet (confirmed by reading
   `app/r/[slug]/recipe-view.tsx`: the prop exists and is typed, but is
   never invoked — `execution`'s own Task 14 explicitly left it unwired,
   documented as "workspace cross-module wiring, out of execution's own
   scope"). `workspace` is the module whose scope this now falls under,
   so it owns making the wire real, not `execution` retroactively.
2. **`onStatusChange` needs `<RunOutput>` to report status upward.**
   `RunOutput` (execution's component) currently exposes `start`/`cancel`
   via `RunOutputHandle` but never reports `useRecipeRun`'s own `status`
   anywhere outside itself. The minimal, additive change: `RunOutput`
   gains an optional `onStatusChange?: (status: RunStatus) => void` prop
   (a `useEffect` firing whenever `status` changes), and `recipe-view.tsx`
   forwards its own already-existing (currently unused) `onStatusChange`
   prop straight through to `<RunOutput>`. This touches `execution`'s
   `run-output.tsx` and `catalog`'s `recipe-view.tsx` — both explicitly
   sanctioned by the approved cross-module contract, not a silent edit.
3. **Tabs state and progress ledger share one `localStorage` blob**
   (`skillet.workspace`), reusing `settings`' `useLocalStorage` primitive
   verbatim (per Confirmed Decision 9 — no forked copy). The reducer
   (`tabs-reducer.ts`) is pure and holds only in-memory-shaped
   `{tabs, activeTabId}`; persistence is a separate concern layered on top
   by `use-tabs.ts`, mirroring `settings`' own hook/reducer/storage
   separation.
4. **`use-tabs.ts` and `use-progress.ts` are two separate hooks over the
   same blob**, not one combined hook — matches the spec's own file list
   and keeps `tab-strip.tsx`/`tab-panels.tsx` (which only need tabs) from
   needing to know progress exists, and vice versa for whatever renders
   nav badges.
5. **`TabPanels` owns the `Map<tabId, RecipeViewHandle>` ref registry and
   the actual `cancelRun()`-before-`CLOSE_TAB` sequencing** (per the
   spec's own Code Style sample) — `tabs-reducer.ts` itself has no
   knowledge of run state or imperative handles at all, keeping the
   reducer pure and trivially table-tested.
6. **`app/layout.tsx` is a shared file, edited additively.** `app-shell`
   already owns its own slots there; this module's edit is limited to (a)
   filling the topbar/main slots with `<TabStrip>`/`<TabPanels>` and (b)
   passing a `progress` map into the existing `nav-tree(...)` call site —
   never touching `components/shell/` itself, per the spec's own boundary.
7. **E2E covers exactly the two scenarios unit tests structurally can't
   prove convincingly**: a real background run continuing to stream while
   its tab is hidden (jsdom can fake timers/mocks but a real SSE stream
   over a real backend is the only convincing proof, mirroring
   `execution`'s own reasoning for needing a real socket), and
   restore-on-reload (a real page navigation, not a component remount).
   Everything else (reducer logic, progress computation, migration) is
   unit-tested exhaustively per the spec's own ≥95% coverage bar on the
   two load-bearing pure-logic files.

## Task List

### Phase 1: The `catalog`/`execution` amendment (sequential, first — nothing else can be meaningfully tested against a fixture until this exists)
- Task 1: Wire `<RunOutput>`'s status upward (`onStatusChange` prop) and forward it through `recipe-view.tsx`

### Checkpoint: Amendment complete
- `execution`'s and `catalog`'s existing suites (550 + whatever catalog's own count is) stay green; new tests for the wiring itself

### Phase 2: Persisted state — parallel batch
- Task 2 [PARALLEL — Track A]: `lib/workspace/{schema,defaults,migrations}.ts`
- Task 3 [PARALLEL — Track B]: `lib/workspace/tabs-reducer.ts`
- Task 4 [PARALLEL — Track C]: `lib/workspace/progress.ts`

### Checkpoint: Persisted state
- Each track's tests pass; ≥95% coverage on `tabs-reducer.ts`/`progress.ts`; no conflicts

### Phase 3: Hooks (sequential — both compose the same underlying storage primitive, safer one at a time)
- Task 5: `hooks/use-tabs.ts`
- Task 6: `hooks/use-progress.ts`

### Checkpoint: Hooks complete
- Both hooks' tests pass; typecheck/lint clean

### Phase 4: Components — parallel batch
- Task 7 [PARALLEL — Track A]: `components/workspace/{tab-strip,tab-strip-item}.tsx`
- Task 8 [PARALLEL — Track B]: `components/workspace/{tab-panels,empty-workspace}.tsx`

### Checkpoint: Components complete
- Each track's tests pass; no conflicts; `bun run typecheck && bun run lint`

### Phase 5: Cross-module composition (sequential)
- Task 9: Wire `<TabStrip>`/`<TabPanels>` into `app/layout.tsx`'s slots + the `progress` prop into `nav-tree.tsx`'s call site
- Task 10: Playwright E2E (`tab-lifecycle.spec.ts`, `background-run.spec.ts`)

### Checkpoint: Integration complete
- `bun run build` succeeds; E2E stable across 3 consecutive runs

### Phase 6: Sign-off
- Task 11: Success-criteria sign-off pass (8 criteria) appended to this plan

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `<RecipeView>` remounts on tab switch instead of just toggling `hidden`, silently killing background runs | Critical — defeats the module's whole premise | `tab-panels.tsx` renders every open tab's `<RecipeView>` unconditionally, keyed by tab `id` (stable across re-renders); a test explicitly asserts the same component instance (e.g. via a ref identity check or a render-count spy) survives an active-tab switch |
| The `localStorage` blob accidentally grows to include run output/events over time (schema drift) | Medium — violates an explicit spec boundary, and privacy-adjacent (learner's own inputs) | `workspaceV1Schema` has no field for it; a test asserts unknown extra keys are stripped on parse, not silently persisted forward, matching `settings`' own migration test convention |
| `onStatusChange` wiring (Task 1) regresses `execution`'s or `catalog`'s already-signed-off test suites | High — touches two already-complete, already-signed-off modules | Full re-run of both suites after Task 1, before any workspace-specific code is written on top of it |
| Cancel-on-close races with an already-completing run (calling `cancelRun()` on a tab whose run just finished) | Low (a harmless no-op, if `cancel()` is idempotent) | `execution`'s `cancel()` is already a no-op when nothing is in flight (verified in its own test suite) — no new guard needed here, just confirmed rather than assumed |

## Open Questions

Carried from the spec, all already resolved there — nothing blocking:
- Max open tabs: unbounded for v1.
- Closing the last tab: `<EmptyWorkspace>`.
- Drag-to-reorder: not in v1.
- Progress semantics on re-run: `completedAt` simply overwritten; no third "attempted" state.
