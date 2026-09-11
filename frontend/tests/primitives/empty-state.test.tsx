import { cleanup, render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyState } from "@/components/primitives/empty-state";

afterEach(() => {
  cleanup();
});

describe("EmptyState", () => {
  it("renders the icon and message", () => {
    render(<EmptyState icon={Inbox} message="No recipes yet" />);

    expect(screen.getByText("No recipes yet")).toBeInTheDocument();
    // Decorative icon must not be exposed to the accessibility tree.
    expect(document.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("renders no action when none is given", () => {
    render(<EmptyState icon={Inbox} message="No recipes yet" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an action slot when provided", () => {
    render(
      <EmptyState
        icon={Inbox}
        message="No recipes yet"
        action={<button type="button">Browse catalog</button>}
      />
    );

    expect(
      screen.getByRole("button", { name: "Browse catalog" })
    ).toBeInTheDocument();
  });

  it("merges a custom className onto the root", () => {
    const { container } = render(
      <EmptyState icon={Inbox} message="No recipes yet" className="my-marker" />
    );

    expect(container.querySelector(".my-marker")).toBeInTheDocument();
  });
});
