import { expect, test } from "@playwright/test";

// Real content ("Demo" group, "echo"/"echo-with-helper" recipes) from the
// same live backend catalog's own E2E suite uses (backend/scripts/
// e2e_recipes_server.py). Opening a tab here means clicking a recipe link
// inside the SIDEBAR specifically (`components/workspace/workspace-shell.tsx`'s
// own click-interception, scoped to the sidebar — see that file's doc
// comment for why it's sidebar-only, not also the catalog index's own
// cards).
//
// Sidebar links are targeted by their real `href` (`a[href="/r/{slug}"]`),
// not by visible/accessible-name text: `sidebar-nav.tsx` concatenates a
// recipe's title and difficulty badge with no separator in the accessible
// name (e.g. "EchoBasic"), which silently breaks a `name`-based `RegExp`
// match anchored on the title alone — found the hard way while writing
// this spec (a query for `/echo$/i` never matched "EchoBasic" and hung
// every locator call against it until timeout).
function sidebarRecipeLink(page: import("@playwright/test").Page, slug: string) {
  return page.locator(`aside a[href="/r/${slug}"]`);
}

test.describe("Workspace tab lifecycle", () => {
  test("open two tabs (one a duplicate), switch, close one, reload — restores the same tabs/order/active tab", async ({
    page,
  }) => {
    await page.goto("/");

    // Open "echo" twice (duplicate tabs of the same recipe, per Confirmed
    // Decision 4 — always a new tab, never "focus existing").
    await sidebarRecipeLink(page, "echo").click();
    await expect(page.getByRole("tablist", { name: "Open recipe tabs" })).toBeVisible();
    let tabs = page.getByRole("tablist", { name: "Open recipe tabs" }).getByRole("tab");
    await expect(tabs).toHaveCount(1);

    await sidebarRecipeLink(page, "echo").click();
    tabs = page.getByRole("tablist", { name: "Open recipe tabs" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);

    // Open "echo with helper" — a third, different tab.
    await sidebarRecipeLink(page, "echo-with-helper").click();
    tabs = page.getByRole("tablist", { name: "Open recipe tabs" }).getByRole("tab");
    await expect(tabs).toHaveCount(3);

    // The third tab (just opened) is active — its RecipeView content shows.
    await expect(page.locator('[data-testid="recipe-view-title"]:visible')).toHaveText("Echo with helper");

    // Switch to the first tab and confirm the switch actually happened.
    await tabs.nth(0).click();
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "false");

    // Close the second tab (one of the two duplicate "echo" tabs).
    await tabs.nth(1).getByRole("button", { name: /close/i }).click();
    tabs = page.getByRole("tablist", { name: "Open recipe tabs" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);

    // The first tab (echo) should still be active — closing an INACTIVE
    // tab must not disturb which tab is active.
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

    // Reload: the same 2 tabs, same order, same active tab restore from
    // localStorage — and neither attempts to resume a run (both are
    // freshly idle; no result/error content appears for either without
    // the user pressing Run again).
    await page.reload();

    tabs = page.getByRole("tablist", { name: "Open recipe tabs" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");

    // No tab shows any streamed output (a fresh, idle RecipeView never
    // auto-starts a run) — the active tab's own run-output region is
    // absent entirely (RunOutputView renders nothing for status "idle").
    await expect(page.locator('[data-slot="run-output"]')).toHaveCount(0);
  });
});
