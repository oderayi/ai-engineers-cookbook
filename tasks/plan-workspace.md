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

## Sign-off: Success Criteria (Task 11)

Each of `SPEC-workspace.md`'s 8 numbered Success Criteria, mapped to what verifies it.

| # | Criterion | Verified by |
|---|---|---|
| 1 | Opening the same recipe twice produces two independent tabs, each with its own run state | `tests/workspace/tabs-reducer.test.ts` ("opening the same slug twice produces two distinct tabs with different ids"); `tests/workspace/tab-panels.test.tsx` ("mounts every open tab's `<RecipeView>` simultaneously, not just the active one", "does NOT remount an inactive tab's `<RecipeView>` when the active tab switches") — each tab keys its own `<RecipeView>` (and thus its own `useRecipeRun` instance) by a distinct `crypto.randomUUID()`, so two tabs of the same slug are architecturally independent, not merely coincidentally so; `e2e/workspace/tab-lifecycle.spec.ts` opens "echo" twice as a real-browser check that both tabs actually appear |
| 2 | Starting a run in tab A, switching to B/C and back, shows A continued streaming with its tab dot reflecting `running` → `done`/`error` while inactive | `e2e/workspace/background-run.spec.ts` (real backend, real 5s `slow-echo` run, asserts A's dot is `running` while B is active, then `done` after A's own sleep completes with B still foreground, then A's accumulated output is immediately present on switching back) — this is the one guarantee only a real browser convincingly proves; a genuine React error #185 infinite-render-loop bug was found and fixed while building this spec (see `git log` for `run-output.tsx`'s fix) |
| 3 | Closing a tab whose run is in flight calls that run's cancellation exactly once | `tests/workspace/tab-panels.test.tsx` ("exposes closeTab via ref: closing a RUNNING tab cancels its run exactly once, before onClose fires", plus the negative cases for idle/done/error tabs — closing those does NOT call `cancelRun`) |
| 4 | Reloading the page restores the same open tabs, in the same order, with the same tab active; no tab attempts to resume a run | `e2e/workspace/tab-lifecycle.spec.ts` (real browser reload after opening 3 tabs, closing one, switching active — asserts identical tabs/order/active tab post-reload, and zero `[data-slot="run-output"]` elements). A genuine SSR-hydration-timing bug in `use-tabs.ts` was found and fixed while building this spec (see `git log`) — no jsdom-based unit test could have caught it, since jsdom never goes through a real server-render-then-hydrate cycle |
| 5 | Pressing Run again in a tab already streaming cancels that run and starts the new one; only the new run's output shows | `tests/hooks/use-recipe-run.test.tsx` ("start() while already running cancels the previous run and starts fresh (cancel-and-restart)") — `execution`'s own signed-off guarantee, inherited unchanged: `workspace` mounts `execution`'s `<RunOutput>`/`useRecipeRun` as-is per tab, with no override of this mechanism |
| 6 | First successful run sets `completedAt`; viewing (without running) sets only `viewedAt`; both survive a `localStorage` round-trip and a schema migration from an unversioned blob | `tests/workspace/progress.test.ts` (full `markViewed`/`markCompleted` behavior, including "backfills `viewedAt` to the same value as `completedAt` when the slug was never viewed", non-mutation, idempotency); `tests/workspace/migrations.test.ts` ("upgrades an unversioned/legacy blob to `CURRENT_VERSION` without throwing", preserving values) |
| 7 | A corrupt or newer-than-`CURRENT_VERSION` blob is discarded for `emptyWorkspace()` without throwing; workspace renders with zero tabs | `tests/workspace/migrations.test.ts` ("discards a blob with version greater than `CURRENT_VERSION` for `emptyWorkspace()`, without throwing", "discards a non-object value for `emptyWorkspace()`, without throwing", "discards a blob that still fails schema validation after upgrade, without throwing") |
| 8 | `workspace` fills `app-shell`'s topbar/main slots and mounts `catalog`'s `<RecipeView>` without editing `components/shell/` or `components/catalog/` beyond the approved amendment | `tests/workspace/workspace-shell.test.tsx` (composition behavior: renders children with zero tabs, always shows `/settings`'s own content regardless of tab state, sidebar-click interception scoped correctly); structurally confirmed via `git log --oneline -- frontend/components/shell/ frontend/components/catalog/` showing no `workspace:`-prefixed commit touching either directory |

**Full command suite** (`cd frontend && bun run build && bun run lint && bun run typecheck && bun run test && bun run test:e2e`): all green — 655/655 unit tests, zero lint/typecheck errors, production build succeeds, full E2E suite (22/22) stable across 3 consecutive runs.

**Real bugs found and fixed during this module** (both only reachable via a real browser, not jsdom): the `use-tabs.ts` SSR-hydration restore bug (criterion 4) and the `run-output.tsx` infinite-render-loop bug (criterion 2) — see `tasks/todo-workspace.md`'s Task 10 notes and the corresponding commit for full root-cause writeups.
