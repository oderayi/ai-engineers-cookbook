"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";

interface CollapsibleSectionOwnProps {
  /** Content revealed when the section is open. */
  children: React.ReactNode;
  /** Uncontrolled initial open state. Defaults to closed. */
  defaultOpen?: boolean;
  /** Class applied to the section root. */
  className?: string;
  /** Class applied to the content panel. */
  contentClassName?: string;
}

type CollapsibleSectionProps = CollapsibleSectionOwnProps &
  (
    | { title: React.ReactNode; trigger?: never }
    | { title?: never; trigger: React.ReactNode }
  );

/**
 * A collapsible disclosure section built on `components/ui/collapsible.tsx`
 * (Base UI). `aria-expanded`/`aria-controls` and Enter/Space keyboard
 * handling come from the underlying native `<button>` trigger for free.
 *
 * Pass either `title` (rendered as the trigger's label, with a chevron) or a
 * fully custom `trigger` slot.
 */
function CollapsibleSection({
  title,
  trigger,
  children,
  defaultOpen = false,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      data-slot="collapsible-section"
      className={cn("rounded-lg border border-border", className)}
    >
      <CollapsibleTrigger
        className={cn(
          "group/collapsible-trigger flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium text-foreground",
          "outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        )}
      >
        {trigger ?? title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/collapsible-trigger:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "px-4 pb-4 text-sm text-muted-foreground",
          contentClassName
        )}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export { CollapsibleSection };
export type { CollapsibleSectionProps };
