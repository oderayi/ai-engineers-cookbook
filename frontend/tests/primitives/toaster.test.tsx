import { cleanup, render, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Toaster } from "@/components/primitives/toaster";

// jsdom does not implement matchMedia; sonner's Toaster reads it to resolve
// the "system" theme. Stub it locally rather than touching the shared
// vitest.setup.ts (out of scope for this task).
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
});

describe("Toaster", () => {
  it("mounts a notifications region host", () => {
    const { container } = render(<Toaster />);

    const region = container.querySelector("section[aria-label]");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Notifications")
    );
  });

  it("forwards props through to the underlying sonner Toaster", async () => {
    const { container } = render(<Toaster position="top-center" />);

    toast("Recipe saved");

    await waitFor(() => {
      expect(container.querySelector("[data-sonner-toaster]")).not.toBeNull();
    });

    const list = container.querySelector("[data-sonner-toaster]");
    expect(list).toHaveAttribute("data-x-position", "center");
    expect(list).toHaveAttribute("data-y-position", "top");
  });
});
