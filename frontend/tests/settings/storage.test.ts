import { beforeEach, describe, expect, it, vi } from "vitest";

import { clear, read, STORAGE_KEY, write } from "@/lib/settings/storage";
import { CURRENT_VERSION, type SettingsV1 } from "@/lib/settings/schema";

const FALLBACK_SETTINGS: SettingsV1 = {
  version: CURRENT_VERSION,
  global: {},
  customBackendUrl: "",
  overrides: {},
};

const FULL_SETTINGS: SettingsV1 = {
  version: CURRENT_VERSION,
  global: { OPENAI_API_KEY: "sk-global" },
  customBackendUrl: "https://api.example.com",
  overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("STORAGE_KEY", () => {
  it("is the agreed-upon key", () => {
    expect(STORAGE_KEY).toBe("skillet.settings");
  });
});

describe("read()", () => {
  it("returns fallback defaults when nothing is stored", () => {
    expect(read()).toEqual(FALLBACK_SETTINGS);
  });

  it("round-trips a fully-populated SettingsV1 byte-for-byte", () => {
    write(FULL_SETTINGS);
    expect(read()).toEqual(FULL_SETTINGS);
  });

  it("strips unknown top-level fields from a stored blob", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...FULL_SETTINGS, bogus: "field" })
    );
    const result = read();
    expect(result).not.toHaveProperty("bogus");
    expect(result).toEqual(FULL_SETTINGS);
  });

  it("normalizes a customBackendUrl with a trailing slash on read", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...FULL_SETTINGS, customBackendUrl: "https://api.example.com/" })
    );
    expect(read().customBackendUrl).toBe("https://api.example.com");
  });

  it("upgrades an unversioned/legacy blob, preserving values", () => {
    const legacy = {
      global: { OPENAI_API_KEY: "sk-legacy" },
      customBackendUrl: "",
      overrides: {},
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(read()).toEqual({ ...legacy, version: CURRENT_VERSION });
  });

  it("discards a blob with version greater than CURRENT_VERSION, falling back to defaults", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: CURRENT_VERSION + 1, global: { OPENAI_API_KEY: "sk-future" } })
    );
    expect(read()).toEqual(FALLBACK_SETTINGS);
  });

  it("discards malformed JSON, falling back to defaults", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(read()).toEqual(FALLBACK_SETTINGS);
  });

  it("discards a schema-invalid blob, falling back to defaults", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: CURRENT_VERSION, global: { OPENAI_API_KEY: 12345 } })
    );
    expect(read()).toEqual(FALLBACK_SETTINGS);
  });

  it("falls back to defaults without throwing when localStorage.getItem throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: private mode");
    });
    expect(() => read()).not.toThrow();
    expect(read()).toEqual(FALLBACK_SETTINGS);
  });
});

describe("write()", () => {
  it("persists settings so a subsequent read() sees them", () => {
    write(FULL_SETTINGS);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(FULL_SETTINGS);
  });

  it("does not throw when localStorage.setItem throws (quota / private mode)", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => write(FULL_SETTINGS)).not.toThrow();
  });
});

describe("clear()", () => {
  it("removes the stored key so the next read() returns fallback defaults", () => {
    write(FULL_SETTINGS);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clear();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(read()).toEqual(FALLBACK_SETTINGS);
  });

  it("does not throw when localStorage.removeItem throws", () => {
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError: private mode");
    });
    expect(() => clear()).not.toThrow();
  });
});
