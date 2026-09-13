import { forwardRef, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { NavModel } from "@/components/shell/sidebar-nav";

const mockPush = vi.fn();
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

// `<RecipeView>` does real data fetching (useRecipe/useSource) this test
// doesn't need -- a minimal stub exposing the same forwardRef handle shape,
// matching tab-panels.test.tsx's own established mocking convention for
// this exact component.
vi.mock("@/app/r/[slug]/recipe-view", () => ({
  RecipeView: forwardRef<{ cancelRun: () => void }, { slug: string; onStatusChange?: unknown }>(
    function MockRecipeView({ slug }, ref) {
      useImperativeHandle(ref, () => ({ cancelRun: vi.fn() }), []);
      return <div data-testid={`recipe-view-${slug}`}>Recipe: {slug}</div>;
    }
  ),
}));

const NAV: NavModel = {
  groups: [
    {
      id: "demo",
      title: "Demo",
      recipes: [{ slug: "echo", title: "Echo", difficulty: "basic" }],
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mockPathname = "/";
});

describe("WorkspaceShell", () => {
  it("renders children (the current route's own content) with zero tabs open", () => {
    render(
      <WorkspaceShell nav={NAV}>
        <div data-testid="page-content">Catalog index</div>
      </WorkspaceShell>
    );

    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("always renders children on /settings, regardless of tab state", async () => {
    mockPathname = "/settings";
    const user = userEvent.setup();
    render(
      <WorkspaceShell nav={NAV}>
        <div data-testid="settings-content">Settings</div>
      </WorkspaceShell>
    );

    // Open a tab via the sidebar-click-interception path -- even with a
    // tab open, /settings must keep showing its own content.
    await user.click(screen.getByRole("link", { name: /echo/i }));

    expect(screen.getByTestId("settings-content")).toBeInTheDocument();
  });

  it("clicking a recipe link inside the sidebar opens a tab instead of navigating", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell nav={NAV}>
        <div data-testid="page-content">Catalog index</div>
      </WorkspaceShell>
    );

    await user.click(screen.getByRole("link", { name: /echo/i }));

    expect(screen.getByTestId("recipe-view-echo")).toBeInTheDocument();
    expect(screen.queryByTestId("page-content")).not.toBeInTheDocument();
  });

  it("does NOT intercept a recipe link click outside the sidebar (e.g. a catalog-index card)", async () => {
    // A plain element carrying the same `href`-shaped marker a catalog-index
    // card would (not a real `<a>`, to avoid this test file itself tripping
    // Next's own `no-html-link-for-pages` lint rule for an anchor with no
    // real page behind it) -- the point under test is purely that the
    // click-interception handler ignores anything outside the sidebar's
    // `<aside>`, which doesn't require a literal anchor element to prove.
    const user = userEvent.setup();
    render(
      <WorkspaceShell nav={{ groups: [] }}>
        <div data-href="/r/echo" data-testid="index-card-link">
          Echo
        </div>
      </WorkspaceShell>
    );

    await user.click(screen.getByTestId("index-card-link"));

    expect(screen.queryByTestId(/recipe-view-/)).not.toBeInTheDocument();
  });

  it("closing the only open tab returns to showing children", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell nav={NAV}>
        <div data-testid="page-content">Catalog index</div>
      </WorkspaceShell>
    );

    await user.click(screen.getByRole("link", { name: /echo/i }));
    expect(screen.getByTestId("recipe-view-echo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close echo/i }));

    expect(screen.queryByTestId("recipe-view-echo")).not.toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("the '+' new-tab button navigates to the catalog index", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell nav={NAV}>
        <div data-testid="page-content">Catalog index</div>
      </WorkspaceShell>
    );

    await user.click(screen.getByRole("button", { name: "New tab" }));

    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
