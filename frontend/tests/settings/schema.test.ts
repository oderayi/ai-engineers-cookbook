import { describe, expect, it } from "vitest";

import { CURRENT_VERSION, settingsV1Schema } from "@/lib/settings/schema";

describe("settingsV1Schema", () => {
  it("accepts a minimal valid blob and fills in defaults", () => {
    const parsed = settingsV1Schema.parse({ version: 1 });
    expect(parsed).toEqual({
      version: 1,
      global: {},
      customBackendUrl: "",
      overrides: {},
    });
  });

  it("accepts a fully-populated blob", () => {
    const input = {
      version: 1,
      global: { OPENAI_API_KEY: "sk-test" },
      customBackendUrl: "https://api.example.com",
      overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
    };
    expect(settingsV1Schema.parse(input)).toEqual(input);
  });

  it("rejects a version other than CURRENT_VERSION", () => {
    expect(() => settingsV1Schema.parse({ version: 2 })).toThrow();
    expect(() => settingsV1Schema.parse({ version: 0 })).toThrow();
  });

  it("normalizes a customBackendUrl with a trailing slash", () => {
    const parsed = settingsV1Schema.parse({
      version: 1,
      customBackendUrl: "https://api.example.com/",
    });
    expect(parsed.customBackendUrl).toBe("https://api.example.com");
  });

  it("normalizes multiple trailing slashes", () => {
    const parsed = settingsV1Schema.parse({
      version: 1,
      customBackendUrl: "https://api.example.com//",
    });
    expect(parsed.customBackendUrl).toBe("https://api.example.com");
  });

  it("accepts an empty customBackendUrl", () => {
    const parsed = settingsV1Schema.parse({ version: 1, customBackendUrl: "" });
    expect(parsed.customBackendUrl).toBe("");
  });

  it("rejects a non-http(s) customBackendUrl", () => {
    expect(() =>
      settingsV1Schema.parse({ version: 1, customBackendUrl: "ftp://example.com" })
    ).toThrow();
  });

  it("rejects a malformed customBackendUrl", () => {
    expect(() =>
      settingsV1Schema.parse({ version: 1, customBackendUrl: "not a url" })
    ).toThrow();
  });

  it("strips unknown top-level fields", () => {
    const parsed = settingsV1Schema.parse({ version: 1, bogus: "field" });
    expect(parsed).not.toHaveProperty("bogus");
  });

  it("rejects a global key that isn't a valid env-var name", () => {
    expect(() =>
      settingsV1Schema.parse({ version: 1, global: { "not-valid": "x" } })
    ).toThrow();
  });

  it("exports CURRENT_VERSION as 1", () => {
    expect(CURRENT_VERSION).toBe(1);
  });
});
