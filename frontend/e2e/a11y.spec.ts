import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Accessibility", () => {
  test("the shell has zero serious or critical axe violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();

    const seriousOrCritical = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(
      seriousOrCritical,
      JSON.stringify(seriousOrCritical, null, 2)
    ).toEqual([]);
  });

  test("full keyboard traversal reaches every interactive element with a visible focus indicator", async ({
    page,
  }) => {
    await page.goto("/");

    // Regression test for a real bug found in Task 11: shadcn's Button had
    // *no* visible focus indicator (Tailwind v4's outline-none is a true
    // outline-style:none, and the ring's box-shadow rendered fully
    // transparent — see that task's commit for the full root-cause trail).
    // Checks BOTH mechanisms an element might legitimately use here:
    // sidebar-nav's hand-written links use a ring (box-shadow); shadcn
    // Button-based controls use a native outline post-fix. A crude
    // string-prefix check on box-shadow is what produced a false negative
    // during that investigation — this parses each comma-separated shadow
    // layer independently instead of assuming the first layer represents
    // the whole value.
    const stops: Array<{ tag: string; label: string; visible: boolean }> = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;

        const cs = getComputedStyle(el);
        const hasOutline = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";

        const splitTopLevelCommas = (value: string): string[] => {
          const parts: string[] = [];
          let depth = 0;
          let current = "";
          for (const char of value) {
            if (char === "(") depth++;
            if (char === ")") depth--;
            if (char === "," && depth === 0) {
              parts.push(current);
              current = "";
            } else {
              current += char;
            }
          }
          if (current.trim()) parts.push(current);
          return parts;
        };

        const isFullyTransparentLayer = (layer: string): boolean =>
          /^(rgba\(0,\s*0,\s*0,\s*0\)|transparent|oklab\([^)]*\/\s*0\)|oklch\([^)]*\/\s*0\))\s+0px\s+0px\s+0px\s+0px\s*$/.test(
            layer.trim()
          );

        const hasRing =
          cs.boxShadow !== "none" &&
          splitTopLevelCommas(cs.boxShadow).some((layer) => !isFullyTransparentLayer(layer));

        return {
          tag: el.tagName,
          label:
            el.getAttribute("aria-label") ||
            el.textContent?.trim().slice(0, 40) ||
            el.tagName,
          visible: hasOutline || hasRing,
        };
      });
      if (stop) stops.push(stop);
    }

    // De-duplicate in case Tab wrapped around before reaching 20 presses.
    const seen = new Set<string>();
    const unique = stops.filter((s) => {
      const key = `${s.tag}:${s.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    expect(unique.length).toBeGreaterThan(0);
    for (const stop of unique) {
      expect(stop.visible, `${stop.tag} "${stop.label}" has no visible focus indicator`).toBe(
        true
      );
    }
  });
});
