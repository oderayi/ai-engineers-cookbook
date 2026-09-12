export interface Tab {
  id: string;
  slug: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

export type TabsAction =
  | { type: "OPEN_TAB"; slug: string }
  | { type: "CLOSE_TAB"; id: string }
  | { type: "ACTIVATE_TAB"; id: string }
  | { type: "RESTORE"; state: TabsState }; // hydrate from localStorage once, post-mount

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "OPEN_TAB": {
      const tab: Tab = { id: crypto.randomUUID(), slug: action.slug };
      return { tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "CLOSE_TAB": {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const wasActive = state.activeTabId === action.id;
      // Fixed from the spec's own sample: `nextActive` must be a `string | null`
      // (a tab id) in both branches, not a mix of `Tab | null` and `string | null`.
      // The spec's sample assigned `tabs[idx] ?? tabs[idx - 1] ?? null` (a `Tab | null`)
      // when `wasActive`, but `state.activeTabId` (already a `string | null`) otherwise,
      // then reconciled the mismatch with `nextActive?.id ?? nextActive` — which only
      // "worked" for the string branch by accident (a string has no `.id`, so it fell
      // through to `?? nextActive`). Extracting `.id` explicitly here, in the branch
      // that actually produces a `Tab | null`, makes both branches genuinely
      // `string | null` and removes the need for that fragile fallback entirely.
      // Prefer the tab that slid into this slot; else the one before it; else none.
      const nextActive = wasActive ? (tabs[idx] ?? tabs[idx - 1] ?? null)?.id ?? null : state.activeTabId;
      return { tabs, activeTabId: nextActive };
    }
    case "ACTIVATE_TAB":
      return state.tabs.some((t) => t.id === action.id)
        ? { ...state, activeTabId: action.id }
        : state;
    case "RESTORE":
      return action.state;
  }
}
