import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { navTreeFixture } from "../fixtures/nav-tree";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
});

function renderSidebar() {
  return render(
    <ThemeProvider>
      <Sidebar nav={navTreeFixture} />
    </ThemeProvider>
  );
}

describe("Sidebar", () => {
  it("renders the full nav by default", () => {
    renderSidebar();
    // The persistent desktop rail renders the full-detail SidebarNav —
    // a recipe title is visible somewhere in the document.
    expect(
      screen.getAllByText(navTreeFixture.groups[0].recipes[0].title).length
    ).toBeGreaterThan(0);
  });

  it("contains the theme toggle in the footer", () => {
    renderSidebar();
    expect(screen.getAllByRole("button", { name: "Toggle theme" }).length).toBeGreaterThan(0);
  });

  it("collapses to icon-only on toggle and persists the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSidebar();

    const collapseButton = screen.getByRole("button", { name: /collapse sidebar/i });
    await user.click(collapseButton);

    expect(window.localStorage.getItem("skillet.sidebar.collapsed")).toBe("true");
    expect(
      screen.queryByText(navTreeFixture.groups[0].recipes[0].title)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();

    unmount();

    // A fresh mount should come back collapsed, reading the persisted choice.
    renderSidebar();
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it("renders a mobile menu trigger that opens a drawer with the same nav", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const trigger = screen.getByRole("button", { name: /open menu/i });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(navTreeFixture.groups[0].recipes[0].title)
    ).toBeInTheDocument();
  });
});
