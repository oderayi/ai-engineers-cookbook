"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A single boolean persisted to localStorage, read/written via
 * `useSyncExternalStore` — localStorage is a genuine external store, so this
 * is the correct primitive for it (not a `useState` + `useEffect` sync,
 * which both risks a hydration mismatch and trips the
 * `react-hooks/set-state-in-effect` lint rule; see `theme-toggle.tsx` for
 * the same idiom applied to SSR-mount detection).
 *
 * No schema/versioning here — this is for a single throwaway UI
 * preference (e.g. "is the sidebar collapsed"). Once more than one related
 * value needs to persist together, move to `settings`' versioned-blob
 * pattern instead of growing this into one.
 */
export function useLocalStorageBoolean(
  key: string,
  defaultValue: boolean
): readonly [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const getSnapshot = useCallback((): boolean => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? defaultValue : raw === "true";
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

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

  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(getSnapshot()) : next;
      try {
        window.localStorage.setItem(key, String(resolved));
      } catch {
        // private mode / quota exceeded — the in-memory value below still
        // updates for this session via the dispatched event.
      }
      // A real `storage` event only fires in *other* tabs/documents, never
      // the one that made the change — dispatch one locally so this
      // component's own useSyncExternalStore subscription re-renders too.
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key, getSnapshot]
  );

  return [value, setValue] as const;
}
