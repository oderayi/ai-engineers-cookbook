import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useTabs } from "@/hooks/use-tabs";
import { STORAGE_KEY } from "@/lib/workspace/schema";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useTabs", () => {
  it("starts with zero tabs and a null active tab (before/immediately after mount)", () => {
    const { result } = renderHook(() => useTabs());

    expect(result.current[0]).toEqual({ tabs: [], activeTabId: null });
  });

  it("openTab adds a tab and activates it", () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current[1].openTab("rag-basics");
    });

    expect(result.current[0].tabs).toHaveLength(1);
    expect(result.current[0].tabs[0].slug).toBe("rag-basics");
    expect(result.current[0].activeTabId).toBe(result.current[0].tabs[0].id);
  });

  it("closeTab removes the tab (delegating to the reducer)", () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current[1].openTab("rag-basics");
    });
    const id = result.current[0].tabs[0].id;

    act(() => {
      result.current[1].closeTab(id);
    });

    expect(result.current[0].tabs).toHaveLength(0);
    expect(result.current[0].activeTabId).toBeNull();
  });

  it("activateTab switches the active tab", () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current[1].openTab("rag-basics");
    });
    act(() => {
      result.current[1].openTab("prompt-caching");
    });
    const [firstId, secondId] = result.current[0].tabs.map((t) => t.id);
    expect(result.current[0].activeTabId).toBe(secondId);

    act(() => {
      result.current[1].activateTab(firstId);
    });

    expect(result.current[0].activeTabId).toBe(firstId);
  });

  it("restores a persisted { tabs, activeTabId } blob into state after mount (RESTORE dispatched)", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tabs: [
          { id: "tab-1", slug: "rag-basics" },
          { id: "tab-2", slug: "prompt-caching" },
        ],
        activeTabId: "tab-2",
        progress: {},
      })
    );

    const { result } = renderHook(() => useTabs());

    await waitFor(() => {
      expect(result.current[0].tabs).toHaveLength(2);
    });

    expect(result.current[0]).toEqual({
      tabs: [
        { id: "tab-1", slug: "rag-basics" },
        { id: "tab-2", slug: "prompt-caching" },
      ],
      activeTabId: "tab-2",
    });
  });

  it("openTab does not erase an existing non-empty progress object already present in the stored blob", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tabs: [],
        activeTabId: null,
        progress: {
          "rag-basics": { viewedAt: 111, completedAt: 222 },
        },
      })
    );

    const { result } = renderHook(() => useTabs());

    // Let the RESTORE hydration effect settle before mutating tabs.
    await waitFor(() => {
      expect(result.current[0]).toEqual({ tabs: [], activeTabId: null });
    });

    act(() => {
      result.current[1].openTab("prompt-caching");
    });

    await waitFor(() => {
      const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect((stored as { tabs: unknown[] }).tabs).toHaveLength(1);
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      progress: Record<string, { viewedAt: number | null; completedAt: number | null }>;
    };
    expect(stored.progress).toEqual({
      "rag-basics": { viewedAt: 111, completedAt: 222 },
    });
  });

  it("never writes anything under a params/events/run-output-shaped key — only { tabs, activeTabId } changes in the persisted blob", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tabs: [],
        activeTabId: null,
        progress: {},
      })
    );

    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current[1].openTab("rag-basics");
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["activeTabId", "progress", "tabs", "version"]);
    expect(stored).not.toHaveProperty("params");
    expect(stored).not.toHaveProperty("events");
    expect(stored).not.toHaveProperty("output");
    expect(stored).not.toHaveProperty("runOutput");
  });
});
