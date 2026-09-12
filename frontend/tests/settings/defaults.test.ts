import { describe, expect, it } from "vitest";

import { CURRENT_VERSION, settingsV1Schema } from "@/lib/settings/schema";
import { emptySettings } from "@/lib/settings/defaults";

describe("emptySettings", () => {
  it("returns the canonical empty SettingsV1 shape", () => {
    expect(emptySettings()).toEqual({
      version: CURRENT_VERSION,
      global: {},
      customBackendUrl: "",
      overrides: {},
    });
  });

  it("returns a distinct object reference on each call", () => {
    const a = emptySettings();
    const b = emptySettings();
    expect(a).not.toBe(b);
    expect(a.global).not.toBe(b.global);
    expect(a.overrides).not.toBe(b.overrides);
  });

  it("mutating one call's result does not affect another call's result", () => {
    const a = emptySettings();
    a.global.OPENAI_API_KEY = "sk-mutated";
    a.overrides["some-recipe"] = { OPENAI_API_KEY: "sk-mutated" };

    const b = emptySettings();
    expect(b.global).toEqual({});
    expect(b.overrides).toEqual({});
  });

  it("satisfies settingsV1Schema", () => {
    const result = settingsV1Schema.safeParse(emptySettings());
    expect(result.success).toBe(true);
  });
});
