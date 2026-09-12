import { describe, expect, it } from "vitest";

import { RateLimitPayload } from "@/lib/execution/rate-limit";

describe("RateLimitPayload", () => {
  it("parses the real 429 contract shape from SPEC-execution.md", () => {
    const payload = {
      error: "rate_limited",
      scope: "trial_daily",
      message: "You've used your 2 free runs today.",
      retry_after_seconds: 34567,
      cta: "add_key",
    };
    expect(RateLimitPayload.parse(payload)).toEqual(payload);
  });

  it("accepts the global_budget scope and clone_local cta", () => {
    const payload = {
      error: "rate_limited",
      scope: "global_budget",
      message: "The daily budget has been used up.",
      retry_after_seconds: 3600,
      cta: "clone_local",
    };
    expect(RateLimitPayload.parse(payload)).toEqual(payload);
  });

  it("rejects a scope outside the 2 known values", () => {
    expect(() =>
      RateLimitPayload.parse({
        error: "rate_limited",
        scope: "unknown_scope",
        message: "x",
        retry_after_seconds: 1,
        cta: "add_key",
      }),
    ).toThrow();
  });

  it("rejects a cta outside the 2 known values", () => {
    expect(() =>
      RateLimitPayload.parse({
        error: "rate_limited",
        scope: "trial_daily",
        message: "x",
        retry_after_seconds: 1,
        cta: "upgrade",
      }),
    ).toThrow();
  });

  it("rejects a payload with the wrong 'error' discriminant", () => {
    expect(() =>
      RateLimitPayload.parse({
        error: "not_rate_limited",
        scope: "trial_daily",
        message: "x",
        retry_after_seconds: 1,
        cta: "add_key",
      }),
    ).toThrow();
  });
});
