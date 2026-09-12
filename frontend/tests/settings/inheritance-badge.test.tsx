import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { InheritanceBadge } from "@/components/settings/inheritance-badge";

describe("InheritanceBadge", () => {
  it('shows "Inherited from global" for source "global"', () => {
    render(<InheritanceBadge source="global" />);
    expect(screen.getByText("Inherited from global")).toBeInTheDocument();
  });

  it('shows "Overridden" for source "override"', () => {
    render(<InheritanceBadge source="override" />);
    expect(screen.getByText("Overridden")).toBeInTheDocument();
  });

  it('shows "Not set" for source "unset"', () => {
    render(<InheritanceBadge source="unset" />);
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it('styles "Not set" distinctly when required is true', () => {
    const { container: requiredContainer } = render(<InheritanceBadge source="unset" required />);
    const { container: optionalContainer } = render(<InheritanceBadge source="unset" required={false} />);

    const requiredBadge = requiredContainer.querySelector('[data-slot="badge"]');
    const optionalBadge = optionalContainer.querySelector('[data-slot="badge"]');

    expect(requiredBadge?.className).not.toEqual(optionalBadge?.className);
  });

  it("required has no effect on non-unset sources", () => {
    const { container: a } = render(<InheritanceBadge source="global" required />);
    const { container: b } = render(<InheritanceBadge source="global" required={false} />);

    expect(a.querySelector('[data-slot="badge"]')?.className).toEqual(
      b.querySelector('[data-slot="badge"]')?.className,
    );
  });
});
