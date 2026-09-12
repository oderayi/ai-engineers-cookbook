import { expect, test } from "@playwright/test";

// Permanent regression coverage for the three breakpoints ad-hoc-verified
// during Task 11 (SPEC-app-shell.md success criterion 5) — that
// investigation never left behind a committed spec, only a throwaway
// script, which is a real gap this closes.

const BREAKPOINTS = [
  { name: "375 (mobile)", width: 375, height: 812 },
  { name: "768 (md)", width: 768, height: 1024 },
  { name: "1280 (desktop)", width: 1280, height: 800 },
] as const;

test.describe("Responsive layout", () => {
  for (const { name, width, height } of BREAKPOINTS) {
    test(`renders with no unwanted horizontal scroll at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test("shows the persistent sidebar rail at md and above, and the drawer trigger below it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("button", { name: /open menu/i })).toBeHidden();

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("button", { name: /open menu/i })).toBeHidden();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator("aside")).toBeHidden();
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible();
  });

  test("the mobile drawer opens and shows the same nav content as the desktop rail", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await page.getByRole("button", { name: /open menu/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Prompt Basics")).toBeVisible();
  });
});
