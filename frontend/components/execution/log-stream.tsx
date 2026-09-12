import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import type { LogEvent } from "@/lib/execution/events";
import { cn } from "@/lib/cn";

export interface LogStreamProps {
  /**
   * Already filtered to just `LogEvent`s by the caller, matching
   * `StepTimeline`'s and `TokenPane`'s own choice of a narrow, pre-filtered
   * prop type over accepting the full mixed `RecipeEvent[]` union.
   */
  events: LogEvent[];
  className?: string;
}

const LEVEL_ICON: Record<LogEvent["level"], typeof Info> = {
  info: Info,
  warn: TriangleAlert,
  error: CircleAlert,
};

const LEVEL_CLASS: Record<LogEvent["level"], string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-500",
  error: "text-destructive",
};

/**
 * Renders a stream of `LogEvent`s in the given order, one line per event,
 * with `info`/`warn`/`error` levels visually distinguished by both icon
 * and color.
 *
 * An empty `events` array renders an empty list -- no placeholder text --
 * since a run that hasn't logged anything yet isn't an error state worth
 * calling out, and the surrounding page (a later task) is better placed to
 * decide whether an empty-state message belongs above/around this
 * component.
 */
function LogStream({ events, className }: LogStreamProps) {
  return (
    <ol data-slot="log-stream" className={cn("flex flex-col gap-1", className)}>
      {events.map((event, index) => {
        const Icon = LEVEL_ICON[event.level];
        return (
          <li
            key={index}
            data-slot="log-stream-row"
            data-level={event.level}
            className="flex items-start gap-2"
          >
            <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", LEVEL_CLASS[event.level])} />
            <span className={cn("text-sm", LEVEL_CLASS[event.level])}>{event.message}</span>
          </li>
        );
      })}
    </ol>
  );
}

export { LogStream };
