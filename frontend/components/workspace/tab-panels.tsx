"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { RecipeView, type RecipeViewHandle } from "@/app/r/[slug]/recipe-view";
import type { RunStatus } from "@/hooks/use-recipe-run";
import type { Tab } from "@/lib/workspace/tabs-reducer";

export interface TabPanelsProps {
  /** Open tabs, in tab-strip order — from `useTabs()`'s `TabsState.tabs` (Task 9 owns the hook, not this component). */
  tabs: Tab[];
  activeTabId: string | null;
  /**
   * Invoked once a tab has finished its own cancel-then-cleanup sequence
   * inside `closeTab` (see `TabPanelsHandle` below) — wire this to
   * `useTabs()`'s `closeTab` action so the id is actually removed from tab
   * state. This component never calls it on its own initiative; only
   * `closeTab` (below) calls it, and only after cancellation has already
   * happened.
   */
  onClose: (id: string) => void;
  /**
   * Fired with `(tab.id, status)` whenever THAT tab's own `<RecipeView>`
   * reports a `useRecipeRun` status transition (see
   * `RunOutputProps.onStatusChange`'s doc comment for exactly which
   * transitions fire it — notably not the initial mount `"idle"`). Each
   * tab's callback closes over its own `tab.id`, so a background tab's
   * status change is reported with that tab's id even while another tab is
   * active. Optional: the tab strip's status dot and the progress ledger's
   * `markCompleted` write both live one layer up (Task 9's composition
   * point), not in this presentational component.
   */
  onStatusChange?: (tabId: string, status: RunStatus) => void;
}

/**
 * Imperative handle `TabPanels` exposes so a close affordance living
 * OUTSIDE this component (`tab-strip-item.tsx`'s close button, wired up at
 * Task 9's composition point) can trigger the real close-with-cancellation
 * sequence, rather than this component rendering its own close button or
 * the parent bypassing cancellation by calling the `onClose` prop directly.
 *
 * This is the concrete answer to the spec's own Code Style sample being
 * incomplete on "how does `closeTab` get called from outside": the sample
 * defines a local `closeTab` function but never shows it wired to anything.
 * Exposing it via `useImperativeHandle` (option (a) from this module's own
 * task notes) keeps "cancel runs before the tab is removed from state" a
 * guarantee enforced by code INSIDE this component — the caller cannot
 * accidentally skip cancellation by calling `onClose` on its own, because
 * `onClose` is only ever invoked by `closeTab` itself, never expected to be
 * called directly by a consumer.
 */
export interface TabPanelsHandle {
  /**
   * Cancels `id`'s run if (and only if) that tab's last known status was
   * `"running"`, forgets its registry entries, then calls the `onClose`
   * prop. See this file's top-level doc comment for why the cancel call is
   * status-guarded rather than unconditional.
   */
  closeTab: (id: string) => void;
}

/**
 * The tab-panel host: mounts every open tab's `<RecipeView slug={tab.slug}>`
 * AT ALL TIMES for as long as that tab exists in `tabs`, toggling only the
 * `hidden` attribute to switch which one is visible — never a conditional
 * `{active && <RecipeView/>}`. This is Confirmed Decision 2 of
 * `SPEC-workspace.md` and the core guarantee of the whole `workspace`
 * module: because `<RecipeView>` owns its own `useRecipeRun` internally, a
 * mounted-but-hidden tab keeps its `AbortController` and event stream alive
 * across a tab switch with no separate run registry needed here.
 *
 * `className="contents"` on each wrapper `div` means the wrapper
 * contributes no layout box of its own (its children lay out as if the
 * `div` weren't there) — `hidden` still works on a `display: contents`
 * element to remove it (and its children) from rendering entirely, so this
 * costs nothing visually while still giving each tab's `<RecipeView>` a
 * stable, keyable DOM position.
 *
 * ## Deciding unconditional vs. status-guarded `cancelRun()`
 *
 * The spec's own Code Style sample calls `handles.current.get(id)?.cancelRun()`
 * unconditionally inside `closeTab`, with no status check — and that would
 * be harmless in practice, since `execution`'s own `useRecipeRun().cancel()`
 * is already a no-op when nothing is in flight (confirmed in that module's
 * own test suite). This implementation instead tracks each tab's own last
 * reported `RunStatus` (via the same `onStatusChange` callback this
 * component already wires per tab) and only calls `cancelRun()` when that
 * tab's last known status was `"running"` — matching this module's own task
 * list, whose acceptance criteria explicitly distinguish "a `running`-status
 * tab's close calls `cancelRun()`" from "an `idle`/`done`/`error` tab's
 * close does not," verified by a spy call count, not just "didn't throw."
 * A tab that never reported a status (never ran) is treated the same as
 * `"idle"` for this purpose — no status was ever recorded, so no cancel.
 */
export const TabPanels = forwardRef<TabPanelsHandle, TabPanelsProps>(function TabPanels(
  { tabs, activeTabId, onClose, onStatusChange },
  ref
) {
  // Ref registries, not state: neither the handle map nor the status map
  // should ever cause a re-render on their own — they're read only at the
  // moment a tab is closed, from an event handler, not during render.
  const handles = useRef(new Map<string, RecipeViewHandle>());
  const statuses = useRef(new Map<string, RunStatus>());

  const closeTab = useCallback(
    (id: string) => {
      if (statuses.current.get(id) === "running") {
        handles.current.get(id)?.cancelRun();
      }
      handles.current.delete(id);
      statuses.current.delete(id);
      onClose(id); // dispatches CLOSE_TAB (via whatever `useTabs().closeTab` the caller bound this to)
    },
    [onClose]
  );

  useImperativeHandle(ref, () => ({ closeTab }), [closeTab]);

  return (
    <>
      {tabs.map((tab) => (
        <div key={tab.id} hidden={tab.id !== activeTabId} className="contents">
          <RecipeView
            ref={(handle) => {
              // Fixed from the spec's own sample, which only ever adds to
              // the map (`h && handles.current.set(...)`) and never removes
              // a stale entry on unmount — harmless for the close path
              // (`closeTab` above already deletes proactively before this
              // tab's own unmount even runs), but still a real leak for any
              // other path that removes a tab without going through
              // `closeTab` first.
              if (handle) handles.current.set(tab.id, handle);
              else handles.current.delete(tab.id);
            }}
            slug={tab.slug}
            onStatusChange={(status) => {
              statuses.current.set(tab.id, status);
              onStatusChange?.(tab.id, status);
            }}
          />
        </div>
      ))}
    </>
  );
});
