"use client";

import { useCallback, useMemo } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { emptySettings } from "@/lib/settings/defaults";
import { migrate } from "@/lib/settings/migrations";
import type { SettingsV1 } from "@/lib/settings/schema";
import { STORAGE_KEY } from "@/lib/settings/storage";

export interface SettingsActions {
  setGlobalKey: (envKey: string, value: string) => void;
  setBackendUrl: (url: string) => void;
  setOverride: (slug: string, envKey: string, value: string) => void;
  clearOverride: (slug: string, envKey: string) => void;
  clearAll: () => void;
}

/**
 * Turns a raw `localStorage` string into a valid `SettingsV1`, running the
 * same migration + schema pipeline `storage.ts`'s `read()` uses. Never
 * throws: an unparseable string, a `migrate()` failure (unsalvageable or
 * from-the-future blob), or a schema-invalid shape all resolve to a fresh
 * `emptySettings()` rather than surfacing an error to the UI.
 */
function parseSettings(raw: string): SettingsV1 {
  try {
    const parsed: unknown = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return emptySettings();
  }
}

/**
 * `useSettings(): [settings, actions]` — the settings state hook the UI
 * consumes, composing `useLocalStorage` (Task 3) with the schema, storage
 * key, migration runner, and default constructor from the rest of Phase 1.
 *
 * Each action is a narrow, single-purpose updater rather than a generic
 * `setSettings`, so callers (the UI components in later tasks) can't
 * accidentally clobber an unrelated slice of the blob with a stale copy.
 *
 * `setOverride`/`setGlobalKey` store whatever key/value they're given
 * without validating the key against a recipe's declared env vars — that
 * enforcement lives in the UI (only declared keys ever get a field to type
 * into), matching `resolveConfig`'s own posture of trusting its caller.
 */
export function useSettings(): readonly [SettingsV1, SettingsActions] {
  // Stable across this hook's lifetime: `useLocalStorage`'s `getSnapshot`
  // must return the exact same reference on repeated calls when nothing is
  // stored, and `emptySettings()` allocates a fresh object every call.
  const fallback = useMemo(() => emptySettings(), []);

  const [settings, setSettings, clearStorage] = useLocalStorage<SettingsV1>(
    STORAGE_KEY,
    fallback,
    parseSettings
  );

  const setGlobalKey = useCallback(
    (envKey: string, value: string) => {
      setSettings((prev) => ({ ...prev, global: { ...prev.global, [envKey]: value } }));
    },
    [setSettings]
  );

  // Stored verbatim, not re-normalized (e.g. trailing-slash stripping) on
  // every keystroke — fighting a controlled input's value while the user is
  // still typing a URL would be janky. Normalization happens the next time
  // the blob is actually re-parsed (schema's `backendUrl.transform`).
  const setBackendUrl = useCallback(
    (url: string) => {
      setSettings((prev) => ({ ...prev, customBackendUrl: url }));
    },
    [setSettings]
  );

  const setOverride = useCallback(
    (slug: string, envKey: string, value: string) => {
      setSettings((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          [slug]: { ...prev.overrides[slug], [envKey]: value },
        },
      }));
    },
    [setSettings]
  );

  const clearOverride = useCallback(
    (slug: string, envKey: string) => {
      setSettings((prev) => {
        const slugOverrides = { ...prev.overrides[slug] };
        delete slugOverrides[envKey];
        return { ...prev, overrides: { ...prev.overrides, [slug]: slugOverrides } };
      });
    },
    [setSettings]
  );

  const clearAll = useCallback(() => {
    clearStorage();
  }, [clearStorage]);

  const actions = useMemo(
    () => ({ setGlobalKey, setBackendUrl, setOverride, clearOverride, clearAll }),
    [setGlobalKey, setBackendUrl, setOverride, clearOverride, clearAll]
  );

  return [settings, actions] as const;
}
