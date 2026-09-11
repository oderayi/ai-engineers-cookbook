import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileDrawer } from "@/components/shell/mobile-drawer";

// `vitest.config.ts` runs with `globals: false`, so Testing Library's
// built-in auto-cleanup (which hooks a global `afterEach`) never registers.
// Do it explicitly so each test starts from an empty DOM.
afterEach(() => {
  cleanup();
});

describe("MobileDrawer", () => {
  it("renders a hamburger trigger and keeps the drawer content out of the DOM until opened", () => {
    render(
      <MobileDrawer>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
    expect(screen.queryByText("Sidebar content")).not.toBeInTheDocument();
  });

  it("opens the drawer and reveals its content when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MobileDrawer>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    expect(await screen.findByText("Sidebar content")).toBeInTheDocument();
  });

  it("closes on Escape (via the underlying Base UI Dialog, not re-implemented here)", async () => {
    const user = userEvent.setup();
    render(
      <MobileDrawer>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await screen.findByText("Sidebar content");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("Sidebar content")).not.toBeInTheDocument();
    });
  });

  it("closes on an outside click (via the underlying Base UI Dialog, not re-implemented here)", async () => {
    const user = userEvent.setup();
    render(
      <MobileDrawer>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await screen.findByText("Sidebar content");

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByText("Sidebar content")).not.toBeInTheDocument();
    });
  });

  it("supports a fully custom trigger element in place of the default hamburger button", async () => {
    const user = userEvent.setup();
    render(
      <MobileDrawer trigger={<button type="button">Custom trigger</button>}>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    expect(screen.queryByRole("button", { name: /open menu/i })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Custom trigger" });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);
    expect(await screen.findByText("Sidebar content")).toBeInTheDocument();
  });

  it("supports being driven externally via open/onOpenChange (controlled mode)", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MobileDrawer open={false} onOpenChange={onOpenChange}>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    expect(screen.queryByText("Sidebar content")).not.toBeInTheDocument();

    rerender(
      <MobileDrawer open={true} onOpenChange={onOpenChange}>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    expect(await screen.findByText("Sidebar content")).toBeInTheDocument();
  });

  it("keeps the default trigger keyboard-operable with a visible focus ring", () => {
    render(
      <MobileDrawer>
        <p>Sidebar content</p>
      </MobileDrawer>
    );

    const trigger = screen.getByRole("button", { name: /open menu/i });
    expect(trigger.className).toMatch(/focus-visible:ring/);
  });
});
