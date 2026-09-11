import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleSection } from "@/components/primitives/collapsible-section";

afterEach(() => {
  cleanup();
});

describe("CollapsibleSection", () => {
  it("renders the title and is closed by default with correct ARIA", () => {
    render(
      <CollapsibleSection title="Ingredients">
        <p>Flour, sugar, eggs</p>
      </CollapsibleSection>
    );

    const trigger = screen.getByRole("button", { name: "Ingredients" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Flour, sugar, eggs")).not.toBeInTheDocument();
  });

  it("opens on click, exposing aria-expanded and aria-controls that match the panel", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Ingredients">
        <p>Flour, sugar, eggs</p>
      </CollapsibleSection>
    );

    const trigger = screen.getByRole("button", { name: "Ingredients" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const controlsId = trigger.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    const panel = screen.getByText("Flour, sugar, eggs").closest("[id]");
    expect(panel).toHaveAttribute("id", controlsId);
  });

  it("toggles closed again on a second click", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Ingredients">
        <p>Flour, sugar, eggs</p>
      </CollapsibleSection>
    );

    const trigger = screen.getByRole("button", { name: "Ingredients" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("is keyboard-operable via Enter and Space", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Ingredients">
        <p>Flour, sugar, eggs</p>
      </CollapsibleSection>
    );

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Ingredients" });
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("respects defaultOpen", () => {
    render(
      <CollapsibleSection title="Ingredients" defaultOpen>
        <p>Flour, sugar, eggs</p>
      </CollapsibleSection>
    );

    expect(screen.getByRole("button", { name: "Ingredients" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Flour, sugar, eggs")).toBeInTheDocument();
  });

  it("accepts a custom trigger slot instead of a plain title", () => {
    render(
      <CollapsibleSection trigger={<span>Custom trigger</span>}>
        <p>Content</p>
      </CollapsibleSection>
    );

    expect(
      screen.getByRole("button", { name: "Custom trigger" })
    ).toBeInTheDocument();
  });
});
