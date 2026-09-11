import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface TopbarProps {
  /**
   * The slot `workspace` fills with its tab strip (see the `Shell({ nav,
   * tabs, children })` sample in SPEC-app-shell.md — mounted as
   * `<Topbar>{tabs}</Topbar>`). Rendered on the left. Opaque to this
   * component: it never inspects or shapes what it's handed.
   */
  children?: ReactNode;
  /**
   * Fixed actions rendered on the right. No module fills this yet (kept
   * empty by default) — it's a seam left open for one that will, without
   * needing to touch this file.
   */
  actions?: ReactNode;
  className?: string;
}

export function Topbar({ children, actions, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "flex h-14 w-full shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-(--space-gutter)",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}
