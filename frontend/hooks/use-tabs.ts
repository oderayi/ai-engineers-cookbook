"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { emptyWorkspace } from "@/lib/workspace/defaults";
import { migrate } from "@/lib/workspace/migrations";
import { STORAGE_KEY, type WorkspaceV1 } from "@/lib/workspace/schema";
import { tabsReducer, type TabsState } from "@/lib/workspace/tabs-reducer";

export interface TabsActions {
  openTab: (slug: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
}

/**
 * Turns a raw `localStorage` string into a valid `WorkspaceV1`, mirroring
 * `useSettings`' own `parseSettings` shape: `JSON.parse` + `migrate()`,
 * never throwing (an unparseable string or a migrate() failure both resolve
 * to `emptyWorkspace()`).
 */
function parseWorkspace(raw: string): WorkspaceV1 {
  try {
    const parsed: unknown = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return emptyWorkspace();
  }
}

// Module-level constant (not re-allocated per render) so the "still the
// pristine pre-hydration render" check below (`state === INITIAL_TABS_STATE`)
// is a reliable reference-identity check: `tabsReducer`'s `RESTORE` case
// always returns a *new* object (`action.state`), so it is never `===` this
// constant, however similar its values.
const INITIAL_TABS_STATE: TabsState = { tabs: [], activeTabId: null };

/**
 * `useTabs(): [state, actions]` — composes the pure `tabsReducer` (in-memory
 * tab state: open/close/activate) with `settings`' real, generic
 * `useLocalStorage<T>` hook (persistence into the shared `skillet.workspace`
 * blob), per SPEC-workspace.md's Confirmed Decision 9 and Code Style note.
 *
 * ## Hydration
 *
 * `useReducer` starts at `INITIAL_TABS_STATE` (`{ tabs: [], activeTabId: null }`)
 * on every render — server and client alike — so the very first paint never
 * depends on `localStorage` and can't hydration-mismatch. A mount-only effect
 * (empty dependency array — see "Why a direct read, not `workspace`" below)
 * then reads `window.localStorage` directly, once, and dispatches a single
 * `RESTORE` action with the parsed `{ tabs, activeTabId }` slice (or does
 * nothing if there's genuinely nothing stored — the reducer's own initial
 * state is already correct for a fresh visitor).
 *
 * ### Why a direct read, not the reactive `workspace` value — a real bug found the hard way
 *
 * An earlier version of this effect watched `useLocalStorage`'s own reactive
 * `workspace` value (gated on `workspace !== fallback`, to survive
 * `getServerSnapshot` returning the SSR `fallback` for the client's first
 * hydration-matching render too — `useSyncExternalStore`'s documented
 * behavior). That fixed the SSR case, but it re-opened a worse, genuinely
 * reproducible race, caught by `tests/workspace/workspace-shell.test.tsx`:
 * `workspace-shell.tsx`'s `openTab` calls `tabActions.openTab(slug)`
 * (updates this hook's reducer only, synchronously) immediately followed by
 * `progressActions.markViewed(slug)` — a call into `use-progress.ts`'s
 * OWN, independent `useLocalStorage(STORAGE_KEY, ...)` subscription (same
 * key, separate cache). That second call's own read-modify-write reads
 * `localStorage` *before* this hook's persist effect (below) has had a
 * chance to flush the just-added tab into it, so it writes back
 * `{ tabs: [], ...,  progress: {...} }` — a correct progress update, but
 * carrying a STALE, pre-tab `tabs`. That write's synthetic `storage` event
 * reaches this hook's own `useLocalStorage` subscription too (same key), so
 * `workspace` changes reference — and the old effect, watching exactly that,
 * interpreted this stale sibling write as "the real hydrated data" and
 * dispatched `RESTORE` with its empty `tabs`, wiping out the tab that had
 * just been opened moments earlier.
 *
 * Reading `localStorage` directly, once, on mount (`[]` deps) sidesteps this
 * entirely: nothing about a sibling hook's later write to the same key can
 * ever cause this effect to run again, because it depends on nothing
 * reactive at all. It only ever reads the real, synchronous, always-available
 * `window.localStorage` — a plain browser API — which is exactly as valid a
 * source of truth immediately post-hydration (when this effect actually
 * runs) as `useLocalStorage`'s own `getSnapshot` would have been.
 *
 * ## Persistence without clobbering `progress`
 *
 * Every subsequent `{ tabs, activeTabId }` change (from `openTab`/`closeTab`/
 * `activateTab`) is written back into the SAME `skillet.workspace` blob via
 * `useLocalStorage`'s **functional updater** form —
 * `setWorkspace((prev) => ({ ...prev, tabs, activeTabId }))` — never a bare
 * `setWorkspace({ tabs, activeTabId, ... })`. `useLocalStorage`'s `set`
 * resolves a functional updater by calling `getSnapshot()` fresh at the
 * moment of the call (see `hooks/use-local-storage.ts`), i.e. it re-reads
 * `localStorage` right before writing rather than closing over a stale
 * render-time value — the same shape as `useState`'s `setState(prev => ...)`.
 * That `prev` carries whatever `progress` a concurrent writer (the sibling
 * `use-progress.ts` hook, next task) already wrote, so spreading `...prev`
 * and only overwriting `tabs`/`activeTabId` here can never lose a `progress`
 * write that landed between this hook's last render and this write — there
 * is no read-modify-write window against a value this hook itself cached.
 *
 * The persist effect skips the pristine pre-hydration render (`state ===
 * INITIAL_TABS_STATE`, a reference-identity check against the module-level
 * constant above) so it never fires before `RESTORE` has run — otherwise it
 * would overwrite a real stored `{ tabs, activeTabId }` with the reducer's
 * empty starting state on mount.
 */
export function useTabs(): readonly [TabsState, TabsActions] {
  // Stable across this hook's lifetime: `useLocalStorage`'s `getSnapshot`
  // must return the exact same reference on repeated calls when nothing is
  // stored, and `emptyWorkspace()` allocates a fresh object every call.
  const fallback = useMemo(() => emptyWorkspace(), []);

  const [, setWorkspace] = useLocalStorage<WorkspaceV1>(STORAGE_KEY, fallback, parseWorkspace);

  const [state, dispatch] = useReducer(tabsReducer, INITIAL_TABS_STATE);

  useEffect(() => {
    // Deliberately NOT `useLocalStorage`'s reactive `workspace` value — see
    // this hook's own doc comment above ("Why a direct read, not the
    // reactive `workspace` value") for the real race this sidesteps. `[]`
    // deps: this runs exactly once per mount, full stop, regardless of any
    // later write (this hook's own persist effect below, `use-progress.ts`'s
    // sibling subscription to the same key, or a genuine cross-tab `storage`
    // event) — none of those can ever cause a second restore.
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (raw === null) return; // nothing stored — the reducer's own initial state is already correct
    const parsed = parseWorkspace(raw);
    dispatch({
      type: "RESTORE",
      state: { tabs: parsed.tabs, activeTabId: parsed.activeTabId },
    });
  }, []);

  useEffect(() => {
    if (state === INITIAL_TABS_STATE) return; // pre-hydration render — nothing to persist yet
    setWorkspace((prev) => ({ ...prev, tabs: state.tabs, activeTabId: state.activeTabId }));
  }, [state, setWorkspace]);

  const openTab = useCallback((slug: string) => {
    dispatch({ type: "OPEN_TAB", slug });
  }, []);

  const closeTab = useCallback((id: string) => {
    dispatch({ type: "CLOSE_TAB", id });
  }, []);

  const activateTab = useCallback((id: string) => {
    dispatch({ type: "ACTIVATE_TAB", id });
  }, []);

  const actions = useMemo(() => ({ openTab, closeTab, activateTab }), [openTab, closeTab, activateTab]);

  return [state, actions] as const;
}
