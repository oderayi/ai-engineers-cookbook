# Spec: workspace

Module id: `workspace` — see [CAPABILITY-MAP.md](CAPABILITY-MAP.md).
Intent: [intent/v1.md](intent/v1.md). Status: **approved 2026-09-11**.
Depends on: `catalog`, `execution`.

## Objective

The RunJS-style multi-tab surface: a tab strip in the shell's top bar, one
independent recipe view per open tab, per-device progress tracking, and the
completion marks that surface back in the catalog's nav.

- **What:** the tab strip that fills `app-shell`'s top-bar slot; the tab-panel
  host that fills `app-shell`'s main slot, mounting one `catalog` `<RecipeView>`
  per open tab and keeping each tab's run alive while it's in the background; a
  `localStorage`-persisted tab list (restored on reload) and a `localStorage`
  progress ledger (`viewed` / `completed` per recipe slug) that drives a badge in
  `catalog`'s sidebar nav.
- **Why:** letting a learner open several recipes side by side (and come back to
  a still-running one) is the tactile, "playground" feel the intent calls for;
  progress marks turn browsing into a visible sense of advancement without ever
  needing an account.
- **User:** the learner juggling recipes. Also `catalog`, whose `<RecipeView>`
  this module mounts, and whose sidebar nav this module supplies progress data
  to.
- **Success:** a learner opens three recipes, starts a run in the first, switches
  to the second and third, and the first keeps streaming and its tab dot updates
  the whole time; closing a tab cancels its run; reloading the page restores the
  same tabs and the same active tab; the sidebar shows a checkmark next to a
  recipe once its first run completes.

## Scope

**In:** the tab strip component (new tab, close tab, active-tab highlight, a
per-tab status dot, title truncation) mounted into `app-shell`'s top-bar slot;
the tab-panel host mounted into `app-shell`'s main slot, which renders every
open tab's `<RecipeView slug=…>` concurrently and toggles visibility rather than
unmounting; the tabs state model (reducer + `localStorage` persistence:
open/close/activate, restore-on-reload); allowing duplicate tabs of the same
recipe; per-tab run isolation (each tab's run streams independently of tab
switches); cancelling a tab's run when that tab is closed; the same-tab
"run again while running" policy; the progress ledger (`viewed` /
`completed` timestamps per slug), its `localStorage` persistence, and the hook
that exposes it to `catalog`'s nav; the empty-workspace state.

**Out:** the shell frame, slots, sidebar, and theming (`app-shell` — this module
fills slots, never edits `components/shell/`); the recipe page's regions, the
run form, and the source viewer (`catalog` — this module mounts `<RecipeView>`
as an opaque unit and never edits `components/catalog/`); the run endpoint, the
SSE client, event rendering, and cancellation mechanics (`execution` — this
module calls the surface `<RecipeView>` already exposes; it does not talk to the
backend or parse events itself); global/per-recipe settings and key resolution
(`settings`); rate limiting and the trial nudge (`trial-limits`); any
server-side or cross-device persistence (out of scope for all of v1 per intent).

## Confirmed decisions

1. **Frontend-only module.** No API routes, no server-side persistence. Next.js
   15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, **bun** — same
   stack as every other frontend module.
2. **Tabs are kept mounted, not unmounted, while open.** The tab-panel host
   renders one `<RecipeView slug={tab.slug} />` per open tab at all times and
   hides inactive ones with the `hidden` attribute (`display: none`), never a
   conditional `{active && <RecipeView/>}`. Because `<RecipeView>` owns its own
   `useRecipeRun` instance internally (per `execution`), keeping the component
   mounted is what keeps its `AbortController` and event stream alive across a
   tab switch — no separate run registry or keyed hook map is needed on the
   workspace side. This is the mechanism that makes "switching tabs doesn't
   cancel a background run" true.
3. **A tab is identified by a generated id, not by slug.** `id: crypto.randomUUID()`
   at open time. This is what makes duplicate tabs of the same recipe safe: two
   tabs with the same `slug` are still two distinct `<RecipeView>` instances (two
   distinct React component instances, two distinct `useRecipeRun` instances)
   because React keys them by tab id.
4. **Duplicate recipe tabs are allowed**, matching the RunJS reference —
   `+` always opens a new tab, even for a recipe already open elsewhere. There is
   no "focus existing tab" behavior for v1.
5. **Closing a tab cancels that tab's run if one is in flight.** The tab-panel
   host holds an imperative handle per tab (see Cross-module contract below) and
   calls `cancelRun()` on it before removing the tab from state. This is
   independent of and in addition to `execution`'s own disconnect-cancels-run
   behavior (unmounting would also trigger it); calling it explicitly makes the
   contract observable and testable at the workspace layer without depending on
   unmount timing.
6. **Same-tab re-run policy: cancel-and-restart** (resolves `execution` Open
   Question 5). Pressing Run again in a tab whose run is still streaming cancels
   the in-flight run and starts the new one with the new params; the output pane
   clears to the new run's stream. This is a same-tab concern only — different
   tabs already never share state, so there is no cross-tab ambiguity to resolve.
7. **What survives a reload vs. what doesn't:** persisted — the ordered list of
   open tabs (`id`, `slug`), which tab is active, and the progress ledger.
   **Not** persisted — run output, event streams, in-flight run status, or any
   form/param state inside a tab. A tab that was mid-stream when the page
   reloaded comes back **idle** (no auto-reconnect, matching `execution`, which
   has no resume mechanism in v1). Rationale: run output can be large and can
   contain the learner's own inputs; only "which tabs, which is active, what's
   been viewed/completed" is worth the durability of `localStorage`.
8. **Progress is tracked per recipe `slug`, per browser, as two nullable
   timestamps:** `viewedAt` (set once, the first time a tab for that slug is
   opened; never overwritten by later opens) and `completedAt` (set when a run
   for that slug reaches a terminal `result` event — never on `error`). A recipe
   is "viewed" if `viewedAt` is non-null, "completed" if `completedAt` is
   non-null. Re-running an already-completed recipe currently just refreshes
   `completedAt` on the next success; it does not change the boolean badge state
   either way (see Open Questions for whether it should track more than that).
9. **Progress ledger and tab list share one versioned `localStorage` blob**
   (`skillet.workspace`), Zod-validated, migrated forward on load, discarded to
   defaults if corrupt or newer than `CURRENT_VERSION` — the exact pattern
   `settings` established. `workspace` reuses `settings`'
   `hooks/use-local-storage.ts` primitive as-is; it does not fork or duplicate
   it.
10. **The tab strip shows one status dot per tab**, computed from that tab's run
    status (`idle` / `running` / `done` / `error`), visible even when the tab is
    inactive — this is the "unsaved/running state shown even off-tab" behavior
    RunJS has. Getting that status out of `<RecipeView>` (which owns the hook)
    and into the tab strip (owned by `workspace`) is the same seam as
    cancellation — see Cross-module contract.
11. **New tabs open to a blank/browsing state, not a specific recipe, unless
    opened from the catalog.** Opening a recipe from the sidebar or catalog index
    opens (or reuses — no, always opens, per decision 4) a new tab for that slug.
    A bare "+" with no recipe context is out of scope for v1 pending Open
    Question 2 below (workspace currently assumes every tab has a `slug` from the
    moment it's created).

## Cross-module contract (`catalog` amendment — proposed, needs `catalog` sign-off)

`catalog`'s `SPEC-catalog.md` already commits to "`workspace` can render
`<RecipeView slug=… />` as tab content without modifying `components/catalog/`"
(its Success Criterion 7), but its current `<RecipeView>` surface (implied by its
spec) is not yet rich enough for two things this module needs. Flagging both
explicitly, the same way `catalog` flagged its own `recipe-framework` amendment:

1. **Run-status observability.** `<RecipeView>` gains an optional
   `onStatusChange?: (status: RecipeRunStatus) => void` prop, invoked whenever
   its internal `useRecipeRun` status transitions
   (`idle → running → done | error`, and back to `idle` on cancel-and-restart).
   `workspace` passes this to drive both the tab dot and the `completedAt`
   progress write. Purely additive and optional — `catalog`'s own usage of
   `<RecipeView>` (if any) is unaffected.
2. **Imperative cancel.** `<RecipeView>` is wrapped in `forwardRef` and exposes
   `{ cancelRun(): void }` via `useImperativeHandle`, delegating to its internal
   `useRecipeRun().cancel`. `workspace` calls this when a tab is closed.
3. **Nav progress badge.** `catalog`'s `components/catalog/nav-tree.tsx` (which
   builds the sidebar nav model) accepts an optional `progress` map
   (`Record<slug, { viewed: boolean; completed: boolean }>`) and renders a small
   badge/checkmark per recipe node when an entry is present; absent data renders
   no badge (today's behavior, unchanged). `workspace` is the thing that computes
   and supplies this map (via its progress hook) at the composition point in
   `app/layout.tsx` where `nav-tree` is invoked; `nav-tree.tsx` itself gains a
   prop, nothing more — `workspace` still never edits
   `components/catalog/recipe-view.tsx` or `run-form/`.

Until `catalog` approves this, `workspace`'s tab dots and nav badges cannot be
built against the real component — only against a local fixture shaped to this
contract. Tracked in Open Questions.

## Tech Stack

- Next.js 15 (App Router), React 19, TypeScript 5.x
- Tailwind CSS v4, shadcn/ui (`tooltip` for truncated tab titles, `button`),
  `lucide-react` (`Plus`, `X`, `Loader2`, `Check`, `CircleAlert` for the status
  dot)
- `zod` — the workspace blob schema
- `crypto.randomUUID()` for tab ids (built in, no dependency)
- Vitest + Testing Library; Playwright for the cross-tab background-run and
  restore-on-reload flows
- No new runtime dependency beyond `zod`, which is already present via
  `catalog`/`settings`

## Commands

```
Install:     bun install
Dev:         bun dev
Build:       bun run build
Lint:        bun run lint
Typecheck:   bun run typecheck
Test:        bun run test
E2E:         bun run test:e2e
```

(Shares the `frontend/` workspace and toolchain with every other frontend
module; package manager and runtime: **bun**.)

## Project Structure

```
frontend/
  app/
    layout.tsx                  # shared file: mounts <TabStrip> in app-shell's
                                 # topbar slot, <TabPanels> in its main slot, and
                                 # passes workspace's progress map into catalog's
                                 # nav-tree() call. Not owned exclusively by any
                                 # one module; workspace's edits here are additive.
  components/
    workspace/
      tab-strip.tsx              # topbar content: list of <TabStripItem>, "+" button
      tab-strip-item.tsx         # title, status dot, close (x), active styling
      tab-panels.tsx             # main-slot content: one <RecipeView> per open
                                  # tab, all mounted, `hidden` toggles visibility
      empty-workspace.tsx        # shown when zero tabs are open (see Open Q's)
  lib/
    workspace/
      schema.ts                  # WorkspaceV1 zod schema, CURRENT_VERSION
      defaults.ts                # emptyWorkspace()
      migrations.ts               # migrate(raw): Stored -> WorkspaceV1
      tabs-reducer.ts             # OPEN_TAB / CLOSE_TAB / ACTIVATE_TAB
      progress.ts                 # markViewed(), markCompleted(), ProgressMap type
  hooks/
    use-tabs.ts                  # useTabs(): [state, actions] over the blob's tab slice
    use-progress.ts              # useProgress(): [progress, { markViewed, markCompleted }]
  tests/
    workspace/
      tabs-reducer.test.ts
      storage.test.ts
      migrations.test.ts
      progress.test.ts
      tab-strip.test.tsx
      tab-panels.test.tsx
  e2e/
    workspace/
      tab-lifecycle.spec.ts      # open/close/switch/restore-on-reload
      background-run.spec.ts     # start a run, switch away, switch back, still streaming
```

`hooks/use-local-storage.ts` is `settings`'; `workspace` imports it rather than
adding a second copy under `hooks/`.

## Code Style

The persisted shape and its schema (`lib/workspace/schema.ts`):

```ts
import { z } from "zod";

export const CURRENT_VERSION = 1 as const;
export const STORAGE_KEY = "skillet.workspace";

const persistedTab = z.object({
  id: z.string(),
  slug: z.string(),
});

const progressEntry = z.object({
  viewedAt: z.number().nullable().default(null),
  completedAt: z.number().nullable().default(null),
});

export const workspaceV1Schema = z.object({
  version: z.literal(CURRENT_VERSION),
  /** Order = tab strip order. */
  tabs: z.array(persistedTab).default([]),
  activeTabId: z.string().nullable().default(null),
  /** recipe slug -> progress. Never stores run output or events. */
  progress: z.record(z.string(), progressEntry).default({}),
});

export type WorkspaceV1 = z.infer<typeof workspaceV1Schema>;
export type PersistedTab = z.infer<typeof persistedTab>;
export type ProgressEntry = z.infer<typeof progressEntry>;
```

The tabs reducer (`lib/workspace/tabs-reducer.ts`) — in-memory tab state; run
output never lives here:

```ts
export interface Tab {
  id: string;
  slug: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

export type TabsAction =
  | { type: "OPEN_TAB"; slug: string }
  | { type: "CLOSE_TAB"; id: string }
  | { type: "ACTIVATE_TAB"; id: string }
  | { type: "RESTORE"; state: TabsState }; // hydrate from localStorage once, post-mount

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "OPEN_TAB": {
      const tab: Tab = { id: crypto.randomUUID(), slug: action.slug };
      return { tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "CLOSE_TAB": {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const wasActive = state.activeTabId === action.id;
      // Prefer the tab that slid into this slot; else the one before it; else none.
      const nextActive = wasActive ? (tabs[idx] ?? tabs[idx - 1] ?? null) : state.activeTabId;
      return { tabs, activeTabId: nextActive?.id ?? nextActive };
    }
    case "ACTIVATE_TAB":
      return state.tabs.some((t) => t.id === action.id)
        ? { ...state, activeTabId: action.id }
        : state;
    case "RESTORE":
      return action.state;
  }
}
```

Closing a tab is a side-effecting operation one layer up from the pure reducer
— the component dispatching `CLOSE_TAB` cancels that tab's run first:

```tsx
// components/workspace/tab-panels.tsx
export function TabPanels({ tabs, activeTabId, onClose }: TabPanelsProps) {
  const handles = useRef(new Map<string, RecipeViewHandle>());

  return (
    <>
      {tabs.map((tab) => (
        <div key={tab.id} hidden={tab.id !== activeTabId} className="contents">
          <RecipeView
            ref={(h) => h && handles.current.set(tab.id, h)}
            slug={tab.slug}
            onStatusChange={(status) => reportStatus(tab.id, status)}
          />
        </div>
      ))}
    </>
  );

  function closeTab(id: string) {
    handles.current.get(id)?.cancelRun();
    handles.current.delete(id);
    onClose(id); // dispatches CLOSE_TAB
  }
}
```

The progress ledger (`lib/workspace/progress.ts`) — pure functions over the
persisted slice, mirroring `settings`' `resolveConfig` style:

```ts
export type ProgressMap = Record<string, { viewedAt: number | null; completedAt: number | null }>;

export function markViewed(progress: ProgressMap, slug: string, now = Date.now()): ProgressMap {
  const existing = progress[slug];
  if (existing?.viewedAt != null) return progress; // set once, never overwritten
  return { ...progress, [slug]: { viewedAt: now, completedAt: existing?.completedAt ?? null } };
}

export function markCompleted(progress: ProgressMap, slug: string, now = Date.now()): ProgressMap {
  const existing = progress[slug];
  return { ...progress, [slug]: { viewedAt: existing?.viewedAt ?? now, completedAt: now } };
}

/** Shape `catalog`'s nav-tree progress prop expects (see Cross-module contract). */
export function toNavBadges(progress: ProgressMap): Record<string, { viewed: boolean; completed: boolean }> {
  return Object.fromEntries(
    Object.entries(progress).map(([slug, p]) => [
      slug,
      { viewed: p.viewedAt != null, completed: p.completedAt != null },
    ]),
  );
}
```

`hooks/use-tabs.ts` composes the reducer with `settings`' `useLocalStorage`,
persisting only `{ tabs, activeTabId }` (never run state) on every change, and
dispatching `RESTORE` once after the initial `localStorage` read resolves
(mirrors the SSR-safe hydration pattern `useLocalStorage` already handles).

Conventions: `PascalCase` components in `kebab-case.tsx` files; named exports;
`"use client"` on the tab strip, tab panels, and both hooks; props typed with an
explicit interface; no `any`; Tailwind class order layout → box → type → color →
state (matches `app-shell`); never store run output, events, or form values in
the persisted blob.

## Testing Strategy

- **Tab lifecycle (the important one) — reducer table (`tabs-reducer.test.ts`):**
  `OPEN_TAB` appends and activates a new tab with a fresh id even for a slug
  already open (duplicate tabs); `CLOSE_TAB` on the active tab activates its
  right neighbor, falling back to its left neighbor, falling back to `null` when
  it was the last tab; `CLOSE_TAB` on an inactive tab leaves `activeTabId`
  unchanged; `ACTIVATE_TAB` on an unknown id is a no-op; `RESTORE` replaces state
  wholesale.
- **Restore-on-reload (`storage.test.ts` + `tab-panels.test.tsx`):** a persisted
  `{ tabs, activeTabId }` round-trips through `localStorage` and rehydrates the
  same tab order and active tab; a tab whose run was mid-stream at reload time
  comes back with status `idle`, never resumes.
- **Background run keeps streaming (`tab-panels.test.tsx` + `background-run.spec.ts`):**
  start a run in tab A, switch the active tab to B, assert A's `<RecipeView>`
  instance is still mounted (not remounted) and its `onStatusChange` continues
  firing while `hidden`; switching back to A shows the run's current
  accumulated output, not a reset one.
- **Cancel-on-close:** closing a tab with a `running` status calls that tab's
  `cancelRun()` exactly once before the tab is removed from state; closing an
  `idle`/`done`/`error` tab does not call `cancelRun()`.
- **Same-tab re-run:** triggering Run while status is `running` in the same tab
  results in exactly one `cancelRun()` call followed by a new run starting;
  output reflects only the new run.
- **Progress computation (`progress.test.ts`):** `markViewed` sets `viewedAt`
  once and is idempotent on repeat calls; `markCompleted` sets/updates
  `completedAt` without disturbing `viewedAt`; a `result` status calls
  `markCompleted`, an `error` status does not; `toNavBadges` maps timestamps to
  the exact `{ viewed, completed }` booleans `catalog`'s nav-tree prop expects.
- **Migration / versioning (`migrations.test.ts`):** an unversioned/legacy blob
  upgrades to `CURRENT_VERSION`; a blob newer than `CURRENT_VERSION` is discarded
  for `emptyWorkspace()`; malformed JSON is discarded for defaults; a valid
  current blob passes through untouched; the blob never contains run output or
  event data (schema has no field for it, and a test asserts unknown extra keys
  are stripped, not silently persisted forward).
- **Status dot rendering (`tab-strip.test.tsx`):** each of `idle` / `running` /
  `done` / `error` renders a visually distinct dot; the dot for a background tab
  updates without that tab being active/visible.
- `lib/workspace/tabs-reducer.ts` and `lib/workspace/progress.ts` target
  **≥ 95% line coverage** — they are the load-bearing logic; no coverage number
  mandated for the tab strip's presentational styling.

## Boundaries

**Always**
- Keep every open tab's `<RecipeView>` mounted for as long as its tab exists;
  toggle visibility, never conditionally unmount an inactive tab.
- Cancel a tab's run (via its imperative handle) before removing it from tab
  state.
- Persist only `{ tabs, activeTabId, progress }` — never run output, event
  payloads, or form/param values.
- Validate the stored blob with the Zod schema on every read; fall back to
  `emptyWorkspace()` without throwing into the UI on any parse failure.
- Reuse `settings`' `useLocalStorage` primitive; do not fork a second one.
- Run `bun run typecheck`, `bun run lint`, `bun run test` before every commit.

**Ask first**
- Changing the `skillet.workspace` blob shape or `CURRENT_VERSION` without a
  migration.
- Requesting the `catalog` amendment in this spec's Cross-module contract
  section (new `<RecipeView>` props, the `nav-tree` progress prop) — coordinate
  with whoever owns `catalog` before implementing against it.
- Adding a runtime dependency.
- Capping the number of open tabs, or changing the duplicate-tabs policy (both
  currently unbounded / allowed).

**Never**
- Modify `components/shell/` or `components/catalog/` (aside from the proposed,
  explicitly-flagged `nav-tree.tsx` prop and `<RecipeView>` surface amendment,
  which needs `catalog`'s sign-off, not a silent edit).
- Parse or render SSE events directly — that stays behind `<RecipeView>` /
  `execution`'s `<RunOutput>`.
- Resume or auto-reconnect a run that was streaming at the moment of a reload.
- Write a recipe's run output, params, or any learner-entered value to
  `localStorage`.
- Let closing or switching tabs silently leak a background `AbortController`
  (every close path must reach `cancelRun()`).

## Success Criteria

1. Opening the same recipe twice produces two independent tabs, each with its
   own run state; running one does not affect the other.
2. Starting a run in tab A, switching to tab B and then C, and returning to A
   shows A's run having continued streaming the whole time, with A's tab dot
   having reflected `running` → `done`/`error` even while A was inactive.
3. Closing a tab whose run is in flight calls that run's cancellation exactly
   once; the backend/task-level effects of that are `execution`'s existing
   disconnect-cancels-run guarantee, invoked deliberately rather than left to
   unmount timing.
4. Reloading the page restores the same open tabs, in the same order, with the
   same tab active; no tab attempts to resume a run that was streaming at reload
   time.
5. Pressing Run again in a tab that is already streaming cancels that run and
   starts the new one; the output shown is only the new run's.
6. A recipe's first successful (non-error, terminal `result`) run sets
   `completedAt` for its slug; opening it (without running it) sets only
   `viewedAt`; both survive a `localStorage` round-trip and a schema migration
   from an unversioned blob.
7. A corrupt or newer-than-`CURRENT_VERSION` `skillet.workspace` blob is
   discarded for `emptyWorkspace()` without throwing; the workspace renders with
   zero tabs rather than crashing.
8. `workspace` fills `app-shell`'s topbar and main slots without editing
   `components/shell/`, and mounts `catalog`'s `<RecipeView>` without editing
   `components/catalog/` beyond the explicitly-flagged, sign-off-gated
   amendment in this spec's Cross-module contract section.

## Open Questions

1. ~~`catalog` sign-off on the Cross-module contract amendment.~~ **Resolved:
   approved** — see `catalog`'s Cross-module contract section.
2. ~~Max number of open tabs.~~ **Resolved: unbounded for v1**, revisit if it
   proves a problem on low-end devices.
3. ~~Closing the last tab.~~ **Resolved: `<EmptyWorkspace>`** with a link into
   the catalog index, keeping the tab strip's empty state visually distinct from
   browsing.
4. ~~Drag-to-reorder tabs.~~ **Resolved: not in v1**; the reducer's array order
   supports adding it later without a state-shape change.
5. ~~Exact progress semantics on re-run.~~ **Resolved: keep it minimal** —
   `completedAt` is simply overwritten on every successful run; the boolean
   badge never changes once true. Revisit only if a concrete UI need for more
   (attempt counts, "last run at") emerges.
6. ~~Partial/attempted vs. only-fully-completed marks.~~ **Resolved: as
   specified** — only `viewed` and `completed`, no third "attempted" state.
