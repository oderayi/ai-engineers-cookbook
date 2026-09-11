import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("app/manifest.ts", () => {
  it("returns a valid-shaped Web App Manifest", () => {
    const result = manifest();

    expect(result.name).toBe("Skillet");
    expect(result.short_name).toBe("Skillet");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
    expect(typeof result.background_color).toBe("string");
    expect(typeof result.theme_color).toBe("string");

    expect(Array.isArray(result.icons)).toBe(true);
    expect(result.icons?.length).toBeGreaterThan(0);
    for (const icon of result.icons ?? []) {
      expect(icon.src).toMatch(/^\/icons\//);
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(icon.type).toBe("image/png");
    }

    // At least one icon at each standard PWA size.
    const sizes = (result.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});
