import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __bipFired?: boolean;
  }
}

test.describe("PWA installability", () => {
  test("manifest is valid", async ({ page, baseURL }) => {
    const response = await page.request.get(`${baseURL}/manifest.webmanifest`);
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.name).toBe("Skillet");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  test("service worker registers", async ({ page }) => {
    await page.goto("/");

    const registered = await page
      .waitForFunction(
        async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return Boolean(reg);
        },
        { timeout: 15_000 }
      )
      .then(() => true)
      .catch(() => false);

    expect(registered, "expected navigator.serviceWorker to have a registration").toBe(true);
  });

  test("the browser fires beforeinstallprompt when installability criteria are met (best effort)", async ({
    page,
  }) => {
    test.setTimeout(20_000); // this test intentionally never "fails" on a timeout — see below

    await page.addInitScript(() => {
      window.__bipFired = false;
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        window.__bipFired = true;
      });
    });
    await page.goto("/");

    // Chromium's installability heuristics (manifest + registered service
    // worker, both independently verified above, plus internal engagement
    // signals) can take a few seconds and, in some headless/CI
    // configurations, may not fire this event at all even for a genuinely
    // installable app — a plain fixed wait, checked once, is deliberately
    // simpler than a polling waitForFunction here (which was found to
    // occasionally stall for this specific event rather than reject
    // cleanly on schedule). Report the outcome rather than hard-failing on
    // a timeout — this signal is environment-dependent in a way manifest
    // validity and SW registration are not (SPEC-app-shell.md Task 12
    // explicitly allows "documents why it can't be asserted").
    await page.waitForTimeout(8_000);
    const fired = await page.evaluate(() => window.__bipFired === true);

    test.info().annotations.push({
      type: fired ? "note" : "warning",
      description: fired
        ? "beforeinstallprompt fired — Chromium considers the app installable."
        : "beforeinstallprompt did not fire within 8s in this environment. Manifest validity and service-worker registration are independently verified by the other two tests in this file, which do not depend on this heuristic.",
    });
  });
});
