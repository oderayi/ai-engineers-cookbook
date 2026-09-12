import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TabStrip } from "@/components/workspace/tab-strip";
import { TabStripItem } from "@/components/workspace/tab-strip-item";
import type { RunStatus } from "@/hooks/use-recipe-run";
import type { Tab } from "@/lib/workspace/tabs-reducer";

// `vitest.config.ts` runs with `globals: false`, so Testing Library's
// built-in auto-cleanup never self-registers (matches every other
// `components/shell`/`components/catalog` test in this repo).
afterEach(() => {
  cleanup();
});

const tabA: Tab = { id: "tab-a", slug: "prompt-basics" };
const tabB: Tab = { id: "tab-b", slug: "tokens-and-context" };

describe("TabStripItem", () => {
  it("renders the tab's slug as its visible label", () => {
    render(
      <TabStripItem tab={tabA} status="idle" active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("prompt-basics")).toBeInTheDocument();
  });

  it("applies a real CSS truncation class (with a bounding width) to the title", () => {
    const longTab: Tab = { id: "tab-long", slug: "a-very-long-recipe-slug-that-should-truncate-visually" };
    render(
      <TabStripItem tab={longTab} status="idle" active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    const label = screen.getByText(longTab.slug);
    expect(label.className).toMatch(/\btruncate\b/);
    expect(label.className).toMatch(/max-w-/);
  });

  it.each<[RunStatus, string]>([
    ["idle", "Idle"],
    ["running", "Running"],
    ["done", "Done"],
    ["error", "Error"],
  ])("renders a distinct status dot for status=%s", (status, label) => {
    render(
      <TabStripItem tab={tabA} status={status} active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    const dot = screen.getByRole("img", { name: label });
    expect(dot).toHaveAttribute("data-status", status);
  });

  it("renders visually distinct dots across all four statuses (no two share a data-status)", () => {
    const statuses: RunStatus[] = ["idle", "running", "done", "error"];
    const seen = new Set<string>();
    for (const status of statuses) {
      const { unmount } = render(
        <TabStripItem tab={tabA} status={status} active={false} onActivate={vi.fn()} onClose={vi.fn()} />
      );
      const dot = screen.getByRole("img");
      seen.add(dot.getAttribute("data-status") ?? "");
      unmount();
    }
    expect(seen.size).toBe(4);
  });

  it("shows the running dot's spin animation via Loader2", () => {
    const { container } = render(
      <TabStripItem tab={tabA} status="running" active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    const icon = container.querySelector('[data-status="running"] svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("class")).toMatch(/animate-spin/);
  });

  it("shows the status dot regardless of active state", () => {
    render(
      <TabStripItem tab={tabA} status="error" active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByRole("img", { name: "Error" })).toBeInTheDocument();
  });

  it("calls onActivate when the tab body is clicked", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <TabStripItem tab={tabA} status="idle" active={false} onActivate={onActivate} onClose={vi.fn()} />
    );
    await user.click(screen.getByText("prompt-basics"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("calls onClose (not onActivate) when the close button is clicked, without bubbling", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <TabStripItem tab={tabA} status="idle" active={false} onActivate={onActivate} onClose={onClose} />
    );
    await user.click(screen.getByRole("button", { name: `Close ${tabA.slug}` }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("gives the close button an accessible label naming the tab", () => {
    render(
      <TabStripItem tab={tabA} status="idle" active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: `Close ${tabA.slug}` })).toBeInTheDocument();
  });

  it("applies distinct styling/state when active vs. inactive", () => {
    const { rerender } = render(
      <TabStripItem tab={tabA} status="idle" active={false} onActivate={vi.fn()} onClose={vi.fn()} />
    );
    const inactiveTab = screen.getByRole("tab");
    expect(inactiveTab).toHaveAttribute("aria-selected", "false");
    expect(inactiveTab).toHaveAttribute("data-state", "inactive");
    const inactiveClass = inactiveTab.className;

    rerender(<TabStripItem tab={tabA} status="idle" active={true} onActivate={vi.fn()} onClose={vi.fn()} />);
    const activeTab = screen.getByRole("tab");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab).toHaveAttribute("data-state", "active");
    expect(activeTab.className).not.toBe(inactiveClass);
  });
});

describe("TabStrip", () => {
  it("renders one TabStripItem per tab, in order", () => {
    render(
      <TabStrip
        tabs={[tabA, tabB]}
        activeTabId={tabA.id}
        statuses={{}}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
      />
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent(tabA.slug);
    expect(tabs[1]).toHaveTextContent(tabB.slug);
  });

  it("marks only the active tab as active", () => {
    render(
      <TabStrip
        tabs={[tabA, tabB]}
        activeTabId={tabB.id}
        statuses={{}}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
      />
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("a background (inactive) tab's status dot still reflects its real, distinct status", () => {
    render(
      <TabStrip
        tabs={[tabA, tabB]}
        activeTabId={tabA.id}
        statuses={{ [tabA.id]: "running", [tabB.id]: "error" }}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
      />
    );
    const tabs = screen.getAllByRole("tab");
    // tabA is active and running
    expect(tabs[0].querySelector('[data-status]')).toHaveAttribute("data-status", "running");
    // tabB is inactive (background) but its own status (error) still shows
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1].querySelector('[data-status]')).toHaveAttribute("data-status", "error");
  });

  it("defaults a tab with no entry in `statuses` to idle", () => {
    render(
      <TabStrip
        tabs={[tabA]}
        activeTabId={tabA.id}
        statuses={{}}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
      />
    );
    expect(screen.getByRole("img", { name: "Idle" })).toBeInTheDocument();
  });

  it("calls onActivate with the right tab id when a tab body is clicked", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <TabStrip
        tabs={[tabA, tabB]}
        activeTabId={tabA.id}
        statuses={{}}
        onActivate={onActivate}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
      />
    );
    await user.click(screen.getByText(tabB.slug));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(tabB.id);
  });

  it("calls onClose with the right tab id when that tab's close button is clicked, without also activating it", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <TabStrip
        tabs={[tabA, tabB]}
        activeTabId={tabA.id}
        statuses={{}}
        onActivate={onActivate}
        onClose={onClose}
        onNewTab={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: `Close ${tabB.slug}` }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(tabB.id);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("renders a + new-tab control that calls onNewTab", async () => {
    const user = userEvent.setup();
    const onNewTab = vi.fn();
    render(
      <TabStrip
        tabs={[tabA]}
        activeTabId={tabA.id}
        statuses={{}}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={onNewTab}
      />
    );
    await user.click(screen.getByRole("button", { name: /new tab/i }));
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it("renders nothing crash-worthy with zero tabs, and the + button still renders", () => {
    render(
      <TabStrip
        tabs={[]}
        activeTabId={null}
        statuses={{}}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
      />
    );
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /new tab/i })).toBeInTheDocument();
  });
});
