import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RateLimitNotice } from "@/components/execution/rate-limit-notice";
import { RateLimitPayload } from "@/lib/execution/rate-limit";

afterEach(() => {
  cleanup();
});

const FIXTURE_PATH = path.resolve(import.meta.dirname, "fixtures/rate-limit-429.json");

/** The real, committed fixture: `scope: "trial_daily"`, `cta: "add_key"`. */
const trialDailyAddKey = RateLimitPayload.parse(JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")));

/**
 * The fixture file only covers one `scope`/`cta` combination, so the other
 * is constructed inline here, based on the same real shape, per the task's
 * own instruction.
 */
const globalBudgetCloneLocal: RateLimitPayload = {
  error: "rate_limited",
  scope: "global_budget",
  message: "This app's shared daily budget has been used up for today. Please try again later.",
  retry_after_seconds: 5400,
  cta: "clone_local",
};

describe("RateLimitNotice", () => {
  it("renders the trial_daily / add_key fixture: scope framing, verbatim message, friendly duration, Settings link", () => {
    render(<RateLimitNotice payload={trialDailyAddKey} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    const title = alert.querySelector("[data-slot='alert-title']");
    expect(title).toHaveTextContent(/free runs/i);
    // The server's own message is shown verbatim.
    expect(screen.getByText(trialDailyAddKey.message)).toBeInTheDocument();
    // 34567s -> ~9h 36m.
    expect(screen.getByText(/~9h 36m/)).toBeInTheDocument();

    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", { name: /clone/i })).not.toBeInTheDocument();
  });

  it("renders the global_budget / clone_local variant: different scope framing and a repo link instead of Settings", () => {
    render(<RateLimitNotice payload={globalBudgetCloneLocal} />);

    const alert = screen.getByRole("alert");
    const title = alert.querySelector("[data-slot='alert-title']");
    expect(title).toHaveTextContent(/shared daily budget/i);
    expect(screen.getByText(globalBudgetCloneLocal.message)).toBeInTheDocument();
    // 5400s -> ~1h 30m.
    expect(screen.getByText(/~1h 30m/)).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    const cloneLink = screen.getByRole("link", { name: /clone/i });
    expect(cloneLink).toHaveAttribute("href", expect.stringContaining("github.com"));
  });

  it("is not rendered with the destructive Alert variant (this is an expected state, not a bug)", () => {
    render(<RateLimitNotice payload={trialDailyAddKey} />);
    const alert = screen.getByRole("alert");
    // The destructive variant's own text-color utility class; absence confirms the default variant.
    expect(alert.className).not.toMatch(/text-destructive/);
  });
});
