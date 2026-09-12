import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExamplesPanel } from "@/components/catalog/examples-panel";
import { embeddings101, tokensAndContext } from "@/tests/fixtures/catalog/recipes";

describe("ExamplesPanel", () => {
  it("renders one card per example, with title as a heading, summary, and expect as prose", () => {
    render(<ExamplesPanel examples={embeddings101.examples} onTryExample={vi.fn()} />);

    for (const example of embeddings101.examples) {
      expect(screen.getByRole("heading", { name: example.title })).toBeInTheDocument();
      expect(screen.getByText(example.summary)).toBeInTheDocument();
      expect(screen.getByText(example.expect)).toBeInTheDocument();
    }

    expect(
      screen.getAllByRole("button", { name: /try this example/i }),
    ).toHaveLength(embeddings101.examples.length);
  });

  it("calls onTryExample with that card's own params, not the last one or a shared/stale value", async () => {
    const user = userEvent.setup();
    const onTryExample = vi.fn();
    render(<ExamplesPanel examples={embeddings101.examples} onTryExample={onTryExample} />);

    const buttons = screen.getAllByRole("button", { name: /try this example/i });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[0]);
    expect(onTryExample).toHaveBeenLastCalledWith(embeddings101.examples[0].params);

    await user.click(buttons[1]);
    expect(onTryExample).toHaveBeenLastCalledWith(embeddings101.examples[1].params);

    expect(onTryExample).toHaveBeenCalledTimes(2);
    // Distinct params objects, proving no shared/stale closure value.
    expect(onTryExample.mock.calls[0][0]).not.toBe(onTryExample.mock.calls[1][0]);
    expect(onTryExample.mock.calls[0][0]).toEqual({
      texts: ["The cat sat on the mat.", "A cat was sitting on a mat."],
    });
    expect(onTryExample.mock.calls[1][0]).toEqual({
      texts: ["The cat sat on the mat.", "Quarterly revenue rose 3%."],
    });
  });

  it("renders nothing when there are zero examples", () => {
    const { container } = render(
      <ExamplesPanel examples={tokensAndContext.examples} onTryExample={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies a custom className to the root container", () => {
    const { container } = render(
      <ExamplesPanel
        examples={embeddings101.examples}
        onTryExample={vi.fn()}
        className="custom-class"
      />,
    );

    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });
});
