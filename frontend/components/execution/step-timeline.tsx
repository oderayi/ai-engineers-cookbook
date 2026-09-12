import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { StepEvent } from "@/lib/execution/events";
import { cn } from "@/lib/cn";

export interface StepTimelineProps {
  /**
   * Already filtered to just `StepEvent`s by the caller (the orchestrator
   * that accumulates the raw `RecipeEvent[]` stream). This component does
   * not accept the full mixed union and filter internally -- keeping the
   * prop type narrow means a caller can't accidentally forget to filter and
   * get silently-ignored events, and it keeps this component decoupled
   * from the other six event shapes it has no use for.
   */
  events: StepEvent[];
  className?: string;
}

/** One collapsed timeline row: a step's `start` merged with its `finish`/`error`, if seen. */
interface StepRow {
  id: string;
  name: string;
  detail: string | null;
  /** Mirrors `StepEvent["status"]` directly: "start" here means still in progress. */
  status: StepEvent["status"];
}

/**
 * Collapses a stream of `StepEvent`s into one row per `id`: a `start`
 * followed later by a `finish`/`error` for the same `id` becomes a single
 * row that transitions from "in progress" to "done"/"error", rather than
 * two separate rows.
 *
 * A row's position in the returned array is fixed by the first time its
 * `id` appears in `events` (typically the `start` event) -- later events
 * for that same `id` update the row in place instead of moving or
 * duplicating it, so a step that started first is always listed first even
 * if a step that started later finishes sooner.
 *
 * Whichever event was seen last for a given `id` wins for `name`/`detail`/
 * `status` -- in the normal start-then-finish sequence this means the
 * `finish` (or `error`) event's `detail` supersedes the `start` event's
 * (typically `null`) `detail`, which is what makes e.g. `happy-path.jsonl`'s
 * `finish` detail of `"done"` show up instead of the `start`'s `null`.
 */
function buildStepRows(events: StepEvent[]): StepRow[] {
  const rows: StepRow[] = [];
  const rowIndexById = new Map<string, number>();

  for (const event of events) {
    const existingIndex = rowIndexById.get(event.id);
    if (existingIndex === undefined) {
      rowIndexById.set(event.id, rows.length);
      rows.push({ id: event.id, name: event.name, detail: event.detail, status: event.status });
    } else {
      const row = rows[existingIndex];
      row.name = event.name;
      row.detail = event.detail;
      row.status = event.status;
    }
  }

  return rows;
}

const STATUS_ICON: Record<StepEvent["status"], typeof Loader2> = {
  start: Loader2,
  finish: CheckCircle2,
  error: XCircle,
};

const STATUS_ICON_CLASS: Record<StepEvent["status"], string> = {
  start: "animate-spin text-muted-foreground",
  finish: "text-primary",
  error: "text-destructive",
};

const STATUS_LABEL: Record<StepEvent["status"], string> = {
  start: "In progress",
  finish: "Done",
  error: "Error",
};

/**
 * Renders a vertical timeline of recipe execution steps, one row per step
 * `id`. See `buildStepRows` for how `start`/`finish`/`error` events for the
 * same `id` collapse into a single row.
 */
function StepTimeline({ events, className }: StepTimelineProps) {
  const rows = buildStepRows(events);

  return (
    <ol data-slot="step-timeline" className={cn("flex flex-col gap-3", className)}>
      {rows.map((row) => {
        const Icon = STATUS_ICON[row.status];
        return (
          <li
            key={row.id}
            data-slot="step-timeline-row"
            data-status={row.status}
            className="flex items-start gap-2.5"
          >
            <Icon
              aria-hidden="true"
              className={cn("mt-0.5 size-4 shrink-0", STATUS_ICON_CLASS[row.status])}
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{row.name}</span>
              <span
                className={cn(
                  "text-xs",
                  row.status === "error" ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {STATUS_LABEL[row.status]}
                {row.detail !== null ? ` — ${row.detail}` : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { StepTimeline };
