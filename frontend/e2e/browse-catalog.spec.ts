import { expect, test } from "@playwright/test";

// Content here ("Demo" group, "Echo"/"Echo with helper" recipes) comes from
// a real backend (backend/scripts/e2e_recipes_server.py, serving
// backend/tests/fixtures/recipes — the same fixtures recipe-framework's own
// tests use), wired in via playwright.config.ts's second `webServer` entry.
// Not mocked: this exercises the real fetch -> zod-parse -> render pipeline
// end to end, the same guarantee `catalog`'s own manual verification passes
// relied on throughout this module's build.

test.describe("Browse catalog", () => {
  test("index -> open a recipe -> expand every collapsible region", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Demo" })).toBeVisible();
    await expect(page.locator('a[href="/r/echo"]').first()).toBeVisible();

    await page.locator('a[href="/r/echo"]').first().click();
    await expect(page).toHaveURL(/\/r\/echo$/);
    await expect(page.getByTestId("recipe-view-title")).toHaveText("Echo");

    // Description is the one collapsible region on this page (open by
    // default, per Task 10) — close it and reopen it, proving it's a real
    // operable toggle, not just static content that happens to be visible.
    const descriptionToggle = page.getByRole("button", { name: "Description" });
    await expect(descriptionToggle).toHaveAttribute("aria-expanded", "true");
    // Scoped to a <p> specifically: the source viewer's real recipe.py
    // docstring quotes this exact summary text verbatim, so an unscoped
    // text query matches both the description's own <p> and the <pre>.
    await expect(page.locator("p", { hasText: "Repeats back whatever message you send it." })).toBeVisible();

    await descriptionToggle.click();
    await expect(descriptionToggle).toHaveAttribute("aria-expanded", "false");
    await descriptionToggle.click();
    await expect(descriptionToggle).toHaveAttribute("aria-expanded", "true");

    // Source viewer and the run form have no separate expand/collapse state
    // of their own — both are already fully visible on the page; confirm
    // their real content (not just "something rendered").
    await expect(page.getByRole("tab", { name: "recipe.py" })).toBeVisible();
    await expect(page.getByText(/class Params\(BaseParams\)/)).toBeVisible();
    await expect(page.getByLabel("Message")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  test("the description region is operable by real keyboard input, not just a click", async ({
    page,
  }) => {
    // Task 16's own acceptance criterion says "keyboard", not "clickable" —
    // a real Tab + Enter/Space check, not an inference from "it's a real
    // <button> so it must be keyboard-operable".
    await page.goto("/r/echo");
    const descriptionToggle = page.getByRole("button", { name: "Description" });

    await descriptionToggle.focus();
    await expect(descriptionToggle).toBeFocused();
    await expect(descriptionToggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Enter");
    await expect(descriptionToggle).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Space");
    await expect(descriptionToggle).toHaveAttribute("aria-expanded", "true");
  });
});
