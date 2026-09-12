import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FileDownload } from "@/components/execution/artifact/file-download";

// Real fixture from tests/execution/fixtures/artifacts.jsonl (artifact "a4", kind: "file").
const fileArtifact = {
  name: "full-report.pdf",
  url: "/artifacts/runs/run-42/full-report.pdf",
};

describe("FileDownload", () => {
  it("renders a link with the artifact's url as href", () => {
    render(<FileDownload {...fileArtifact} />);
    const link = screen.getByRole("link", { name: /full-report\.pdf/ });
    expect(link).toHaveAttribute("href", fileArtifact.url);
  });

  it("renders the artifact's name as the visible label", () => {
    render(<FileDownload {...fileArtifact} />);
    expect(screen.getByText(fileArtifact.name)).toBeInTheDocument();
  });

  it("renders as a real styled link element, not a bare anchor", () => {
    render(<FileDownload {...fileArtifact} />);
    const link = screen.getByRole("link", { name: /full-report\.pdf/ });
    expect(link.tagName).toBe("A");
    expect(link.className.length).toBeGreaterThan(0);
  });
});
