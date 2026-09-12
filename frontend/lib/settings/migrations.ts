import { CURRENT_VERSION, settingsV1Schema, type SettingsV1 } from "./schema";

/**
 * Forward-only migration runner for the `skillet.settings` blob (see
 * docs/SPEC-settings.md, Confirmed Decision 11). Turns ANY stored shape —
 * an old version, an unversioned/legacy blob, or an already-current blob —
 * into a valid `SettingsV1`, or throws if it is fundamentally unsalvageable.
 * `storage.ts` is responsible for catching that throw and falling back to
 * defaults; this module never does that itself.
 *
 * There is no real "version 0" shape defined anywhere yet in this greenfield
 * project (CURRENT_VERSION is 1), so "legacy/unversioned" is treated as: an
 * object with no `version` field (or a non-current, non-future one) whose
 * `global`/`customBackendUrl`/`overrides` fields, if present, are assumed to
 * already be in the current shape. We stamp `version: 1` onto it and let
 * `settingsV1Schema` be the actual arbiter of validity.
 *
 * Each step below is a small, independently-testable pure function.
 */

/** Narrows to a non-null, non-array object — the only shape migration steps operate on. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the numeric `version` field off a raw object, if present and a number. */
export function extractVersion(raw: Record<string, unknown>): number | undefined {
  return typeof raw.version === "number" ? raw.version : undefined;
}

/**
 * Throws when `version` is a number greater than `CURRENT_VERSION` — a
 * "blob from the future". Migration never tries to guess at a shape it
 * doesn't know yet; `storage.ts` discards these to defaults.
 */
export function assertNotFromFuture(version: number | undefined): void {
  if (typeof version === "number" && version > CURRENT_VERSION) {
    throw new Error(
      `Settings blob has version ${version}, which is newer than the supported CURRENT_VERSION (${CURRENT_VERSION}).`
    );
  }
}

/**
 * Upgrades a legacy/unversioned (or non-current, non-future) blob by
 * stamping the current version onto it, assuming any `global` /
 * `customBackendUrl` / `overrides` fields already present are roughly
 * current-shaped. Final validity is still enforced by `settingsV1Schema`
 * in `migrate()`.
 */
export function upgradeLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, version: CURRENT_VERSION };
}

/**
 * Turns any raw, untrusted value into a valid `SettingsV1`.
 *
 * Throws when:
 * - `raw` isn't a plain object at all
 * - `raw.version` is a number greater than `CURRENT_VERSION`
 * - the (possibly upgraded) shape still fails `settingsV1Schema` validation
 *
 * Callers (namely `storage.ts`'s `read()`) must catch and fall back to
 * defaults — this function never returns a partial or best-guess result.
 */
export function migrate(raw: unknown): SettingsV1 {
  if (!isPlainObject(raw)) {
    throw new Error("Settings blob is not an object and cannot be migrated.");
  }

  const version = extractVersion(raw);
  assertNotFromFuture(version);

  const candidate = version === CURRENT_VERSION ? raw : upgradeLegacy(raw);

  const result = settingsV1Schema.safeParse(candidate);
  if (!result.success) {
    throw new Error(`Migrated settings blob failed schema validation: ${result.error.message}`);
  }
  return result.data;
}
