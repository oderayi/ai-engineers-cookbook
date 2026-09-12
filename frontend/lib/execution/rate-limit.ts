import { z } from "zod";

/**
 * The `429` contract `trial-limits` emits and this module renders (per
 * `SPEC-execution.md`'s own "`429` contract" section) — plain, un-aliased
 * snake_case, same posture as `lib/execution/events.ts`'s event schemas.
 * `trial-limits` owns the actual values; this module only owns the shape.
 */
export const RateLimitPayload = z.object({
  error: z.literal("rate_limited"),
  scope: z.enum(["trial_daily", "global_budget"]),
  message: z.string(),
  retry_after_seconds: z.number(),
  cta: z.enum(["add_key", "clone_local"]),
});
export type RateLimitPayload = z.infer<typeof RateLimitPayload>;
