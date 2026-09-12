"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Loader2 } from "lucide-react";

import { ArtifactMarkdown } from "@/components/execution/artifact/markdown";
import { DataTable } from "@/components/execution/artifact/data-table";
import { FileDownload } from "@/components/execution/artifact/file-download";
import { JsonTree } from "@/components/execution/artifact/json-tree";
import { LogStream } from "@/components/execution/log-stream";
import { RateLimitNotice } from "@/components/execution/rate-limit-notice";
import { RunError } from "@/components/execution/run-error";
import { StepTimeline } from "@/components/execution/step-timeline";
import { ToolCallCard } from "@/components/execution/tool-call-card";
import { TokenPane } from "@/components/execution/token-pane";
import { useRecipeRun, type RunFailure, type RunStatus } from "@/hooks/use-recipe-run";
import type {
  ArtifactEvent,
  LogEvent,
  RecipeEvent,
  ResultEvent,
  StepEvent,
  ToolCallEvent,
} from "@/lib/execution/events";
import type { RunPayload } from "@/lib/execution/run-client";
import { cn } from "@/lib/cn";

function renderArtifact(event: ArtifactEvent) {
  switch (event.kind) {
    case "json":
      return <JsonTree name={event.name} data={event.data} />;
    case "table":
      return <DataTable data={event.data} />;
    case "markdown":
      return <ArtifactMarkdown data={event.data} />;
    case "file":
      // Contract: a `kind: "file"` artifact always carries a non-null `url`
      // (the real fixture never sends both `null`) -- guarded anyway, since
      // this renders whatever the backend actually sent, not what it should.
      return event.url !== null ? (
        <FileDownload name={event.name} url={event.url} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {event.name} (no download link was provided for this file)
        </p>
      );
  }
}

export interface RunOutputViewProps {
  status: RunStatus;
  events: RecipeEvent[];
  result: ResultEvent | null;
  error: RunFailure | null;
  /** Present only for a retryable failure -- see `RunOutput`'s own doc comment. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The pure, hook-free half of `<RunOutput>`: given an already-accumulated
 * `events` array plus `status`/`result`/`error`, dispatches each event to
 * its renderer and composes the terminal state -- no data fetching, no
 * `useRecipeRun` of its own. Exported (not just used internally) so the
 * fixture-driven test (success criterion 6: every event type + every
 * `error_type` + the `429` notice render distinctly, with no backend
 * running) can drive it directly with real fixture arrays, rather than
 * routing everything through a mocked hook.
 *
 * Dispatch, never inline HTML: every event is handed to one of Phase 5's
 * renderers by `type` (and `ArtifactEvent.kind` for artifacts, via
 * `renderArtifact`) -- this component never renders event bytes itself.
 *
 * Grouped by type, not strictly chronologically interleaved (matching how
 * `StepTimeline`/`TokenPane`/`LogStream` were each built to consume a
 * *whole* array of their own event type, not one event at a time): steps
 * (the run's own progress) first, then tool calls (supplementary detail),
 * artifacts, the token stream (the run's primary "answer" content), then
 * logs (the most technical, least prominent detail), then the terminal
 * `result`. A terminal failure (`error`) renders last, as a banner --
 * critically, ALL of the above still renders above it. Partial output
 * (whatever streamed before the failure) is never cleared just because the
 * run ended in an error (Open Question 2's leaning).
 */
function RunOutputView({ status, events, result, error, onRetry, className }: RunOutputViewProps) {
  const steps = events.filter((event): event is StepEvent => event.type === "step");
  const toolCalls = events.filter((event): event is ToolCallEvent => event.type === "tool_call");
  const artifacts = events.filter((event): event is ArtifactEvent => event.type === "artifact");
  const tokens = events.filter((event) => event.type === "token");
  const logs = events.filter((event): event is LogEvent => event.type === "log");

  const hasPartialOutput =
    steps.length > 0 ||
    toolCalls.length > 0 ||
    artifacts.length > 0 ||
    tokens.length > 0 ||
    logs.length > 0;

  if (status === "idle") return null;

  return (
    <div data-slot="run-output" className={cn("flex flex-col gap-6", className)}>
      {steps.length > 0 && <StepTimeline events={steps} />}

      {toolCalls.length > 0 && (
        <div className="flex flex-col gap-2">
          {toolCalls.map((event) => (
            <ToolCallCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="flex flex-col gap-4">
          {artifacts.map((event) => (
            <div key={event.id}>{renderArtifact(event)}</div>
          ))}
        </div>
      )}

      {tokens.length > 0 && <TokenPane events={tokens} />}

      {logs.length > 0 && <LogStream events={logs} />}

      {status === "running" && !hasPartialOutput && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Running…
        </div>
      )}

      {result !== null && <JsonTree name="Result" data={result.data} />}

      {error !== null &&
        (error.kind === "rate_limit" && error.rateLimit ? (
          <RateLimitNotice payload={error.rateLimit} />
        ) : (
          <RunError
            // A transport-kind failure has no real `error_type` of its own
            // (it never reached a stream at all) -- "upstream_error" is the
            // closest semantic fit among the 5 in-stream types for "the
            // connection to the backend had a problem", per Task 11's own
            // documented allowance for this exact case.
            errorType={error.kind === "stream" ? (error.errorType ?? "recipe_error") : "upstream_error"}
            message={error.message}
            recoverable={error.kind === "transport" || (error.recoverable ?? false)}
            onRetry={error.kind === "transport" ? onRetry : undefined}
          />
        ))}
    </div>
  );
}

export interface RunOutputHandle {
  /** Starts (or restarts) a run with the given payload. */
  start: (payload: RunPayload) => void;
  /** Cancels the in-flight run, if any -- what `RecipeViewHandle.cancelRun` (catalog) delegates to. */
  cancel: () => void;
}

export interface RunOutputProps {
  slug: string;
  className?: string;
}

/**
 * The single component `catalog`/`workspace` mount below a recipe's run
 * form. Owns `useRecipeRun(slug)` itself and exposes `start`/`cancel` via
 * a ref handle (`RunOutputHandle`) -- `catalog`'s `RunForm.onSubmit` calls
 * `ref.current.start({ params, config })`, and `RecipeViewHandle.cancelRun`
 * (already stubbed as a documented no-op TODO in `app/r/[slug]/recipe-view.tsx`)
 * calls `ref.current.cancel()` -- rather than either component reaching
 * into `useRecipeRun`'s state directly. That wiring itself is Task 14's
 * job, not this one; this component only needs to exist with a stable
 * shape for Task 14 to attach to.
 *
 * The last `start()` payload is kept in a ref so a transport-failure retry
 * (`onRetry`, passed down to `<RunOutputView>`) can resubmit the exact same
 * request without the caller needing to remember/re-supply it.
 */
export const RunOutput = forwardRef<RunOutputHandle, RunOutputProps>(function RunOutput(
  { slug, className },
  ref
) {
  const { status, events, result, error, start, cancel } = useRecipeRun(slug);
  const lastPayloadRef = useRef<RunPayload | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      start: (payload: RunPayload) => {
        lastPayloadRef.current = payload;
        start(payload);
      },
      cancel,
    }),
    [start, cancel]
  );

  // Reads `lastPayloadRef.current` only inside the callback itself (invoked
  // later, from a click handler) -- never during render, which React's
  // rules-of-hooks lint (correctly) flags as unsafe.
  const handleRetry = useCallback(() => {
    if (lastPayloadRef.current) start(lastPayloadRef.current);
  }, [start]);

  const onRetry = error?.kind === "transport" ? handleRetry : undefined;

  return (
    <RunOutputView
      status={status}
      events={events}
      result={result}
      error={error}
      onRetry={onRetry}
      className={className}
    />
  );
});

export { RunOutputView };
