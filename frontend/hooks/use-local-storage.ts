"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A generic, SSR-safe, cross-tab-synced `localStorage` slot for an arbitrary
 * value of type `T`, with a caller-supplied — typically Zod-backed — `parse`
 * function rather than the hook assuming any particular shape. Contrast with
 * `useLocalStorageBoolean`, which specializes this same idiom for a single
 * throwaway boolean UI preference with a hardcoded parser.
 *
 * Built on `useSyncExternalStore`, matching `useLocalStorageBoolean` and
 * `theme-toggle.tsx`'s mount guard elsewhere in this codebase:
 * `localStorage` is a genuine external store, so this is the correct
 * primitive for it, and it avoids the `react-hooks/set-state-in-effect`
 * pitfall a `useState` + `useEffect` hydration effect hits outright, rather
 * than suppressing it.
 *
 * - **SSR-safe:** `getServerSnapshot` returns `fallback` for the server
 *   render; `getSnapshot` reads the real value on the client. React
 *   reconciles the two without a hydration-mismatch warning or an extra
 *   fallback-then-hydrated render.
 * - **Caller-supplied `parse`:** deserialization and validation are entirely
 *   the caller's concern, so this hook stays generic over `T` and never
 *   guesses at a shape — a bad or legacy blob is exactly as much this hook's
 *   problem as a network response's shape is `fetch`'s.
 * - **Cross-tab sync:** the browser fires a `storage` event in every *other*
 *   tab/document on the same origin when `key` changes there (never in the
 *   tab that made the change) — `set`/`clear` dispatch a synthetic one
 *   locally too, so this hook's own subscription re-renders immediately
 *   (the same trick `useLocalStorageBoolean` uses).
 * - **Resilient to failures:** private browsing, storage quota, or a
 *   corrupted blob can all make `getItem` / `setItem` / `removeItem` throw.
 *   Every access is wrapped in try/catch so a failure degrades to
 *   session-only in-memory state instead of crashing the caller.
 *
 * For a single, schema-free boolean preference (e.g. "is the sidebar
 * collapsed"), prefer `useLocalStorageBoolean` instead of reaching for this.
 */
export function useLocalStorage<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T
): readonly [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const getSnapshot = useCallback((): T => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : parse(raw);
    } catch {
      return fallback;
    }
  }, [key, fallback, parse]);

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = (event: StorageEvent) => {
        if (event.key === null || event.key === key) onStoreChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    [key]
  );

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(getSnapshot()) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* private mode / quota — the dispatched event below still updates
           this hook's own subscribers for the current session */
      }
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key, getSnapshot]
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, [key]);

  return [value, set, clear] as const;
}
