import { emptySettings } from "./defaults";
import { migrate } from "./migrations";
import { settingsV1Schema, type SettingsV1 } from "./schema";

/** The single localStorage key the whole settings blob lives under. */
export const STORAGE_KEY = "skillet.settings";

/** Always returns a fresh object so callers can't mutate a shared fallback. */
function fallbackSettings(): SettingsV1 {
  return emptySettings();
}

/**
 * Reads and validates the persisted settings blob.
 *
 * Any failure — no window/localStorage (SSR), missing key, malformed JSON,
 * `migrate()` throwing (future-versioned or unsalvageable blob), or schema
 * validation failing — falls back to defaults. This function never throws.
 */
export function read(): SettingsV1 {
  try {
    if (typeof window === "undefined") return fallbackSettings();

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallbackSettings();

    const parsed: unknown = JSON.parse(raw);
    const migrated = migrate(parsed);

    const result = settingsV1Schema.safeParse(migrated);
    if (!result.success) return fallbackSettings();

    return result.data;
  } catch {
    return fallbackSettings();
  }
}

/**
 * Best-effort persistence — matches `useLocalStorage`'s own posture.
 * Swallows write failures (private mode, quota exceeded, no window/SSR).
 */
export function write(settings: SettingsV1): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota exceeded — best-effort persistence only */
  }
}

/** Removes the stored blob. Best-effort, like `write()`. */
export function clear(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode — ignore */
  }
}
