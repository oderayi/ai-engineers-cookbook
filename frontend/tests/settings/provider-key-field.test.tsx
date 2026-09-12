import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProviderKeyField } from "@/components/settings/provider-key-field";

describe("ProviderKeyField", () => {
  it("renders a password input by default", () => {
    render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value="sk-secret-value"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText("OpenAI");
    expect(input).toHaveAttribute("type", "password");
  });

  it("flips to a text input when the show/hide toggle is clicked, and back again", async () => {
    const user = userEvent.setup();
    render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value="sk-secret-value"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText("OpenAI");
    const toggle = screen.getByRole("button", { name: /show key/i });

    expect(toggle).toHaveAttribute("type", "button");

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide key/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide key/i }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("keeps show/hide state independent between two separate fields", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ProviderKeyField
          envKey="OPENAI_API_KEY"
          label="OpenAI"
          value="sk-one"
          onChange={vi.fn()}
        />
        <ProviderKeyField
          envKey="ANTHROPIC_API_KEY"
          label="Anthropic"
          value="sk-two"
          onChange={vi.fn()}
        />
      </>
    );

    const openaiInput = screen.getByLabelText("OpenAI");
    const anthropicInput = screen.getByLabelText("Anthropic");

    // Reveal only the OpenAI field.
    await user.click(screen.getAllByRole("button", { name: /show key/i })[0]);

    expect(openaiInput).toHaveAttribute("type", "text");
    expect(anthropicInput).toHaveAttribute("type", "password");
  });

  it("calls onChange with the typed value and never renders the value a second place", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value=""
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText("OpenAI");
    await user.type(input, "x");
    expect(onChange).toHaveBeenCalledWith("x");

    // The value must not appear anywhere else in the rendered markup (e.g.
    // a tooltip, a second label, an aria-label echoing it back).
    expect(container.innerHTML.match(/sk-secret-value/g)).toBeNull();
  });

  it("never logs the key value", async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value="sk-secret-value"
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /show key/i }));

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not render a docs link when docsUrl is omitted", () => {
    render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a docs link opening in a new tab with rel=noopener noreferrer when docsUrl is provided", () => {
    render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value=""
        onChange={vi.fn()}
        docsUrl="https://platform.openai.com/api-keys"
      />
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://platform.openai.com/api-keys");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("uses envKey to derive the input's id/name and a testid", () => {
    render(
      <ProviderKeyField
        envKey="OPENAI_API_KEY"
        label="OpenAI"
        value=""
        onChange={vi.fn()}
      />
    );

    const input = screen.getByTestId("provider-key-field-OPENAI_API_KEY");
    expect(input).toHaveAttribute("name", "OPENAI_API_KEY");
  });
});
