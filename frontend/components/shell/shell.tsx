import type { ReactNode } from "react";

import { Sidebar } from "./sidebar";
import type { NavModel } from "./sidebar-nav";
import { Topbar } from "./topbar";

export interface ShellProps {
  nav: NavModel;
  tabs?: ReactNode;
  children: ReactNode;
}

/**
 * The application frame (SPEC-app-shell.md Code Style sample): sidebar on
 * the left, topbar + scrollable main on the right, content width-constrained
 * in main. Downstream modules (`workspace`, `catalog`) fill `tabs` and
 * `children` without ever touching this file (success criterion 7).
 */
export function Shell({ nav, tabs, children }: ShellProps) {
  return (
    <div className="grid h-dvh grid-cols-[var(--sidebar-w)_1fr] max-md:grid-cols-1">
      <Sidebar nav={nav} />
      <div className="flex min-w-0 flex-col">
        <Topbar>{tabs}</Topbar>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-(--content-max) px-(--space-gutter) py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
