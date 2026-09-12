import { describe, expect, it } from "vitest";

import { emptyWorkspace } from "@/lib/workspace/defaults";
import {
  extractVersion,
  isFromFuture,
  isPlainObject,
  migrate,
  upgradeLegacy,
} from "@/lib/workspace/migrations";
import { CURRENT_VERSION, workspaceV1Schema } from "@/lib/workspace/schema";

describe("isPlainObject", () => {
  it("accepts a plain object", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });
});

describe("extractVersion", () => {
  it("returns the numeric version field", () => {
    expect(extractVersion({ version: 1 })).toBe(1);
    expect(extractVersion({ version: 0 })).toBe(0);
    expect(extractVersion({ version: 999 })).toBe(999);
  });

  it("returns undefined when version is missing or not a number", () => {
    expect(extractVersion({})).toBeUndefined();
    expect(extractVersion({ version: undefined })).toBeUndefined();
    expect(extractVersion({ version: "1" })).toBeUndefined();
    expect(extractVersion({ version: null })).toBeUndefined();
  });
});

describe("isFromFuture", () => {
  it("is false for undefined, current, or older versions", () => {
    expect(isFromFuture(undefined)).toBe(false);
    expect(isFromFuture(CURRENT_VERSION)).toBe(false);
    expect(isFromFuture(0)).toBe(false);
  });

  it("is true for a version greater than CURRENT_VERSION", () => {
    expect(isFromFuture(CURRENT_VERSION + 1)).toBe(true);
    expect(isFromFuture(999)).toBe(true);
  });
});

describe("upgradeLegacy", () => {
  it("stamps version: CURRENT_VERSION onto the object", () => {
    expect(upgradeLegacy({})).toEqual({ version: CURRENT_VERSION });
  });

  it("preserves existing fields while stamping the version", () => {
    const input = { tabs: [{ id: "t1", slug: "rag-basics" }], activeTabId: "t1" };
    expect(upgradeLegacy(input)).toEqual({ ...input, version: CURRENT_VERSION });
  });

  it("overwrites a pre-existing (non-current) version field", () => {
    expect(upgradeLegacy({ version: 0, tabs: [] })).toEqual({
      version: CURRENT_VERSION,
      tabs: [],
    });
  });
});

/**
 * `migrate()` accepts `unknown` — an already-`JSON.parse`d value, not a raw
 * string. There is no `storage.ts` in this task's scope to own the
 * `JSON.parse` boundary (unlike `settings`, where `migrate()` throws and
 * `storage.ts` catches it — see `lib/settings/migrations.ts`'s own doc
 * comment), so `migrate()` itself is the safety boundary here: it never
 * throws, and any input it cannot make sense of — including the kind of
 * value a caller might end up with after failing to `JSON.parse` malformed
 * text — falls back to `emptyWorkspace()`.
 */
describe("migrate", () => {
  it("passes a valid current-version blob through untouched, with all real data intact", () => {
    const current = {
      version: CURRENT_VERSION,
      tabs: [
        { id: "t1", slug: "rag-basics" },
        { id: "t2", slug: "prompt-chaining" },
      ],
      activeTabId: "t2",
      progress: {
        "rag-basics": { viewedAt: 1000, completedAt: 2000 },
        "prompt-chaining": { viewedAt: 3000, completedAt: null },
      },
    };
    expect(migrate(current)).toEqual(current);
  });

  it("upgrades an unversioned/legacy blob to CURRENT_VERSION without throwing", () => {
    const legacy = {
      tabs: [{ id: "t1", slug: "rag-basics" }],
      activeTabId: "t1",
      progress: { "rag-basics": { viewedAt: 1000, completedAt: null } },
    };
    const result = migrate(legacy);
    expect(() => migrate(legacy)).not.toThrow();
    expect(result).toEqual({ ...legacy, version: CURRENT_VERSION });
    expect(workspaceV1Schema.safeParse(result).success).toBe(true);
  });

  it("upgrades a version: 0 blob to CURRENT_VERSION, preserving values", () => {
    const v0 = { version: 0, tabs: [{ id: "t1", slug: "rag-basics" }] };
    expect(migrate(v0)).toEqual({
      version: CURRENT_VERSION,
      tabs: [{ id: "t1", slug: "rag-basics" }],
      activeTabId: null,
      progress: {},
    });
  });

  it("discards a blob with version greater than CURRENT_VERSION for emptyWorkspace(), without throwing", () => {
    const fromFuture = {
      version: 999,
      tabs: [{ id: "t1", slug: "rag-basics" }],
      activeTabId: "t1",
      progress: {},
    };
    expect(() => migrate(fromFuture)).not.toThrow();
    expect(migrate(fromFuture)).toEqual(emptyWorkspace());
  });

  it("discards a non-object value for emptyWorkspace(), without throwing (the migrate() boundary for malformed input)", () => {
    // These stand in for what a caller might pass after JSON.parse of
    // malformed text throws and is caught, or after parsing valid-but-wrong
    // JSON (e.g. a bare string, number, or array) — migrate() takes
    // `unknown`, so it must handle all of these without throwing.
    expect(migrate(null)).toEqual(emptyWorkspace());
    expect(migrate(undefined)).toEqual(emptyWorkspace());
    expect(migrate([])).toEqual(emptyWorkspace());
    expect(migrate("not an object")).toEqual(emptyWorkspace());
    expect(migrate(42)).toEqual(emptyWorkspace());
    expect(() => migrate(null)).not.toThrow();
  });

  it("discards a blob that still fails schema validation after upgrade, without throwing", () => {
    // tabs entries must be { id: string, slug: string }; this cannot be
    // coerced into a valid WorkspaceV1.
    expect(migrate({ tabs: [{ id: "t1" }] })).toEqual(emptyWorkspace());
    expect(migrate({ version: CURRENT_VERSION, activeTabId: 123 })).toEqual(emptyWorkspace());
  });

  it("strips unknown extra top-level keys via schema validation, not just passthrough-without-crashing", () => {
    const withExtra = {
      version: CURRENT_VERSION,
      tabs: [{ id: "t1", slug: "rag-basics" }],
      activeTabId: "t1",
      progress: {},
      extraField: "leftover",
    };
    const result = migrate(withExtra);
    expect(result).not.toHaveProperty("extraField");
    expect(result).toEqual({
      version: CURRENT_VERSION,
      tabs: [{ id: "t1", slug: "rag-basics" }],
      activeTabId: "t1",
      progress: {},
    });
  });

  it("strips unknown extra top-level keys from an unversioned/legacy blob too", () => {
    const legacyWithExtra = { tabs: [], bogus: "field" };
    const result = migrate(legacyWithExtra);
    expect(result).not.toHaveProperty("bogus");
    expect(result.version).toBe(CURRENT_VERSION);
  });
});

describe("emptyWorkspace", () => {
  it("round-trips through workspaceV1Schema.parse() without modification", () => {
    const empty = emptyWorkspace();
    expect(workspaceV1Schema.parse(empty)).toEqual(empty);
  });

  it("matches workspaceV1Schema's own defaults exactly", () => {
    expect(emptyWorkspace()).toEqual({
      version: CURRENT_VERSION,
      tabs: [],
      activeTabId: null,
      progress: {},
    });
  });
});
