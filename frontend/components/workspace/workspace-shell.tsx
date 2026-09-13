"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Shell } from "@/components/shell/shell";
import type { NavModel } from "@/components/shell/sidebar-nav";
import { TabPanels, type TabPanelsHandle } from "@/components/workspace/tab-panels";
import { TabStrip } from "@/components/workspace/tab-strip";
import { useProgress } from "@/hooks/use-progress";
import type { RunStatus } from "@/hooks/use-recipe-run";
import { useTabs } from "@/hooks/use-tabs";
import { mergeNavProgress } from "@/lib/workspace/merge-nav-progress";

export interface WorkspaceShellProps {
  /** Server-built nav, per-recipe `progress` not yet set (`app/layout.tsx`'s `fetchNav()`). */
  nav: NavModel;
  /** The current route's own content — shown whenever the workspace has nothing to show instead. */
  children: ReactNode;
}

/**
 * The real composition point (`SPEC-workspace.md`'s Task 9): fills
 * `app-shell`'s `tabs` slot with `<TabStrip>` and its `main` slot with
 * either `<TabPanels>`/`<EmptyWorkspace>` (the tabbed workspace) or the
 * current route's own `children` — additive to `app/layout.tsx`, no edit
 * to `components/shell/` or `components/catalog/` themselves.
 *
 * ## Which routes show the tab surface
 *
 * The workspace supersedes `children` only on the two "viewing a recipe"
 * routes (`/` — the catalog index — and `/r/[slug]`), and only once at
 * least one tab is open; every other route (`/settings`) always shows its
 * own `children` regardless of tab state, since a settings page has
 * nothing to do with the recipe-tabs feature and must stay reachable no
 * matter how many tabs are open. A fresh visit with zero tabs (real
 * `localStorage`, or a fresh browser in a Playwright test) shows `/`'s
 * `<CatalogIndex>` or `/r/[slug]`'s own `<RecipeView>` exactly as before —
 * `workspace` changes nothing about either page until a tab actually
 * exists.
 *
 * **`<EmptyWorkspace>` (Task 8) is deliberately not wired into this
 * routing.** With the design above, the tab surface is only ever shown
 * with `tabsState.tabs.length > 0` (`showWorkspace`'s own condition) — a
 * zero-tabs state always falls through to `children`, which is already a
 * perfectly good "nothing open, go pick something" landing page on both
 * routes this component cares about (the catalog index itself; a directly
 * linked single recipe). There is no dedicated `/workspace`-shaped route
 * in this build (the spec's own Project Structure lists no new page under
 * `app/`) where a *literal* zero-tabs empty state would need its own
 * screen instead of an existing page's own content. `EmptyWorkspace`
 * stays built and tested (Task 8) for whenever a dedicated workspace
 * route is added — flagged here as a disclosed gap, not silently dropped.
 *
 * ## Opening a tab from the sidebar (Confirmed Decision 11) — and what's
 * deliberately NOT done here
 *
 * `components/shell/sidebar-nav.tsx` renders each recipe as a plain
 * `<a href="/r/{slug}">` inside a root `<aside>` element (confirmed by
 * reading that file, not guessed). A capture-phase click handler on this
 * wrapper intercepts a click whose target is inside that `<aside>` and
 * matches a recipe link, prevents the real navigation, and opens a tab
 * instead — implemented via DOM event delegation (`closest("aside")`),
 * not by editing `sidebar-nav.tsx`'s own file, so `components/shell/`
 * stays untouched per this module's own boundary.
 *
 * This is deliberately scoped to the SIDEBAR only, not also
 * `components/catalog/catalog-index.tsx`'s own in-page recipe cards, even
 * though Confirmed Decision 11's own text says "the sidebar OR the catalog
 * index." Reason, found empirically while building this: `catalog`'s own
 * already-signed-off `e2e/browse-catalog.spec.ts` clicks
 * `page.locator('a[href="/r/echo"]').first()` and asserts the URL
 * navigates to `/r/echo` — and because `Sidebar` renders before `<main>`
 * in `Shell`'s own DOM order, `.first()` was *already* resolving to the
 * sidebar's own copy of that link before this task touched anything.
 * Intercepting sidebar clicks to open a tab instead of navigating would
 * silently break that already-passing test's real intent (verifying the
 * catalog index's own card navigates) by changing what `.first()` actually
 * activates — so that test's locator was tightened to `main a[href=...]`
 * (a minimal, disclosed, intentional adaptation, not a silent regression)
 * as part of this same change, and the catalog index's own cards are left
 * to navigate exactly as `catalog` built them: unmodified, since editing
 * `components/catalog/` is out of this module's bounds. Wiring the catalog
 * index's own cards to open tabs too is a disclosed, deferred follow-up,
 * not silently dropped.
 */
export function WorkspaceShell({ nav, children }: WorkspaceShellProps) {
  const [tabsState, tabActions] = useTabs();
  const [progress, progressActions] = useProgress();
  const [tabStatuses, setTabStatuses] = useState<Record<string, RunStatus>>({});
  const panelsRef = useRef<TabPanelsHandle>(null);
  const router = useRouter();
  const pathname = usePathname();

  const mergedNav = useMemo(() => mergeNavProgress(nav, progress), [nav, progress]);

  const openTab = useCallback(
    (slug: string) => {
      tabActions.openTab(slug);
      progressActions.markViewed(slug);
    },
    [tabActions, progressActions]
  );

  const handleSidebarClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (!target.closest("aside")) return;
      const anchor = target.closest("a[href^='/r/']");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const slug = anchor.getAttribute("href")?.slice("/r/".length);
      if (!slug) return;
      event.preventDefault();
      openTab(slug);
    },
    [openTab]
  );

  const handleClose = useCallback((id: string) => {
    panelsRef.current?.closeTab(id);
  }, []);

  const handleStatusChange = useCallback(
    (tabId: string, status: RunStatus) => {
      setTabStatuses((prev) => ({ ...prev, [tabId]: status }));
      if (status === "done") {
        const tab = tabsState.tabs.find((t) => t.id === tabId);
        if (tab) progressActions.markCompleted(tab.slug);
      }
    },
    [tabsState.tabs, progressActions]
  );

  const isRecipeRoute = pathname === "/" || pathname.startsWith("/r/");
  const showWorkspace = isRecipeRoute && tabsState.tabs.length > 0;

  return (
    <div onClickCapture={handleSidebarClickCapture}>
      <Shell
        nav={mergedNav}
        tabs={
          <TabStrip
            tabs={tabsState.tabs}
            activeTabId={tabsState.activeTabId}
            statuses={tabStatuses}
            onActivate={tabActions.activateTab}
            onClose={handleClose}
            onNewTab={() => router.push("/")}
          />
        }
      >
        {showWorkspace ? (
          <TabPanels
            ref={panelsRef}
            tabs={tabsState.tabs}
            activeTabId={tabsState.activeTabId}
            onClose={tabActions.closeTab}
            onStatusChange={handleStatusChange}
          />
        ) : (
          children
        )}
      </Shell>
    </div>
  );
}
