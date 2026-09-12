import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DescriptionPanel } from "@/components/catalog/description-panel";
import { promptBasics, tokensAndContext } from "@/tests/fixtures/catalog/recipes";

describe("DescriptionPanel", () => {
  it("renders the summary as prose", () => {
    render(<DescriptionPanel recipe={promptBasics} />);
    expect(screen.getByText(promptBasics.summary)).toBeInTheDocument();
  });

  it("renders useCases as a list", () => {
    // Uses tokensAndContext (readmeMarkdown: null) so there's exactly one
    // <ul> on the page -- promptBasics' own readme also contains a task
    // list, which would make a plain role="list" query ambiguous.
    render(<DescriptionPanel recipe={tokensAndContext} />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(tokensAndContext.useCases.length);
    for (const useCase of tokensAndContext.useCases) {
      expect(screen.getByText(useCase)).toBeInTheDocument();
    }
  });

  it("hides the README sub-section entirely when readmeMarkdown is null", () => {
    render(<DescriptionPanel recipe={tokensAndContext} />);
    expect(screen.queryByText(/readme/i)).not.toBeInTheDocument();
    // No stray empty container: only the summary + use-cases heading exist.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a README heading when readmeMarkdown is present", () => {
    render(<DescriptionPanel recipe={promptBasics} />);
    expect(screen.getByText(/readme/i)).toBeInTheDocument();
  });

  it("renders a GFM table from readmeMarkdown as a real <table>", () => {
    render(<DescriptionPanel recipe={promptBasics} />);
    const table = screen.getByRole("table");
    expect(table.tagName).toBe("TABLE");
    expect(screen.getByRole("columnheader", { name: "Role" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Purpose" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "system" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "sets behavior" })).toBeInTheDocument();
  });

  it("renders a GFM task list from readmeMarkdown as real checkbox inputs", () => {
    render(<DescriptionPanel recipe={promptBasics} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("renders GFM strikethrough from readmeMarkdown as a <del>", () => {
    const { container } = render(<DescriptionPanel recipe={promptBasics} />);
    const del = container.querySelector("del");
    expect(del).not.toBeNull();
    expect(del).toHaveTextContent("It's not magic.");
  });

  it("never executes raw HTML embedded in readmeMarkdown (rendered as escaped text)", () => {
    const recipeWithRawHtml = {
      ...promptBasics,
      readmeMarkdown: '<img src=x onerror="window.__pwned = true" /> hello',
    };
    const { container } = render(<DescriptionPanel recipe={recipeWithRawHtml} />);

    // No live <img> was mounted from the markdown source...
    expect(container.querySelector('img[src="x"]')).not.toBeInTheDocument();
    // ...and the raw tag shows up as literal, escaped text instead.
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });
});
