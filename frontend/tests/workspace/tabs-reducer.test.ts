import { describe, expect, it } from "vitest";

import { tabsReducer } from "@/lib/workspace/tabs-reducer";
import type { TabsState } from "@/lib/workspace/tabs-reducer";

function state(overrides: Partial<TabsState> = {}): TabsState {
  return { tabs: [], activeTabId: null, ...overrides };
}

describe("tabsReducer", () => {
  describe("OPEN_TAB", () => {
    it("appends a new tab with a fresh id and activates it", () => {
      const initial = state();
      const result = tabsReducer(initial, { type: "OPEN_TAB", slug: "rag-basics" });

      expect(result.tabs).toHaveLength(1);
      expect(result.tabs[0].slug).toBe("rag-basics");
      expect(typeof result.tabs[0].id).toBe("string");
      expect(result.tabs[0].id.length).toBeGreaterThan(0);
      expect(result.activeTabId).toBe(result.tabs[0].id);
    });

    it("appends to existing tabs without disturbing them", () => {
      const existing = { id: "existing-1", slug: "prompt-caching" };
      const initial = state({ tabs: [existing], activeTabId: existing.id });
      const result = tabsReducer(initial, { type: "OPEN_TAB", slug: "rag-basics" });

      expect(result.tabs).toHaveLength(2);
      expect(result.tabs[0]).toEqual(existing);
      expect(result.tabs[1].slug).toBe("rag-basics");
      expect(result.activeTabId).toBe(result.tabs[1].id);
    });

    it("opening the same slug twice produces two distinct tabs with different ids", () => {
      let s = tabsReducer(state(), { type: "OPEN_TAB", slug: "rag-basics" });
      s = tabsReducer(s, { type: "OPEN_TAB", slug: "rag-basics" });

      expect(s.tabs).toHaveLength(2);
      expect(s.tabs[0].slug).toBe("rag-basics");
      expect(s.tabs[1].slug).toBe("rag-basics");
      expect(s.tabs[0].id).not.toBe(s.tabs[1].id);
      // Both generated ids are present in the resulting tabs array.
      const ids = s.tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(2);
      // The most recently opened duplicate becomes active.
      expect(s.activeTabId).toBe(s.tabs[1].id);
    });
  });

  describe("CLOSE_TAB", () => {
    it("closing the active tab activates its right neighbor", () => {
      const a = { id: "a", slug: "slug-a" };
      const b = { id: "b", slug: "slug-b" };
      const c = { id: "c", slug: "slug-c" };
      const initial = state({ tabs: [a, b, c], activeTabId: "b" });

      const result = tabsReducer(initial, { type: "CLOSE_TAB", id: "b" });

      expect(result.tabs).toEqual([a, c]);
      expect(result.activeTabId).toBe("c");
    });

    it("closing the active tab when it's the last tab activates its left neighbor", () => {
      const a = { id: "a", slug: "slug-a" };
      const b = { id: "b", slug: "slug-b" };
      const c = { id: "c", slug: "slug-c" };
      const initial = state({ tabs: [a, b, c], activeTabId: "c" });

      const result = tabsReducer(initial, { type: "CLOSE_TAB", id: "c" });

      expect(result.tabs).toEqual([a, b]);
      expect(result.activeTabId).toBe("b");
    });

    it("closing the active tab when it's the only tab results in activeTabId: null", () => {
      const a = { id: "a", slug: "slug-a" };
      const initial = state({ tabs: [a], activeTabId: "a" });

      const result = tabsReducer(initial, { type: "CLOSE_TAB", id: "a" });

      expect(result.tabs).toEqual([]);
      expect(result.activeTabId).toBeNull();
    });

    it("closing an inactive tab leaves activeTabId completely unchanged", () => {
      const a = { id: "a", slug: "slug-a" };
      const b = { id: "b", slug: "slug-b" };
      const c = { id: "c", slug: "slug-c" };
      const initial = state({ tabs: [a, b, c], activeTabId: "a" });

      const result = tabsReducer(initial, { type: "CLOSE_TAB", id: "c" });

      expect(result.tabs).toEqual([a, b]);
      expect(result.activeTabId).toBe("a");
    });

    it("closing an unknown id is a no-op (value-equal, and in this implementation referentially equal)", () => {
      const a = { id: "a", slug: "slug-a" };
      const initial = state({ tabs: [a], activeTabId: "a" });

      const result = tabsReducer(initial, { type: "CLOSE_TAB", id: "does-not-exist" });

      // Documented: this reducer returns the exact same state reference on a
      // no-op CLOSE_TAB (early `return state`), not merely a value-equal copy.
      expect(result).toBe(initial);
      expect(result).toEqual(initial);
    });
  });

  describe("ACTIVATE_TAB", () => {
    it("is a no-op for an unknown id", () => {
      const a = { id: "a", slug: "slug-a" };
      const initial = state({ tabs: [a], activeTabId: "a" });

      const result = tabsReducer(initial, { type: "ACTIVATE_TAB", id: "does-not-exist" });

      expect(result).toBe(initial);
      expect(result.activeTabId).toBe("a");
    });

    it("updates activeTabId for a real id", () => {
      const a = { id: "a", slug: "slug-a" };
      const b = { id: "b", slug: "slug-b" };
      const initial = state({ tabs: [a, b], activeTabId: "a" });

      const result = tabsReducer(initial, { type: "ACTIVATE_TAB", id: "b" });

      expect(result.activeTabId).toBe("b");
      expect(result.tabs).toEqual([a, b]);
    });
  });

  describe("RESTORE", () => {
    it("replaces state wholesale, discarding any tabs not in the restored state", () => {
      const old = state({
        tabs: [{ id: "old-1", slug: "old-slug" }],
        activeTabId: "old-1",
      });
      const restored: TabsState = {
        tabs: [{ id: "new-1", slug: "new-slug" }],
        activeTabId: "new-1",
      };

      const result = tabsReducer(old, { type: "RESTORE", state: restored });

      expect(result).toEqual(restored);
      expect(result.tabs.some((t) => t.id === "old-1")).toBe(false);
    });

    it("restoring an empty state clears all tabs and activeTabId", () => {
      const old = state({
        tabs: [{ id: "old-1", slug: "old-slug" }],
        activeTabId: "old-1",
      });
      const restored: TabsState = { tabs: [], activeTabId: null };

      const result = tabsReducer(old, { type: "RESTORE", state: restored });

      expect(result).toEqual(restored);
    });
  });
});
