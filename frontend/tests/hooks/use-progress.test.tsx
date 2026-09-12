import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useProgress } from "@/hooks/use-progress";
import { STORAGE_KEY } from "@/lib/workspace/schema";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useProgress", () => {
  it("starts with an empty ProgressMap when nothing is stored", () => {
    const { result } = renderHook(() => useProgress());

    expect(result.current[0]).toEqual({});
  });

  it("initial ProgressMap reflects whatever is already in a pre-seeded localStorage blob", () => {
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

    const { result } = renderHook(() => useProgress());

    expect(result.current[0]).toEqual({
      "rag-basics": { viewedAt: 111, completedAt: 222 },
    });
  });

  it("markViewed updates the returned ProgressMap and persists it", () => {
    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current[1].markViewed("prompt-caching");
    });

    expect(result.current[0]["prompt-caching"]?.viewedAt).toEqual(expect.any(Number));
    expect(result.current[0]["prompt-caching"]?.completedAt).toBeNull();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      progress: Record<string, { viewedAt: number | null; completedAt: number | null }>;
    };
    expect(stored.progress["prompt-caching"]?.viewedAt).toEqual(expect.any(Number));
    expect(stored.progress["prompt-caching"]?.completedAt).toBeNull();
  });

  it("markCompleted updates the returned ProgressMap and persists it", () => {
    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current[1].markCompleted("prompt-caching");
    });

    expect(result.current[0]["prompt-caching"]?.completedAt).toEqual(expect.any(Number));

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      progress: Record<string, { viewedAt: number | null; completedAt: number | null }>;
    };
    expect(stored.progress["prompt-caching"]?.completedAt).toEqual(expect.any(Number));
  });

  it("markViewed twice on the same slug is idempotent (viewedAt set once, never overwritten)", () => {
    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current[1].markViewed("rag-basics");
    });
    const firstViewedAt = result.current[0]["rag-basics"]?.viewedAt;

    act(() => {
      result.current[1].markViewed("rag-basics");
    });

    expect(result.current[0]["rag-basics"]?.viewedAt).toBe(firstViewedAt);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      progress: Record<string, { viewedAt: number | null; completedAt: number | null }>;
    };
    expect(stored.progress["rag-basics"]?.viewedAt).toBe(firstViewedAt);
  });

  it("markViewed does not clobber an existing tabs/activeTabId slice already present in the stored blob", () => {
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

    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current[1].markViewed("rag-basics");
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      tabs: unknown[];
      activeTabId: string | null;
    };
    expect(stored.tabs).toEqual([
      { id: "tab-1", slug: "rag-basics" },
      { id: "tab-2", slug: "prompt-caching" },
    ]);
    expect(stored.activeTabId).toBe("tab-2");
  });

  it("markCompleted does not clobber an existing tabs/activeTabId slice already present in the stored blob", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tabs: [{ id: "tab-1", slug: "rag-basics" }],
        activeTabId: "tab-1",
        progress: {},
      })
    );

    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current[1].markCompleted("rag-basics");
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      tabs: unknown[];
      activeTabId: string | null;
    };
    expect(stored.tabs).toEqual([{ id: "tab-1", slug: "rag-basics" }]);
    expect(stored.activeTabId).toBe("tab-1");
  });

  it("never writes anything under a params/events/run-output-shaped key — only { progress } changes in the persisted blob", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tabs: [],
        activeTabId: null,
        progress: {},
      })
    );

    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current[1].markViewed("rag-basics");
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["activeTabId", "progress", "tabs", "version"]);
    expect(stored).not.toHaveProperty("params");
    expect(stored).not.toHaveProperty("events");
    expect(stored).not.toHaveProperty("output");
    expect(stored).not.toHaveProperty("runOutput");
  });
});
