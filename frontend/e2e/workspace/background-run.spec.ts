import { expect, test } from "@playwright/test";

// Real content from the same live backend catalog's/execution's own E2E
// suites use. "slow-echo" (execution's own E2E fixture,
// backend/tests/fixtures/recipes/demo/30-slow-echo) sleeps 5s before its
// terminal result — long enough to prove a background tab keeps streaming
// while genuinely inactive, unlike the near-instant "echo".
//
// Sidebar links are targeted by their real `href`, not visible/accessible
// text — see tab-lifecycle.spec.ts's own comment on why a text-based query
// silently breaks against sidebar-nav.tsx's concatenated accessible names.
function sidebarRecipeLink(page: import("@playwright/test").Page, slug: string) {
  return page.locator(`aside a[href="/r/${slug}"]`);
}

test.describe("Workspace background run", () => {
  test("starting a run in tab A, switching to tab B, and back shows A's run continued streaming while inactive", async ({
    page,
  }) => {
    await page.goto("/");

    // Tab A: slow-echo.
    await sidebarRecipeLink(page, "slow-echo").click();
    const tabs = page.getByRole("tablist", { name: "Open recipe tabs" }).getByRole("tab");
    await expect(tabs).toHaveCount(1);

    await page.getByLabel("Message").fill("Still streaming in the background?");
    await page.getByRole("button", { name: "Run" }).click();

    // Confirm A's run actually started before switching away. Scoped to
    // [data-slot="run-output"]: the page's own SourceViewer shows this
    // recipe's real Python source, which quotes "Thinking it over"
    // literally in code — an unscoped query matches both (the same
    // ambiguity execution's own run-recipe.spec.ts already found and
    // fixed the same way).
    const runOutput = page.locator('[data-slot="run-output"]');
    await expect(runOutput.getByText("Thinking it over")).toBeVisible();
    // Tab A's own status dot reflects "running" while A is still active.
    await expect(tabs.nth(0).locator('[data-status="running"]')).toBeVisible();

    // Open tab B (echo) — this both creates a new tab AND activates it,
    // making A inactive/hidden while its run keeps executing in the
    // background (per Confirmed Decision 2: RecipeView stays mounted,
    // only `hidden` toggles).
    await sidebarRecipeLink(page, "echo").click();
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('[data-testid="recipe-view-title"]:visible')).toHaveText("Echo");

    // While B is active, A's tab dot (still visible in the strip, per
    // Confirmed Decision 10) still shows "running" -- proven by checking
    // it BEFORE the 5s sleep completes.
    await expect(tabs.nth(0).locator('[data-status="running"]')).toBeVisible();

    // Wait past slow-echo's 5s sleep while B stays active/foreground.
    await page.waitForTimeout(6_000);

    // A's dot should now reflect "done" — updated even while inactive.
    await expect(tabs.nth(0).locator('[data-status="done"]')).toBeVisible();

    // Switch back to A: its accumulated output (the terminal result) is
    // there immediately -- it kept streaming/completed while hidden, not
    // reset or stalled by the tab switch.
    await tabs.nth(0).click();
    await expect(runOutput.getByText('"Still streaming in the background?"')).toBeVisible();
  });
});
