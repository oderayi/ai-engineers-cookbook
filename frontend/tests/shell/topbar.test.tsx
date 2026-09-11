import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Topbar } from "@/components/shell/topbar";

// `vitest.config.ts` runs with `globals: false`, so Testing Library's
// built-in auto-cleanup (which hooks a global `afterEach`) never registers.
// Do it explicitly so each test starts from an empty DOM.
afterEach(() => {
  cleanup();
});

describe("Topbar", () => {
  it("renders the children slot (workspace's tab strip) on the left", () => {
    render(
      <Topbar>
        <div>Tab strip</div>
      </Topbar>
    );

    expect(screen.getByText("Tab strip")).toBeInTheDocument();
  });

  it("renders fixed actions on the right when provided", () => {
    render(
      <Topbar actions={<button>Settings</button>}>
        <div>Tab strip</div>
      </Topbar>
    );

    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders with an empty actions region when none is provided", () => {
    render(
      <Topbar>
        <div>Tab strip</div>
      </Topbar>
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders as a full-width flex row with a fixed height and a bottom hairline border", () => {
    render(
      <Topbar>
        <div>Tab strip</div>
      </Topbar>
    );

    const bar = screen.getByRole("banner");
    expect(bar.className).toMatch(/\bflex\b/);
    expect(bar.className).toMatch(/w-full/);
    expect(bar.className).toMatch(/h-\d/);
    expect(bar.className).toMatch(/border-b/);
    expect(bar.className).toMatch(/border-border/);
  });

  it("merges a caller-provided className onto the root element", () => {
    render(
      <Topbar className="test-marker">
        <div>Tab strip</div>
      </Topbar>
    );

    expect(screen.getByRole("banner").className).toMatch(/test-marker/);
  });
});
