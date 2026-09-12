"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

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
 * - **Cached by raw string, not re-parsed every call:** `useSyncExternalStore`
 *   requires `getSnapshot` to return a referentially *stable* value when the
 *   store hasn't changed — React checks this on every render (not just ones
 *   the store itself triggers) and throws "The result of getSnapshot should
 *   be cached to avoid an infinite loop" otherwise. A `parse` that allocates
 *   a new object per call (true of every real, Zod-backed `parse` this hook
 *   is built for) would violate that if `getSnapshot` re-parsed on every
 *   invocation, so the last raw string and its parsed result are cached in a
 *   ref and only re-parsed when the raw string actually changes. `fallback`
 *   itself must be a stable reference across the caller's renders for the
 *   same reason (memoize it, e.g. `useMemo`, if it isn't already constant).
 *
 * For a single, schema-free boolean preference (e.g. "is the sidebar
 * collapsed"), prefer `useLocalStorageBoolean` instead of reaching for this.
 */
export function useLocalStorage<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T
): readonly [T, (next: T | ((prev: T) => T)) => void, () => void] {
  // `raw: undefined` (not `null`) as the initial sentinel so the very first
  // real read — even one where `getItem` legitimately returns `null` — is
  // never mistaken for a cache hit.
  const cacheRef = useRef<{ raw: string | null | undefined; value: T }>({
    raw: undefined,
    value: fallback,
  });

  const getSnapshot = useCallback((): T => {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }

    if (raw === cacheRef.current.raw) return cacheRef.current.value;

    let value: T;
    if (raw === null) {
      value = fallback;
    } else {
      try {
        value = parse(raw);
      } catch {
        value = fallback;
      }
    }

    cacheRef.current = { raw, value };
    return value;
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
      const serialized = JSON.stringify(resolved);
      let wrote = true;
      try {
        window.localStorage.setItem(key, serialized);
      } catch {
        wrote = false; // private mode / quota — in-memory state still updates below
      }
      // Cache is updated directly with `resolved` rather than left for the
      // next `getSnapshot` call to re-derive: if the write above failed, the
      // real `localStorage` entry is unchanged, so re-reading it would just
      // hand back the *old* raw string and silently drop this update.
      const actualRaw = wrote
        ? serialized
        : (() => {
            try {
              return window.localStorage.getItem(key);
            } catch {
              return null;
            }
          })();
      cacheRef.current = { raw: actualRaw, value: resolved };
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key, getSnapshot]
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore — in-memory state still resets to fallback below */
    }
    let actualRaw: string | null;
    try {
      actualRaw = window.localStorage.getItem(key);
    } catch {
      actualRaw = null;
    }
    cacheRef.current = { raw: actualRaw, value: fallback };
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, [key, fallback]);

  return [value, set, clear] as const;
}
