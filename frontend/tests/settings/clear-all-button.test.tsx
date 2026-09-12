import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ClearAllButton } from "@/components/settings/clear-all-button";

describe("ClearAllButton", () => {
  it("renders only the trigger initially, with no confirm/cancel affordances in the document", () => {
    render(<ClearAllButton onConfirm={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /clear all settings/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^clear all$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel/i })
    ).not.toBeInTheDocument();
  });

  it("opens the confirmation dialog when the trigger is clicked, warning the action is destructive", async () => {
    const user = userEvent.setup();
    render(<ClearAllButton onConfirm={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /clear all settings/i })
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^clear all$/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    // Wording is up to the implementation, but it must communicate that the
    // action is destructive/irreversible.
    expect(
      screen.getByText(/cannot be undone|irreversible|permanently/i)
    ).toBeInTheDocument();
  });

  it("calls onConfirm exactly once and closes the dialog when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ClearAllButton onConfirm={onConfirm} />);

    await user.click(
      screen.getByRole("button", { name: /clear all settings/i })
    );
    await user.click(screen.getByRole("button", { name: /^clear all$/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not call onConfirm and closes the dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ClearAllButton onConfirm={onConfirm} />);

    await user.click(
      screen.getByRole("button", { name: /clear all settings/i })
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the dialog without calling onConfirm when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ClearAllButton onConfirm={onConfirm} />);

    await user.click(
      screen.getByRole("button", { name: /clear all settings/i })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is keyboard-operable: the trigger is reachable via Tab and activatable via Enter", async () => {
    const user = userEvent.setup();
    render(<ClearAllButton onConfirm={vi.fn()} />);

    await user.tab();
    expect(
      screen.getByRole("button", { name: /clear all settings/i })
    ).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is keyboard-operable: the trigger is activatable via Space", async () => {
    const user = userEvent.setup();
    render(<ClearAllButton onConfirm={vi.fn()} />);

    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
