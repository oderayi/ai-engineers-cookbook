import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingsScreen } from "@/components/settings/settings-screen";
import { PROVIDER_METADATA } from "@/lib/settings/providers";
import { STORAGE_KEY } from "@/lib/settings/storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("SettingsScreen", () => {
  it("renders correctly with an empty settings store (first-visit state, not an error/blocking state)", () => {
    render(<SettingsScreen />);

    // A real heading, not just a flat list of inputs.
    expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument();

    // The safety note is present.
    expect(screen.getByText("Your keys stay on this device")).toBeInTheDocument();

    // Every provider key field renders empty, not missing/erroring.
    for (const envKey of Object.keys(PROVIDER_METADATA)) {
      const input = screen.getByTestId(`provider-key-field-${envKey}`) as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Backend URL field renders empty.
    expect(screen.getByLabelText("Custom backend URL")).toHaveValue("");

    // Clear-all control is present.
    expect(screen.getByRole("button", { name: "Clear all settings" })).toBeInTheDocument();
  });

  it("renders one ProviderKeyField per entry in PROVIDER_METADATA, wired to its label/docsUrl", () => {
    render(<SettingsScreen />);

    const rendered = document.querySelectorAll('[data-testid^="provider-key-field-"]');
    expect(rendered).toHaveLength(Object.keys(PROVIDER_METADATA).length);

    for (const [envKey, metadata] of Object.entries(PROVIDER_METADATA)) {
      expect(screen.getByTestId(`provider-key-field-${envKey}`)).toBeInTheDocument();
      expect(screen.getByLabelText(metadata.label)).toBeInTheDocument();
      if (metadata.docsUrl) {
        expect(screen.getByRole("link", { name: "Get an API key" })).toHaveAttribute(
          "href",
          metadata.docsUrl
        );
      }
    }
  });

  it("calls useSettings once and reflects an already-populated store", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        global: { OPENAI_API_KEY: "sk-existing" },
        customBackendUrl: "https://api.example.com",
        overrides: {},
      })
    );

    render(<SettingsScreen />);

    expect(screen.getByLabelText("OpenAI")).toHaveValue("sk-existing");
    expect(screen.getByLabelText("Custom backend URL")).toHaveValue("https://api.example.com");
  });

  it("typing into a provider key field persists through useSettings -> useLocalStorage -> localStorage, surviving unmount/remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsScreen />);

    await user.type(screen.getByLabelText("OpenAI"), "sk-round-trip");
    expect(screen.getByLabelText("OpenAI")).toHaveValue("sk-round-trip");

    unmount();

    render(<SettingsScreen />);
    expect(screen.getByLabelText("OpenAI")).toHaveValue("sk-round-trip");

    // And it really did land in localStorage, not just component state.
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.global.OPENAI_API_KEY).toBe("sk-round-trip");
  });

  it("editing the backend URL field persists through unmount/remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsScreen />);

    await user.type(screen.getByLabelText("Custom backend URL"), "https://api.example.com");
    unmount();

    render(<SettingsScreen />);
    expect(screen.getByLabelText("Custom backend URL")).toHaveValue("https://api.example.com");
  });

  it("wires ClearAllButton's onConfirm to actions.clearAll, wiping the store", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        global: { OPENAI_API_KEY: "sk-existing" },
        customBackendUrl: "https://api.example.com",
        overrides: { "rag-basics": { OPENAI_API_KEY: "sk-override" } },
      })
    );

    render(<SettingsScreen />);
    expect(screen.getByLabelText("OpenAI")).toHaveValue("sk-existing");

    await user.click(screen.getByRole("button", { name: "Clear all settings" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByLabelText("OpenAI")).toHaveValue("");
    expect(screen.getByLabelText("Custom backend URL")).toHaveValue("");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
