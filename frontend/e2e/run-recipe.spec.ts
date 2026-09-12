import { expect, test } from "@playwright/test";

// Real end-to-end runs against the same live backend catalog's own E2E
// suite uses (backend/scripts/e2e_recipes_server.py, serving
// backend/tests/fixtures/recipes — see playwright.config.ts's second
// `webServer` entry). Not mocked: exercises the real
// fetch -> SSE -> zod-parse -> render pipeline through a live
// POST /recipes/{slug}/run stream, the same guarantee every other
// module's E2E suite relies on.
//
// Every assertion below is scoped to `[data-slot="run-output"]`
// (`run-output.tsx`'s own root element): the page's `SourceViewer` shows
// this recipe's real Python source, which quotes the exact same step
// names/strings literally in the code — an unscoped `page.getByText(...)`
// matches both, a real strict-mode ambiguity hit and fixed while writing
// this spec.

test.describe("Run a recipe end to end", () => {
  test("fills the echo recipe's form, runs it, and sees the real streamed + result output", async ({
    page,
  }) => {
    await page.goto("/r/echo");

    await page.getByLabel("Message").fill("Hello from Playwright E2E");
    const runButton = page.getByRole("button", { name: "Run" });
    await expect(runButton).toBeEnabled();
    await runButton.click();

    const runOutput = page.locator('[data-slot="run-output"]');

    // The recipe's own two steps (start, then finish) collapse into one
    // StepTimeline row per execution's step-timeline.tsx contract.
    await expect(runOutput.getByText("Echoing message")).toBeVisible();

    // Terminal state: the real ResultEvent, rendered via JsonTree, contains
    // the exact message this run submitted -- proving the whole round trip
    // (browser -> backend -> recipe -> SSE -> parsed event -> rendered DOM),
    // not just that *a* result arrived.
    await expect(runOutput.getByText("Result")).toBeVisible();
    await expect(runOutput.getByText('"Hello from Playwright E2E"')).toBeVisible();

    // A terminal run has nothing left to cancel.
    await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();
  });

  test("cancel mid-run stops the stream client-side — no further UI updates after cancelling", async ({
    page,
  }) => {
    // "slow-echo" (execution's own E2E fixture, backend/tests/fixtures/
    // recipes/demo/30-slow-echo) sleeps 5s before its second step/result —
    // long enough that a real click reliably lands mid-run, unlike the
    // near-instant "echo".
    await page.goto("/r/slow-echo");

    await page.getByLabel("Message").fill("This should never finish");
    await page.getByRole("button", { name: "Run" }).click();

    const runOutput = page.locator('[data-slot="run-output"]');

    // Confirms the run actually started (the first step, emitted
    // immediately) before we act on it.
    await expect(runOutput.getByText("Thinking it over")).toBeVisible();
    await expect(runOutput.getByText("In progress")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    // cancel() resets straight to "idle" (use-recipe-run.ts), so
    // RunOutputView renders nothing at all -- the step/progress content and
    // the Cancel button itself all disappear immediately, client-side, with
    // no round trip needed to confirm.
    await expect(runOutput).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();

    // The server-side task-cancellation/tempdir-cleanup guarantee itself is
    // backend/tests/execution/test_cancel.py's job (a real socket-level
    // test); this is the client's own affordance -- give the recipe's 5s
    // sleep a real window to (wrongly) finish and push more UI updates if
    // cancelling somehow failed to actually stop the client from processing
    // further stream events, then confirm the run never reached its
    // terminal state.
    await page.waitForTimeout(6_000);
    await expect(page.getByText("Result", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Done", { exact: true })).not.toBeVisible();
  });
});
