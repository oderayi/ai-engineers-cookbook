import Link from "next/link";
import { Clock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RateLimitPayload } from "@/lib/execution/rate-limit";
import { cn } from "@/lib/cn";

export interface RateLimitNoticeProps {
  /** The exact `429` contract payload (already zod-validated) — see `lib/execution/rate-limit.ts`. */
  payload: RateLimitPayload;
  className?: string;
}

/** Repo URL for the `clone_local` CTA — this project's own GitHub remote (`origin`). */
const REPO_URL = "https://github.com/oderayi/ai-engineers-cookbook";

const SCOPE_HEADLINE: Record<RateLimitPayload["scope"], string> = {
  trial_daily: "You've used your free runs for today",
  global_budget: "This app's shared daily budget is used up",
};

/**
 * Formats a retry-after duration as a short, human-friendly string (e.g.
 * `"~9h 36m"`) rather than a raw seconds count. Rounds to the nearest
 * minute; drops the minutes component when it rounds to a whole number of
 * hours, and drops hours entirely under 60 minutes.
 */
function formatRetryAfter(totalSeconds: number): string {
  if (totalSeconds <= 0) return "shortly";

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes <= 0) return "less than a minute";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `~${minutes}m`;
  if (minutes <= 0) return `~${hours}h`;
  return `~${hours}h ${minutes}m`;
}

/**
 * Renders the `429` rate-limit contract from `docs/SPEC-execution.md`
 * ("`429` contract" section) — the "add your own key / clone locally"
 * nudge, never a generic error. `trial-limits` owns the values; this module
 * owns the shape and this rendering.
 *
 * Uses the non-destructive `Alert` variant: running out of free/shared
 * quota is an expected, informative state, not a bug.
 */
function RateLimitNotice({ payload, className }: RateLimitNoticeProps) {
  return (
    <Alert data-slot="rate-limit-notice" className={cn(className)}>
      <Clock aria-hidden="true" />
      <AlertTitle>{SCOPE_HEADLINE[payload.scope]}</AlertTitle>
      <AlertDescription>
        <p>{payload.message}</p>
        <p>Try again in {formatRetryAfter(payload.retry_after_seconds)}.</p>
        {payload.cta === "add_key" ? (
          <p>
            <Link href="/settings">Add your own API key in Settings</Link> to keep going right
            away.
          </p>
        ) : (
          <p>
            Or{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              clone the project locally
            </a>{" "}
            to run it without this limit.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export { RateLimitNotice };
