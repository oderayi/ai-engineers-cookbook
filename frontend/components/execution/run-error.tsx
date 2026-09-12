import { Bug, Clock, CloudOff, FileWarning, Scissors, type LucideIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ErrorEvent } from "@/lib/execution/events";
import { cn } from "@/lib/cn";

export interface RunErrorProps {
  /** One of the 5 in-stream `error_type`s a recipe run can end in. */
  errorType: ErrorEvent["error_type"];
  /** The server's own message — shown alongside the type-specific copy for extra detail. */
  message: string;
  /** Whether the run's own `ErrorEvent` marked this recoverable (informational only — see below). */
  recoverable: boolean;
  /**
   * Renders a "Retry" button when provided; renders no retry affordance
   * when absent.
   *
   * `run-error.tsx` only ever renders `ErrorEvent`-shaped, in-stream
   * failures — all 5 `error_type`s above come from `recipe-framework`'s
   * executor after a stream was already established, not from a transport
   * failure. None of them are naturally "click retry and it'll probably
   * work" (a `bad_input` needs different input; a `recipe_error` needs a
   * code fix; `timeout`/`output_limit` will likely just fail the same way
   * again). So this component itself never assumes retry is appropriate —
   * it takes the decision as a prop instead of inferring it from
   * `errorType`/`recoverable`.
   *
   * That keeps this component correct for a case it can't see from here:
   * `useRecipeRun`'s `RunFailure.kind === "transport"` (network/5xx, *before*
   * any event stream) is a distinct failure this component doesn't natively
   * render (it has no `error_type` at all), but the orchestrator task may
   * choose to route a transport failure through this same component (using
   * its `message`, with `errorType`/`recoverable` set to whatever it
   * considers a reasonable transport default) specifically so it can pass a
   * real `onRetry` — that's exactly the case this prop exists for. A `429`
   * (`RunFailure.kind === "rate_limit"`) must never reach this component at
   * all — that's `<RateLimitNotice>`'s job exclusively.
   */
  onRetry?: () => void;
  className?: string;
}

interface ErrorCopy {
  title: string;
  description: string;
  Icon: LucideIcon;
}

const ERROR_COPY: Record<ErrorEvent["error_type"], ErrorCopy> = {
  timeout: {
    title: "Run timed out",
    description: "This run took too long and was stopped.",
    Icon: Clock,
  },
  output_limit: {
    title: "Output limit reached",
    description: "This run produced too much output and was stopped.",
    Icon: Scissors,
  },
  recipe_error: {
    title: "Recipe error",
    description: "Something went wrong inside this recipe while it was running.",
    Icon: Bug,
  },
  bad_input: {
    title: "Invalid input",
    description: "The input provided couldn't be used to run this recipe.",
    Icon: FileWarning,
  },
  upstream_error: {
    title: "Upstream provider error",
    description: "The AI provider this recipe depends on had a problem.",
    Icon: CloudOff,
  },
};

/**
 * Renders one of the 5 in-stream `error_type`s (never a `429` — see
 * `<RateLimitNotice>` for that) with distinct copy and an icon per type,
 * plus the server's own `message` for extra detail.
 */
function RunError({ errorType, message, recoverable, onRetry, className }: RunErrorProps) {
  const { title, description, Icon } = ERROR_COPY[errorType];

  return (
    <Alert variant="destructive" data-slot="run-error" className={cn(className)}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        <p>{message}</p>
        {recoverable ? <p>You may be able to fix this and try again.</p> : null}
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-2">
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export { RunError };
