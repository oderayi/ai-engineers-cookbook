import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SidebarNav } from "@/components/shell/sidebar-nav";
import { navTreeFixture } from "../fixtures/nav-tree";

// `globals: false` in vitest.config.ts means Testing Library's automatic
// afterEach(cleanup) (which relies on a global `afterEach`) never registers,
// so each render would otherwise linger in the DOM across tests in this
// file. Clean up explicitly rather than depending on a project-wide setup
// change outside this task's file set.
afterEach(() => {
  cleanup();
});

describe("SidebarNav", () => {
  it("renders every group and every recipe from the handed nav model", () => {
    render(<SidebarNav nav={navTreeFixture} />);

    for (const group of navTreeFixture.groups) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
      for (const recipe of group.recipes) {
        expect(
          screen.getByRole("link", { name: new RegExp(recipe.title) })
        ).toBeInTheDocument();
      }
    }
  });

  it("renders a group icon only when the group has one", () => {
    render(<SidebarNav nav={navTreeFixture} />);

    const groupWithIcon = navTreeFixture.groups.find((g) => g.icon);
    const groupWithoutIcon = navTreeFixture.groups.find((g) => !g.icon);
    expect(groupWithIcon).toBeDefined();
    expect(groupWithoutIcon).toBeDefined();

    expect(
      screen.getByTestId(`nav-group-icon-${groupWithIcon!.id}`)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`nav-group-icon-${groupWithoutIcon!.id}`)
    ).not.toBeInTheDocument();
  });

  it("renders a difficulty badge for every recipe", () => {
    render(<SidebarNav nav={navTreeFixture} />);

    for (const group of navTreeFixture.groups) {
      for (const recipe of group.recipes) {
        const badge = screen.getByTestId(`nav-difficulty-${recipe.slug}`);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(new RegExp(recipe.difficulty, "i"));
      }
    }
  });

  it("renders a progress indicator only when progress data is present", () => {
    render(<SidebarNav nav={navTreeFixture} />);

    const allRecipes = navTreeFixture.groups.flatMap((g) => g.recipes);
    const withProgress = allRecipes.filter((r) => r.progress);
    const withoutProgress = allRecipes.filter((r) => !r.progress);

    expect(withProgress.length).toBeGreaterThan(0);
    expect(withoutProgress.length).toBeGreaterThan(0);

    for (const recipe of withProgress) {
      expect(
        screen.getByTestId(`nav-progress-${recipe.slug}`)
      ).toBeInTheDocument();
    }
    for (const recipe of withoutProgress) {
      expect(
        screen.queryByTestId(`nav-progress-${recipe.slug}`)
      ).not.toBeInTheDocument();
    }
  });

  it("distinguishes a completed recipe's progress indicator from a merely-viewed one", () => {
    render(<SidebarNav nav={navTreeFixture} />);

    const allRecipes = navTreeFixture.groups.flatMap((g) => g.recipes);
    const completed = allRecipes.find((r) => r.progress?.completed);
    const viewedOnly = allRecipes.find(
      (r) => r.progress?.viewed && !r.progress?.completed
    );
    expect(completed).toBeDefined();
    expect(viewedOnly).toBeDefined();

    expect(screen.getByTestId(`nav-progress-${completed!.slug}`)).toHaveAttribute(
      "aria-label",
      "Completed"
    );
    expect(
      screen.getByTestId(`nav-progress-${viewedOnly!.slug}`)
    ).toHaveAttribute("aria-label", "Viewed");
  });

  it("renders every recipe as a real focusable link to its recipe page", () => {
    render(<SidebarNav nav={navTreeFixture} />);

    const allRecipes = navTreeFixture.groups.flatMap((g) => g.recipes);
    for (const recipe of allRecipes) {
      const link = screen.getByRole("link", {
        name: new RegExp(recipe.title),
      });
      expect(link).toHaveAttribute("href", `/r/${recipe.slug}`);
      link.focus();
      expect(link).toHaveFocus();
    }
  });
});
