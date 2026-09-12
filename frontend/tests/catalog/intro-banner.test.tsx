import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { INTRO_BANNER_STORAGE_KEY, IntroBanner } from "@/components/catalog/intro-banner";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("IntroBanner", () => {
  it("shows the banner by default in a fresh browser (no stored value)", () => {
    render(<IntroBanner />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByText(/skillet/i)).toBeInTheDocument();
  });

  it("hides the banner when the stored flag is already true (survives reload)", () => {
    window.localStorage.setItem(INTRO_BANNER_STORAGE_KEY, "true");
    render(<IntroBanner />);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("dismisses on click and persists the dismissal to localStorage", async () => {
    const user = userEvent.setup();
    render(<IntroBanner />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_BANNER_STORAGE_KEY)).toBe("true");
  });

  it("stays dismissed across a fresh render, simulating a reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<IntroBanner />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    unmount();

    render(<IntroBanner />);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("dismisses via the keyboard (Tab to focus, Enter to activate)", async () => {
    const user = userEvent.setup();
    render(<IntroBanner />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("dismisses via the keyboard (Space to activate)", async () => {
    const user = userEvent.setup();
    render(<IntroBanner />);

    await user.tab();
    await user.keyboard(" ");
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("renders a real <button type=\"button\"> for the dismiss control", () => {
    render(<IntroBanner />);
    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissButton.tagName).toBe("BUTTON");
    expect(dismissButton).toHaveAttribute("type", "button");
  });
});
