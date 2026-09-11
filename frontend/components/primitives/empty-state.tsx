import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

interface EmptyStateProps {
  /** A `lucide-react` icon component, e.g. `Inbox`. Rendered decoratively. */
  icon: LucideIcon;
  /** The empty-state message. */
  message: React.ReactNode;
  /** Optional action slot, e.g. a button or link that resolves the empty state. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * A presentational placeholder for "nothing here yet" states: an icon, a
 * message, and an optional action slot for a way out (e.g. "Browse catalog").
 */
function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
