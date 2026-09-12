import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArtifactMarkdown } from "@/components/execution/artifact/markdown";

// Real fixture from tests/execution/fixtures/artifacts.jsonl (artifact "a3", kind: "markdown").
const salesReportMarkdown =
  "# Sales Report\n\nRevenue **grew 20%** quarter over quarter, driven mainly by the *Northeast* region.";

describe("ArtifactMarkdown", () => {
  it("renders the heading text", () => {
    render(<ArtifactMarkdown data={salesReportMarkdown} />);
    expect(screen.getByRole("heading", { name: "Sales Report" })).toBeInTheDocument();
  });

  it("renders bold text as a real <strong> element, proving markdown parsing ran", () => {
    const { container } = render(<ArtifactMarkdown data={salesReportMarkdown} />);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent("grew 20%");
  });

  it("renders italic text as a real <em> element", () => {
    const { container } = render(<ArtifactMarkdown data={salesReportMarkdown} />);
    const em = container.querySelector("em");
    expect(em).not.toBeNull();
    expect(em).toHaveTextContent("Northeast");
  });

  it("renders a graceful fallback when data is not a string", () => {
    render(<ArtifactMarkdown data={{ not: "a string" }} />);
    expect(screen.getByText(/unable to render this content/i)).toBeInTheDocument();
  });

  it("renders a graceful fallback for null data", () => {
    render(<ArtifactMarkdown data={null} />);
    expect(screen.getByText(/unable to render this content/i)).toBeInTheDocument();
  });

  it("never executes raw HTML embedded in the markdown source", () => {
    const { container } = render(
      <ArtifactMarkdown data={'<img src=x onerror="window.__pwned = true" /> hello'} />
    );
    expect(container.querySelector('img[src="x"]')).not.toBeInTheDocument();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });

  it("truncates a very long payload and shows a visible truncation note", () => {
    const longMarkdown = "a".repeat(25_000);
    const { container } = render(<ArtifactMarkdown data={longMarkdown} />);
    expect(screen.getByText(/truncated to the first/i)).toBeInTheDocument();
    // Rendered text content should be capped at MAX_CHARS (20,000), not the full 25,000.
    expect(container.textContent?.includes("a".repeat(20_001))).toBe(false);
  });

  it("does not show a truncation note for a short payload", () => {
    render(<ArtifactMarkdown data={salesReportMarkdown} />);
    expect(screen.queryByText(/truncated/i)).not.toBeInTheDocument();
  });
});
