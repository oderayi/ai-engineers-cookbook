import { expect, test } from "@playwright/test";

test.describe("Run form validation", () => {
  test("empty required input keeps Run disabled; valid input enables it, clearing disables it again", async ({
    page,
  }) => {
    // "echo" declares one required field: `message: str = Field(...,
    // min_length=1)` — a real Pydantic constraint from a real backend
    // response, not a hand-typed fixture.
    await page.goto("/r/echo");

    const runButton = page.getByRole("button", { name: "Run" });
    const messageField = page.getByLabel("Message");

    await expect(runButton).toBeDisabled();

    await messageField.fill("Hello from Playwright");
    await expect(runButton).toBeEnabled();

    await messageField.fill("");
    await expect(runButton).toBeDisabled();
  });
});
