"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TabStripItem } from "@/components/workspace/tab-strip-item";
import type { RunStatus } from "@/hooks/use-recipe-run";
import { cn } from "@/lib/cn";
import type { Tab } from "@/lib/workspace/tabs-reducer";

export interface TabStripProps {
  tabs: Tab[];
  activeTabId: string | null;
  /**
   * `tabId -> RunStatus`. A map, not a single value, because this component
   * doesn't own any tab's live run state (that lives in `<RecipeView>`,
   * inside `tab-panels.tsx` — Task 8) — it only renders whatever it's
   * handed. A tab with no entry here renders as `idle`.
   */
  statuses: Record<string, RunStatus>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /**
   * The "+" control's click intent. This component does NOT decide what a
   * new tab even means (which recipe, if any) — per the spec's Confirmed
   * Decision 11 / Open Question 2, that decision belongs to whatever
   * composes this component (Task 9).
   */
  onNewTab: () => void;
  className?: string;
}

/**
 * The workspace tab strip: one `TabStripItem` per open tab, in order, plus a
 * "+" new-tab control. Renders safely with zero tabs — the empty *workspace*
 * state (`EmptyWorkspace`, Task 8) is a separate component this one does not
 * render itself; this component's own "empty" state is simply an empty tab
 * list next to a still-present "+" button.
 */
export function TabStrip({
  tabs,
  activeTabId,
  statuses,
  onActivate,
  onClose,
  onNewTab,
  className,
}: TabStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Open recipe tabs"
      className={cn("flex min-w-0 items-center gap-1", className)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <TabStripItem
            key={tab.id}
            tab={tab}
            status={statuses[tab.id] ?? "idle"}
            active={tab.id === activeTabId}
            onActivate={() => onActivate(tab.id)}
            onClose={() => onClose(tab.id)}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="New tab"
        onClick={onNewTab}
        className="shrink-0"
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
