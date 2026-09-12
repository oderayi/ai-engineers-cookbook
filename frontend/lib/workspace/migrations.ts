import { emptyWorkspace } from "@/lib/workspace/defaults";
import { CURRENT_VERSION, workspaceV1Schema, type WorkspaceV1 } from "@/lib/workspace/schema";

/**
 * Forward-only migration runner for the `skillet.workspace` blob (see
 * docs/SPEC-workspace.md, Confirmed Decision 9). Mirrors `settings`' own
 * `lib/settings/migrations.ts` function shape (`isPlainObject` /
 * `extractVersion` / `upgradeLegacy` as small, independently-testable pure
 * steps) as closely as makes sense for this simpler, single-version-so-far
 * schema.
 *
 * One deliberate difference from `settings`: `settings`' `migrate()` throws
 * on an unsalvageable blob and relies on a separate `storage.ts` to catch
 * that throw and fall back to `emptySettings()`. This module has no
 * `storage.ts` in its scope (see tasks/todo-workspace.md Task 2), so
 * `migrate()` itself is the safety boundary — it NEVER throws, and instead
 * returns `emptyWorkspace()` directly for anything it can't make sense of.
 * `migrate()` takes `unknown` (an already-`JSON.parse`d value, not a raw
 * string); a caller that reads a raw string off `localStorage` is
 * responsible for its own `JSON.parse` try/catch before calling this.
 *
 * There is no real "version 0" shape defined anywhere yet in this greenfield
 * project (CURRENT_VERSION is 1), so "legacy/unversioned" is treated as: an
 * object with no `version` field (or a non-current, non-future one) whose
 * `tabs`/`activeTabId`/`progress` fields, if present, are assumed to already
 * be in the current shape. We stamp `version: 1` onto it and let
 * `workspaceV1Schema` be the actual arbiter of validity. There is nothing to
 * actually migrate FROM yet, since v1 is the first schema version — this
 * function's shape (a version check, then an upgrade step, then schema
 * validation) is ready for a real v2-from-v1 transform to be slotted into
 * `upgradeLegacy` (or a sibling step) once one is needed.
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
 * True when `version` is a number greater than `CURRENT_VERSION` — a "blob
 * from the future". Migration never tries to guess at a shape it doesn't
 * know yet; `migrate()` discards these to `emptyWorkspace()`.
 */
export function isFromFuture(version: number | undefined): boolean {
  return typeof version === "number" && version > CURRENT_VERSION;
}

/**
 * Upgrades a legacy/unversioned (or non-current, non-future) blob by
 * stamping the current version onto it, assuming any `tabs` / `activeTabId`
 * / `progress` fields already present are roughly current-shaped. Final
 * validity is still enforced by `workspaceV1Schema` in `migrate()`.
 */
export function upgradeLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, version: CURRENT_VERSION };
}

/**
 * Turns any raw, untrusted value into a valid `WorkspaceV1`. Never throws.
 *
 * Falls back to `emptyWorkspace()` when:
 * - `raw` isn't a plain object at all (including malformed-JSON-shaped
 *   values like `null`, arrays, or primitives — see this file's doc comment
 *   on `migrate()`'s `unknown` input contract)
 * - `raw.version` is a number greater than `CURRENT_VERSION`
 * - the (possibly upgraded) shape still fails `workspaceV1Schema` validation
 *
 * A valid, current-version blob parses through via `workspaceV1Schema`,
 * which strips unknown top-level keys under Zod's default (non-`.passthrough()`)
 * object parsing behavior (verified empirically against the project's
 * installed zod version).
 */
export function migrate(raw: unknown): WorkspaceV1 {
  if (!isPlainObject(raw)) {
    return emptyWorkspace();
  }

  const version = extractVersion(raw);
  if (isFromFuture(version)) {
    return emptyWorkspace();
  }

  const candidate = version === CURRENT_VERSION ? raw : upgradeLegacy(raw);

  const result = workspaceV1Schema.safeParse(candidate);
  return result.success ? result.data : emptyWorkspace();
}
