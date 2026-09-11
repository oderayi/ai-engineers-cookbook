"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocalStorageBoolean } from "@/hooks/use-local-storage-boolean";
import { cn } from "@/lib/cn";

import { MobileDrawer } from "./mobile-drawer";
import { SidebarNav, type NavModel } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

const COLLAPSE_STORAGE_KEY = "skillet.sidebar.collapsed";

export interface SidebarProps {
  nav: NavModel;
  className?: string;
}

/**
 * Composes sidebar-nav.tsx + theme-toggle.tsx + mobile-drawer.tsx into the
 * full sidebar: a persistent, collapsible rail >= md, a drawer < md (per
 * SPEC-app-shell.md Confirmed Decision 2). Both surfaces render the same
 * `nav` — there is exactly one nav model, two presentations of it.
 */
export function Sidebar({ nav, className }: SidebarProps) {
  const [collapsed, setCollapsed] = useLocalStorageBoolean(COLLAPSE_STORAGE_KEY, false);

  return (
    <div className={cn("contents", className)}>
      {/* Persistent rail, >= md. Hidden entirely below md so it takes no
          layout space — the mobile trigger below is what surfaces the nav
          there instead. */}
      <aside
        className={cn(
          "hidden md:flex md:h-full md:flex-col md:border-r md:border-sidebar-border",
          "md:bg-sidebar md:text-sidebar-foreground",
          collapsed ? "md:w-16" : "md:w-(--sidebar-w)"
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <SidebarNav nav={nav} collapsed={collapsed} />
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-t border-sidebar-border p-3",
            collapsed ? "flex-col" : "justify-between"
          )}
        >
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile trigger + drawer, < md. Floating rather than routed through
          Topbar so Sidebar stays the single owner of "how the nav appears
          per viewport" without Topbar needing to know about it. */}
      <div className="fixed top-3 left-3 z-40 md:hidden">
        <MobileDrawer triggerLabel="Open menu" title="Navigation">
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarNav nav={nav} />
            </div>
            <div className="flex shrink-0 items-center border-t border-sidebar-border pt-3">
              <ThemeToggle />
            </div>
          </div>
        </MobileDrawer>
      </div>
    </div>
  );
}
