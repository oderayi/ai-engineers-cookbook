"use client";

import { Check, CircleAlert, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/hooks/use-recipe-run";
import { cn } from "@/lib/cn";
import type { Tab } from "@/lib/workspace/tabs-reducer";

export interface TabStripItemProps {
  tab: Tab;
  /**
   * That tab's own live run status. This component doesn't own or compute
   * it — Task 9's real composition point (`tab-panels.tsx`'s
   * `onStatusChange` per tab) supplies it; this task's own tests pass any
   * value directly.
   */
  status: RunStatus;
  /** Whether this is the currently-selected tab in the strip. */
  active: boolean;
  /** Fired when the tab body (not the close button) is activated. */
  onActivate: () => void;
  /** Fired when the close ("x") control is activated. */
  onClose: () => void;
}

/**
 * One entry in the tab strip: a status dot, the tab's title, and a close
 * button.
 *
 * ## Title
 * There is no recipe title available at this layer — this component only
 * ever sees a `Tab` (`{ id, slug }`, from `lib/workspace/tabs-reducer.ts`),
 * never recipe metadata. `tab.slug` is used directly as the visible label.
 * A richer label (e.g. the recipe's real title) is a decision for whatever
 * composes this component with catalog data (Task 9), not this component.
 *
 * ## Tooltip
 * Deliberately NOT using `components/ui/tooltip.tsx` here: that component
 * wraps Base UI's `Tooltip.Root`, which opens on a hover delay and portals
 * its content — exercising it in a test means either faking timers/pointer
 * events around an async, portal-rendered popup, or asserting nothing more
 * than "it renders," neither of which is worth the brittleness for a
 * feature whose entire job is "show the full text somewhere." A native
 * `title` attribute on the truncated label gives the same on-hover
 * readability with zero extra runtime behavior and is trivially inspectable
 * in a test (`element.title`). Revisit if a richer, styled tooltip becomes a
 * real product requirement.
 *
 * ## Status dot
 * Reflects `status` unconditionally — it does not care whether this tab is
 * `active`, per spec Confirmed Decision 10 ("visible even when the tab is
 * inactive"). `idle` gets a plain neutral dot (no icon): there is nothing
 * to report yet, so a quiet dot reads better than borrowing an icon that
 * would imply "in progress" or "attention needed."
 */
export function TabStripItem({ tab, status, active, onActivate, onClose }: TabStripItemProps) {
  return (
    <div
      role="tab"
      aria-selected={active}
      data-state={active ? "active" : "inactive"}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        // Only react when the row itself is the key's target, not a
        // descendant (e.g. the close button) whose own keydown would
        // otherwise bubble up here and spuriously re-activate the tab —
        // the same bug class the close-button click guards against below.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group/tab flex h-8 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-md border px-2",
        "cursor-pointer text-sm",
        "outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-border bg-background text-foreground"
          : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <StatusDot status={status} />
      <span title={tab.slug} className="min-w-0 max-w-32 flex-1 truncate">
        {tab.slug}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Close ${tab.slug}`}
        onClick={(event) => {
          // Prevent the row's own onClick (onActivate) from also firing —
          // without this, closing a background tab would activate it first.
          event.stopPropagation();
          onClose();
        }}
        className="shrink-0"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

function StatusDot({ status }: { status: RunStatus }) {
  switch (status) {
    case "running":
      return (
        <span role="img" aria-label="Running" data-status="running" className="inline-flex shrink-0">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" />
        </span>
      );
    case "done":
      return (
        <span role="img" aria-label="Done" data-status="done" className="inline-flex shrink-0">
          <Check aria-hidden="true" className="size-3.5 text-primary" />
        </span>
      );
    case "error":
      return (
        <span role="img" aria-label="Error" data-status="error" className="inline-flex shrink-0">
          <CircleAlert aria-hidden="true" className="size-3.5 text-destructive" />
        </span>
      );
    case "idle":
      return (
        <span role="img" aria-label="Idle" data-status="idle" className="inline-flex shrink-0">
          <span aria-hidden="true" className="block size-2 rounded-full bg-muted-foreground/40" />
        </span>
      );
  }
}
