import { CURRENT_VERSION, type SettingsV1 } from "@/lib/settings/schema";

/**
 * The canonical "nothing configured yet" settings object. Other parts of the
 * module (the `useSettings` hook, the storage layer) fall back to this when
 * there is no persisted blob, or the persisted blob is unreadable/invalid.
 *
 * Returns a fresh object on every call (never a shared reference) so a
 * caller mutating the result can never affect another caller's copy.
 */
export function emptySettings(): SettingsV1 {
  return {
    version: CURRENT_VERSION,
    global: {},
    customBackendUrl: "",
    overrides: {},
  };
}
