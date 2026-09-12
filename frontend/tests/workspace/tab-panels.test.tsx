import { createRef, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmptyWorkspace } from "@/components/workspace/empty-workspace";
import { TabPanels, type TabPanelsHandle } from "@/components/workspace/tab-panels";
import type { RunStatus } from "@/hooks/use-recipe-run";
import type { Tab } from "@/lib/workspace/tabs-reducer";

// --- Mocking `<RecipeView>` -------------------------------------------
//
// A real `<RecipeView>` fetches recipe/source data via `useRecipe`/
// `useSource` (react-query) and mounts a real `<RunOutput>` with its own
// `useRecipeRun` — none of which this test needs or wants to hit. No
// existing test in this codebase mocks a `forwardRef` + `useImperativeHandle`
// component with `vi.mock` yet (checked `tests/catalog/recipe-view.test.tsx`
// and sibling files for a precedent — none render `<RecipeView>` itself as
// a mock, they mock its *data hooks* instead), so this is a fresh pattern
// for this codebase: a minimal stub that is itself a `forwardRef` exposing
// a controllable `RecipeViewHandle` (`cancelRun` as a spy) and a way for a
// test to manually invoke the `onStatusChange` prop it was last given.
//
// `instances`/`mountCounts` are declared via `vi.hoisted` (not a bare
// module-level `const`) because `vi.mock`'s factory is hoisted above this
// file's own top-level statements — referencing an ordinary `const` here
// from inside the factory would hit a temporal-dead-zone error the first
// time the mocked module is resolved. `react`'s own named exports
// (`forwardRef`, `useRef`, etc.) don't have this problem: `react` is an
// independent package whose module body finishes evaluating before any
// consumer (this factory included) can call into it, regardless of hoisting.
const { instances, mountCounts } = vi.hoisted(() => ({
  instances: new Map<string, { cancelRun: ReturnType<typeof vi.fn>; emitStatus: (status: RunStatus) => void }>(),
  mountCounts: new Map<string, number>(),
}));

vi.mock("@/app/r/[slug]/recipe-view", () => {
  interface MockProps {
    slug: string;
    onStatusChange?: (status: RunStatus) => void;
  }
  interface MockHandle {
    cancelRun: () => void;
  }

  const MockRecipeView = forwardRef<MockHandle, MockProps>(function MockRecipeView(
    { slug, onStatusChange },
    ref
  ) {
    // Always reflects the latest `onStatusChange` this render received, so
    // a test's `emitStatus` call (made after render) invokes the current
    // callback, not a stale one captured at first mount.
    const onStatusChangeRef = useRef(onStatusChange);
    onStatusChangeRef.current = onStatusChange;

    // Stable for the lifetime of this component instance (a `forwardRef`
    // render can't call `useState`'s lazy-init trick for a mutable object
    // that also needs to be a `vi.fn()`, so `useRef(vi.fn()).current` is the
    // idiomatic "create once" here).
    const cancelRun = useRef(vi.fn()).current;

    useImperativeHandle(ref, () => ({ cancelRun }), [cancelRun]);

    // `[]`-style mount/unmount bookkeeping (keyed by `slug`, the one prop
    // that's stable for this component's whole lifetime in every test
    // below): increments a real "how many times did a NEW instance of this
    // slug mount" counter, distinct from ordinary re-renders of the SAME
    // instance (which do not re-run an effect with an unchanging dep array).
    useEffect(() => {
      mountCounts.set(slug, (mountCounts.get(slug) ?? 0) + 1);
      instances.set(slug, {
        cancelRun,
        emitStatus: (status: RunStatus) => onStatusChangeRef.current?.(status),
      });
      return () => {
        instances.delete(slug);
      };
    }, [slug, cancelRun]);

    return <div data-testid={`mock-recipe-view-${slug}`}>RecipeView:{slug}</div>;
  });

  return { RecipeView: MockRecipeView };
});

function tab(id: string, slug: string): Tab {
  return { id, slug };
}

beforeEach(() => {
  instances.clear();
  mountCounts.clear();
  vi.clearAllMocks();
});

describe("TabPanels", () => {
  it("mounts every open tab's <RecipeView> simultaneously, not just the active one", () => {
    const a = tab("a", "slug-a");
    const b = tab("b", "slug-b");
    render(<TabPanels tabs={[a, b]} activeTabId="a" onClose={vi.fn()} />);

    expect(screen.getByTestId("mock-recipe-view-slug-a")).toBeInTheDocument();
    expect(screen.getByTestId("mock-recipe-view-slug-b")).toBeInTheDocument();
    expect(mountCounts.get("slug-a")).toBe(1);
    expect(mountCounts.get("slug-b")).toBe(1);
  });

  it("hides the inactive tab via the `hidden` attribute without removing it from the DOM", () => {
    const a = tab("a", "slug-a");
    const b = tab("b", "slug-b");
    render(<TabPanels tabs={[a, b]} activeTabId="a" onClose={vi.fn()} />);

    const activeWrapper = screen.getByTestId("mock-recipe-view-slug-a").parentElement!;
    const inactiveWrapper = screen.getByTestId("mock-recipe-view-slug-b").parentElement!;

    // Present, not absent -- `toBeInTheDocument` alone would also pass for
    // a conditionally-unmounted node's leftover reference, so the `hidden`
    // attribute check is load-bearing here, not decorative.
    expect(screen.getByTestId("mock-recipe-view-slug-b")).toBeInTheDocument();
    expect(inactiveWrapper).toHaveAttribute("hidden");
    expect(activeWrapper).not.toHaveAttribute("hidden");
  });

  it("does NOT remount an inactive tab's <RecipeView> when the active tab switches", () => {
    const a = tab("a", "slug-a");
    const b = tab("b", "slug-b");
    const { rerender } = render(<TabPanels tabs={[a, b]} activeTabId="a" onClose={vi.fn()} />);

    expect(mountCounts.get("slug-a")).toBe(1);
    expect(mountCounts.get("slug-b")).toBe(1);

    rerender(<TabPanels tabs={[a, b]} activeTabId="b" onClose={vi.fn()} />);

    // Same instances survive the switch -- mount counts are unchanged, even
    // though visibility (and which one is hidden) flipped.
    expect(mountCounts.get("slug-a")).toBe(1);
    expect(mountCounts.get("slug-b")).toBe(1);
    expect(screen.getByTestId("mock-recipe-view-slug-a").parentElement).toHaveAttribute("hidden");
    expect(screen.getByTestId("mock-recipe-view-slug-b").parentElement).not.toHaveAttribute("hidden");
  });

  it("keeps a background tab's <RecipeView> reporting status while it is hidden", () => {
    const a = tab("a", "slug-a");
    const b = tab("b", "slug-b");
    const onStatusChange = vi.fn();
    render(<TabPanels tabs={[a, b]} activeTabId="b" onClose={vi.fn()} onStatusChange={onStatusChange} />);

    // `a` is the hidden/background tab here (active is `b`).
    instances.get("slug-a")!.emitStatus("running");

    expect(onStatusChange).toHaveBeenCalledWith("a", "running");
  });

  it("calls onStatusChange with the correct (tabId, status) pair per tab", () => {
    const a = tab("a", "slug-a");
    const b = tab("b", "slug-b");
    const onStatusChange = vi.fn();
    render(<TabPanels tabs={[a, b]} activeTabId="a" onClose={vi.fn()} onStatusChange={onStatusChange} />);

    instances.get("slug-a")!.emitStatus("running");
    instances.get("slug-b")!.emitStatus("error");

    expect(onStatusChange).toHaveBeenCalledWith("a", "running");
    expect(onStatusChange).toHaveBeenCalledWith("b", "error");
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it("exposes closeTab via ref: closing a RUNNING tab cancels its run exactly once, before onClose fires", () => {
    const a = tab("a", "slug-a");
    const onClose = vi.fn();
    const ref = createRef<TabPanelsHandle>();
    render(<TabPanels ref={ref} tabs={[a]} activeTabId="a" onClose={onClose} />);

    instances.get("slug-a")!.emitStatus("running");
    const cancelRun = instances.get("slug-a")!.cancelRun;

    ref.current!.closeTab("a");

    expect(cancelRun).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalledTimes(1);
    // Well-defined order: cancellation happens before the tab is reported closed.
    expect(cancelRun.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it("closing an IDLE tab (no status ever reported) does not call cancelRun", () => {
    const a = tab("a", "slug-a");
    const onClose = vi.fn();
    const ref = createRef<TabPanelsHandle>();
    render(<TabPanels ref={ref} tabs={[a]} activeTabId="a" onClose={onClose} />);

    const cancelRun = instances.get("slug-a")!.cancelRun;

    ref.current!.closeTab("a");

    expect(cancelRun).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith("a");
  });

  it("closing a DONE tab does not call cancelRun", () => {
    const a = tab("a", "slug-a");
    const onClose = vi.fn();
    const ref = createRef<TabPanelsHandle>();
    render(<TabPanels ref={ref} tabs={[a]} activeTabId="a" onClose={onClose} />);

    instances.get("slug-a")!.emitStatus("running");
    instances.get("slug-a")!.emitStatus("done");
    const cancelRun = instances.get("slug-a")!.cancelRun;

    ref.current!.closeTab("a");

    expect(cancelRun).not.toHaveBeenCalled();
  });

  it("closing an ERROR tab does not call cancelRun", () => {
    const a = tab("a", "slug-a");
    const onClose = vi.fn();
    const ref = createRef<TabPanelsHandle>();
    render(<TabPanels ref={ref} tabs={[a]} activeTabId="a" onClose={onClose} />);

    instances.get("slug-a")!.emitStatus("running");
    instances.get("slug-a")!.emitStatus("error");
    const cancelRun = instances.get("slug-a")!.cancelRun;

    ref.current!.closeTab("a");

    expect(cancelRun).not.toHaveBeenCalled();
  });
});

describe("EmptyWorkspace", () => {
  it("renders a working link into the catalog index", () => {
    render(<EmptyWorkspace />);

    const link = screen.getByRole("link", { name: /browse the catalog/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("shows friendly copy explaining the empty state", () => {
    render(<EmptyWorkspace />);
    expect(screen.getByText(/no recipes open yet/i)).toBeInTheDocument();
  });
});
