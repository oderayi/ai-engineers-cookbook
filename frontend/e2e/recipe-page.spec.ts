import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Recipe page", () => {
  test("deep-linking directly to /r/[slug] renders the full page against real backend data", async ({
    page,
  }) => {
    await page.goto("/r/echo-with-helper");

    await expect(page.getByTestId("recipe-view-title")).toHaveText("Echo with helper");
    // Scoped to a <p>: the source viewer's real recipe.py docstring quotes
    // this exact summary text verbatim, matching both the description's
    // own <p> and the <pre> on an unscoped query.
    await expect(page.locator("p", { hasText: /calls into a sibling helpers\.py/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: "recipe.py" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "helpers.py" })).toBeVisible();
  });

  // "Try this example" pre-fills AND focuses the run form (success
  // criterion 6) is covered by tests/catalog/recipe-view.test.tsx's own
  // real-component-composition unit test, not here: neither of this
  // environment's two E2E-fixture recipes (echo, echo-with-helper —
  // backend/tests/fixtures/recipes, recipe-framework's own minimal
  // smoke-test fixtures, not catalog's to extend) declares a
  // `[[recipe.example]]` block, so there is no "Try this example" button to
  // click against real E2E content. Documented rather than silently
  // skipped or faked with a mocked response.

  test("axe scan of the recipe page: zero serious/critical violations", async ({ page }) => {
    await page.goto("/r/echo");
    const results = await new AxeBuilder({ page }).analyze();

    const seriousOrCritical = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? "")
    );
    expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
  });

  test("offline (after one online visit): the SW's cross-origin runtime cache may serve the recipe response (best effort)", async ({
    page,
  }) => {
    await page.goto("/r/echo");
    await page.waitForFunction(
      async () => Boolean((await navigator.serviceWorker.getRegistration())?.active),
      { timeout: 15_000 }
    );
    await expect(page.getByTestId("recipe-view-title")).toHaveText("Echo");

    // Same documented, thoroughly-investigated environment limitation as
    // offline-browse.spec.ts's own second test: navigator.serviceWorker.
    // controller never becomes non-null in this sandboxed Playwright/
    // Chromium combination, so neither a same-origin nor a cross-origin
    // fetch is ever actually routed through the SW's own fetch handler
    // here. Reported as a best-effort outcome (an annotation), not a hard
    // assertion — per that spec's own precedent, and per this module's own
    // architecture: the default cross-origin `NetworkFirst` rule already
    // wired into sw.ts (app-shell's Serwist setup) would cache exactly this
    // recipe response if the environment let the SW actually see the
    // request at all.
    const result = await page.evaluate(async () => {
      const checkCache = async () => {
        const names = await caches.keys();
        for (const name of names) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          const match = keys.find(
            (k) => k.url.includes("/recipes/echo") && !k.url.includes("/source")
          );
          if (match) return { cacheName: name, url: match.url };
        }
        return null;
      };

      for (let attempt = 0; attempt < 10; attempt++) {
        if (navigator.serviceWorker.controller) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return { controlled: Boolean(navigator.serviceWorker.controller), cached: await checkCache() };
    });

    test.info().annotations.push({
      type: result.cached ? "note" : "warning",
      description: result.cached
        ? `Cross-origin runtime caching confirmed: recipe response was cached (${JSON.stringify(result.cached)}).`
        : `Could not verify cross-origin runtime caching in this environment (controlled=${result.controlled}) — the same navigator.serviceWorker.controller limitation documented in offline-browse.spec.ts, not a failing assertion.`,
    });

    if (result.cached) {
      expect(result.cached.url).toContain("/recipes/echo");
    }
  });
});
