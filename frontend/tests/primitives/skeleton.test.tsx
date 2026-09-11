import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Skeleton } from "@/components/primitives/skeleton";

afterEach(() => {
  cleanup();
});

describe("Skeleton", () => {
  it("renders a pulsing placeholder block", () => {
    const { container } = render(<Skeleton data-testid="skeleton" />);
    const el = container.firstElementChild as HTMLElement;

    expect(el).toBeInTheDocument();
    expect(el.className).toContain("animate-pulse");
  });

  it("applies numeric width/height as pixel dimensions", () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const el = container.firstElementChild as HTMLElement;

    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("20px");
  });

  it("applies string width/height verbatim", () => {
    const { container } = render(<Skeleton width="50%" height="1rem" />);
    const el = container.firstElementChild as HTMLElement;

    expect(el.style.width).toBe("50%");
    expect(el.style.height).toBe("1rem");
  });

  it("merges a caller-provided className with the base styling", () => {
    const { container } = render(<Skeleton className="my-marker" />);
    const el = container.firstElementChild as HTMLElement;

    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("my-marker");
  });
});
