import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { JsonTree } from "@/components/execution/artifact/json-tree";

// Real fixture from tests/execution/fixtures/artifacts.jsonl (artifact "a1", kind: "json").
const sentimentData = { score: 0.87, labels: ["positive", "confident"] };

describe("JsonTree", () => {
  it("renders primitive leaf values with their key", () => {
    render(<JsonTree data={sentimentData} />);
    expect(screen.getByText("score:")).toBeInTheDocument();
    expect(screen.getByText("0.87")).toBeInTheDocument();
  });

  it("renders the optional name heading when provided", () => {
    render(<JsonTree name="Sentiment Analysis" data={sentimentData} />);
    expect(screen.getByText("Sentiment Analysis")).toBeInTheDocument();
  });

  it("omits the heading when name is not provided", () => {
    render(<JsonTree data={sentimentData} />);
    expect(screen.queryByText("Sentiment Analysis")).not.toBeInTheDocument();
  });

  it("expands nested array items by default (depth < 2 starts open)", () => {
    render(<JsonTree data={sentimentData} />);
    // "labels" is an array at depth 1, so its string children render immediately.
    expect(screen.getByText('"positive"')).toBeInTheDocument();
    expect(screen.getByText('"confident"')).toBeInTheDocument();
  });

  it("shows the labels array node with its length summary", () => {
    render(<JsonTree data={sentimentData} />);
    const toggle = screen.getByRole("button", { name: /labels/ });
    expect(toggle).toHaveTextContent("[2]");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses and re-expands a node on click", async () => {
    const user = userEvent.setup();
    render(<JsonTree data={sentimentData} />);

    const toggle = screen.getByRole("button", { name: /labels/ });
    expect(screen.getByText('"positive"')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText('"positive"')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText('"positive"')).toBeInTheDocument();
  });

  it("renders null and boolean primitives without crashing", () => {
    render(<JsonTree data={{ maybe: null, active: true }} />);
    expect(screen.getByText("null")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
  });
});
