import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Shell } from "@/components/shell/shell";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { navTreeFixture } from "../fixtures/nav-tree";

afterEach(() => {
  cleanup();
});

function renderShell() {
  return render(
    <ThemeProvider>
      <Shell nav={navTreeFixture} tabs={<span>tab strip placeholder</span>}>
        <p>main content placeholder</p>
      </Shell>
    </ThemeProvider>
  );
}

describe("Shell", () => {
  it("renders the nav into the sidebar", () => {
    renderShell();
    expect(
      screen.getAllByText(navTreeFixture.groups[0].recipes[0].title).length
    ).toBeGreaterThan(0);
  });

  it("renders tabs into the topbar slot", () => {
    renderShell();
    expect(screen.getByText("tab strip placeholder")).toBeInTheDocument();
  });

  it("renders children into the main content area", () => {
    renderShell();
    expect(screen.getByText("main content placeholder")).toBeInTheDocument();
  });

  it("renders without tabs (optional slot)", () => {
    render(
      <ThemeProvider>
        <Shell nav={navTreeFixture}>
          <p>solo content</p>
        </Shell>
      </ThemeProvider>
    );
    expect(screen.getByText("solo content")).toBeInTheDocument();
  });
});
