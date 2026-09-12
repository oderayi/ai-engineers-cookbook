"use client";

import { useCallback, useMemo } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { emptyWorkspace } from "@/lib/workspace/defaults";
import { migrate } from "@/lib/workspace/migrations";
import { markCompleted, markViewed, type ProgressMap } from "@/lib/workspace/progress";
import { STORAGE_KEY, type WorkspaceV1 } from "@/lib/workspace/schema";

export interface ProgressActions {
  markViewed: (slug: string) => void;
  markCompleted: (slug: string) => void;
}

/**
 * Turns a raw `localStorage` string into a valid `WorkspaceV1`. Identical in
 * shape to `use-tabs.ts`'s own `parseWorkspace` (this hook cannot import that
 * one without reaching into a sibling hook module's internals, and each hook
 * is independently a `useLocalStorage<WorkspaceV1>(STORAGE_KEY, ...)` caller
 * per that hook's own contract, so the tiny duplication mirrors, rather than
 * forks, the pattern): `JSON.parse` + `migrate()`, never throwing (an
 * unparseable string or a `migrate()` failure both resolve to
 * `emptyWorkspace()`).
 */
function parseWorkspace(raw: string): WorkspaceV1 {
  try {
    const parsed: unknown = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return emptyWorkspace();
  }
}

/**
 * `useProgress(): [progress, { markViewed, markCompleted }]` — composes the
 * pure `lib/workspace/progress.ts` transforms with `settings`' real, generic
 * `useLocalStorage<T>` hook, per SPEC-workspace.md's Confirmed Decision 9.
 *
 * ## Same blob, disjoint slice, no reducer needed
 *
 * This hook calls `useLocalStorage<WorkspaceV1>(STORAGE_KEY, ...)` itself —
 * a second, independent subscription to the exact same `skillet.workspace`
 * key `use-tabs.ts` also subscribes to. That's safe: `useLocalStorage` is
 * built on `useSyncExternalStore` with its own per-instance cache (a
 * `useRef`) and its own `subscribe`, which listens for the `storage` window
 * event — including the *synthetic* one `set`/`clear` dispatch locally (see
 * `hooks/use-local-storage.ts`'s own doc comment and `set` implementation).
 * So a write from `use-tabs.ts`'s `setWorkspace` call fires a `storage`
 * event that *this* hook's `subscribe` also receives, re-running its
 * `getSnapshot` and re-rendering with the fresh value — and vice versa.
 * Two independent hook instances, one shared key, each fully in sync.
 *
 * Unlike `use-tabs.ts`, there is no in-memory reducer or mount-only
 * `RESTORE` hydration effect here: `progress.ts`'s functions
 * (`markViewed`/`markCompleted`) are simple pure transforms over whatever
 * `ProgressMap` is already in the stored blob, so the value returned here is
 * always just `workspace.progress` straight off `useLocalStorage` — nothing
 * to separately hydrate.
 *
 * ## Writing without clobbering `tabs`/`activeTabId`
 *
 * `markViewed`/`markCompleted` both write back into the SAME blob via
 * `useLocalStorage`'s **functional updater** form —
 * `setWorkspace((prev) => ({ ...prev, progress: markViewed(prev.progress, slug) }))`
 * — never a bare `setWorkspace({ progress, ... })`. `useLocalStorage`'s
 * `set` resolves a functional updater by calling `getSnapshot()` fresh at
 * the moment of the call, i.e. it re-reads `localStorage` right before
 * writing rather than closing over a stale render-time value. That `prev`
 * carries whatever `tabs`/`activeTabId` a concurrent writer (`use-tabs.ts`)
 * already wrote, so spreading `...prev` and only overwriting `progress`
 * here can never lose a `tabs`/`activeTabId` write that landed between this
 * hook's last render and this write — the exact mirror image of
 * `use-tabs.ts`'s own write-race-safe pattern.
 */
export function useProgress(): readonly [ProgressMap, ProgressActions] {
  // Stable across this hook's lifetime: `useLocalStorage`'s `getSnapshot`
  // must return the exact same reference on repeated calls when nothing is
  // stored, and `emptyWorkspace()` allocates a fresh object every call.
  const fallback = useMemo(() => emptyWorkspace(), []);

  const [workspace, setWorkspace] = useLocalStorage<WorkspaceV1>(STORAGE_KEY, fallback, parseWorkspace);

  const handleMarkViewed = useCallback(
    (slug: string) => {
      setWorkspace((prev) => ({ ...prev, progress: markViewed(prev.progress, slug) }));
    },
    [setWorkspace]
  );

  const handleMarkCompleted = useCallback(
    (slug: string) => {
      setWorkspace((prev) => ({ ...prev, progress: markCompleted(prev.progress, slug) }));
    },
    [setWorkspace]
  );

  const actions = useMemo(
    () => ({ markViewed: handleMarkViewed, markCompleted: handleMarkCompleted }),
    [handleMarkViewed, handleMarkCompleted]
  );

  return [workspace.progress, actions] as const;
}
