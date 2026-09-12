import { describe, expect, it } from "vitest";

import {
  assertNotFromFuture,
  extractVersion,
  isPlainObject,
  migrate,
  upgradeLegacy,
} from "@/lib/settings/migrations";
import { CURRENT_VERSION } from "@/lib/settings/schema";

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
    expect(extractVersion({ version: 7 })).toBe(7);
  });

  it("returns undefined when version is missing or not a number", () => {
    expect(extractVersion({})).toBeUndefined();
    expect(extractVersion({ version: undefined })).toBeUndefined();
    expect(extractVersion({ version: "1" })).toBeUndefined();
    expect(extractVersion({ version: null })).toBeUndefined();
  });
});

describe("assertNotFromFuture", () => {
  it("does not throw for undefined, current, or older versions", () => {
    expect(() => assertNotFromFuture(undefined)).not.toThrow();
    expect(() => assertNotFromFuture(CURRENT_VERSION)).not.toThrow();
    expect(() => assertNotFromFuture(0)).not.toThrow();
  });

  it("throws for a version greater than CURRENT_VERSION", () => {
    expect(() => assertNotFromFuture(CURRENT_VERSION + 1)).toThrow();
    expect(() => assertNotFromFuture(99)).toThrow();
  });
});

describe("upgradeLegacy", () => {
  it("stamps version: CURRENT_VERSION onto the object", () => {
    expect(upgradeLegacy({})).toEqual({ version: CURRENT_VERSION });
  });

  it("preserves existing fields while stamping the version", () => {
    const input = { global: { OPENAI_API_KEY: "sk-legacy" }, customBackendUrl: "" };
    expect(upgradeLegacy(input)).toEqual({ ...input, version: CURRENT_VERSION });
  });

  it("overwrites a pre-existing (non-current) version field", () => {
    expect(upgradeLegacy({ version: 0, global: {} })).toEqual({
      version: CURRENT_VERSION,
      global: {},
    });
  });
});

describe("migrate", () => {
  it("upgrades an unversioned legacy blob, preserving values", () => {
    const legacy = {
      global: { OPENAI_API_KEY: "sk-legacy" },
      customBackendUrl: "",
      overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
    };
    expect(migrate(legacy)).toEqual({
      version: CURRENT_VERSION,
      global: { OPENAI_API_KEY: "sk-legacy" },
      customBackendUrl: "",
      overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
    });
  });

  it("upgrades a version: 0 blob to CURRENT_VERSION, preserving values", () => {
    const v0 = { version: 0, global: { OPENAI_API_KEY: "sk-v0" } };
    expect(migrate(v0)).toEqual({
      version: CURRENT_VERSION,
      global: { OPENAI_API_KEY: "sk-v0" },
      customBackendUrl: "",
      overrides: {},
    });
  });

  it("passes a valid current blob through untouched", () => {
    const current = {
      version: CURRENT_VERSION,
      global: { OPENAI_API_KEY: "sk-current" },
      customBackendUrl: "https://api.example.com",
      overrides: {},
    };
    expect(migrate(current)).toEqual(current);
  });

  it("throws for a version greater than CURRENT_VERSION", () => {
    expect(() => migrate({ version: CURRENT_VERSION + 1 })).toThrow();
  });

  it("throws for a non-object blob (null, array, primitive)", () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate(undefined)).toThrow();
    expect(() => migrate([])).toThrow();
    expect(() => migrate("not an object")).toThrow();
    expect(() => migrate(42)).toThrow();
  });

  it("throws when the resulting shape still fails schema validation", () => {
    // global values must be strings; this cannot be coerced into a valid SettingsV1.
    expect(() => migrate({ global: { OPENAI_API_KEY: 12345 } })).toThrow();
  });

  it("strips unknown fields via schema validation during migration", () => {
    const legacy = { global: {}, bogus: "field" };
    const result = migrate(legacy);
    expect(result).not.toHaveProperty("bogus");
    expect(result.version).toBe(CURRENT_VERSION);
  });
});
