import { CollapsibleSection } from "@/components/primitives/collapsible-section";
import type { ToolCallEvent } from "@/lib/execution/events";
import { cn } from "@/lib/cn";

export interface ToolCallCardProps {
  /** One real `ToolCallEvent` from the stream — never raw/unvalidated JSON. */
  event: ToolCallEvent;
  className?: string;
}

/**
 * `args`/`result` are `z.unknown()` in `lib/execution/events.ts` on purpose
 * (their shape varies per tool), so this renders whatever value comes back
 * as readable, indented JSON rather than assuming an object/array shape.
 * `JSON.stringify` returns `undefined` (the JS value, not a string) for
 * `undefined` input, so that case is special-cased to a literal string.
 */
function formatUnknown(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * One expandable card per `ToolCallEvent`. `name` is always visible in the
 * header; `args`/`result` only render once expanded.
 *
 * Collapsed by default: unlike `DescriptionPanel` (primary page content,
 * open by default), a tool call is supplementary/debug detail mid-stream —
 * so this leans on `CollapsibleSection`'s own default (closed) rather than
 * passing `defaultOpen`.
 */
function ToolCallCard({ event, className }: ToolCallCardProps) {
  return (
    <div data-slot="tool-call-card" className={cn(className)}>
      <CollapsibleSection title={<span className="font-mono text-sm">{event.name}</span>}>
        <div className="flex flex-col gap-3">
          <div>
            <h4 className="mb-1 text-xs font-medium tracking-wide text-foreground uppercase">
              Arguments
            </h4>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
              {formatUnknown(event.args)}
            </pre>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-medium tracking-wide text-foreground uppercase">
              Result
            </h4>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
              {formatUnknown(event.result)}
            </pre>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export { ToolCallCard };
