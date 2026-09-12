"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

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
 * then reads whatever `useLocalStorage` already resolved (its `getSnapshot`
 * is synchronous on the client, so by the time this effect runs post-mount
 * the real stored value — parsed and `migrate()`-d into a `WorkspaceV1` — is
 * already available, not still the SSR `fallback`) and dispatches a single
 * `RESTORE` action with its `{ tabs, activeTabId }` slice. A ref guards this
 * to fire exactly once per mount, regardless of how many times the
 * `useLocalStorage` value reference changes afterward (e.g. a cross-tab
 * `storage` event).
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

  const [workspace, setWorkspace] = useLocalStorage<WorkspaceV1>(STORAGE_KEY, fallback, parseWorkspace);

  const [state, dispatch] = useReducer(tabsReducer, INITIAL_TABS_STATE);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    dispatch({
      type: "RESTORE",
      state: { tabs: workspace.tabs, activeTabId: workspace.activeTabId },
    });
    // `restoredRef` (not the dependency array) is what enforces "exactly
    // once" here -- `workspace` is listed as a real dependency (satisfying
    // the lint rule with no suppression needed) precisely because that's
    // harmless: the ref guard makes every invocation after the first a
    // no-op, so `workspace` changing later (a cross-tab storage event, or
    // this same hook's own persist writes) never re-triggers a restore, it
    // just re-runs the effect body down to the guard and returns.
  }, [workspace]);

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
