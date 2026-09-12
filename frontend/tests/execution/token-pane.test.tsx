import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TokenPane } from "@/components/execution/token-pane";
import { parseRecipeEvent, type TokenEvent } from "@/lib/execution/events";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

function tokenEvents(fileName: string): TokenEvent[] {
  const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseRecipeEvent(JSON.parse(line)))
    .filter((event): event is TokenEvent => event.type === "token");
}

describe("TokenPane", () => {
  const events = tokenEvents("token-stream.jsonl");

  it("has real token events to test against", () => {
    expect(events.length).toBeGreaterThan(1);
  });

  it("renders the exact concatenation of every token's text, in order", () => {
    const expected = events.map((event) => event.text).join("");
    render(<TokenPane events={events} />);
    const pane = document.querySelector('[data-slot="token-pane"]');
    expect(pane).not.toBeNull();
    expect(pane?.textContent).toBe(expected);
  });

  it("does not reorder or drop tokens across growing intermediate slices", () => {
    // Simulate the stream arriving token-by-token: at every prefix length,
    // the rendered text must equal that prefix's exact concatenation --
    // never a permutation, never a subset skipping an entry.
    const { rerender } = render(<TokenPane events={[]} />);

    let expected = "";
    for (let i = 0; i < events.length; i++) {
      expected += events[i].text;
      rerender(<TokenPane events={events.slice(0, i + 1)} />);
      const pane = document.querySelector('[data-slot="token-pane"]');
      expect(pane?.textContent).toBe(expected);
    }
  });

  it("keeps a single stable container element identity as the stream grows", () => {
    const { rerender } = render(<TokenPane events={events.slice(0, 1)} />);
    const first = document.querySelector('[data-slot="token-pane"]');
    rerender(<TokenPane events={events} />);
    const second = document.querySelector('[data-slot="token-pane"]');
    // Same DOM node reused, not a freshly-mounted subtree per token.
    expect(second).toBe(first);
  });

  it("preserves literal newlines/whitespace as authored", () => {
    const events: TokenEvent[] = [
      parseRecipeEvent({ type: "token", text: "line one\n" }) as TokenEvent,
      parseRecipeEvent({ type: "token", text: "line two" }) as TokenEvent,
    ];
    render(<TokenPane events={events} />);
    const pane = document.querySelector('[data-slot="token-pane"]');
    expect(pane).toHaveClass("whitespace-pre-wrap");
    expect(pane?.textContent).toBe("line one\nline two");
  });

  it("renders empty without error when given no token events", () => {
    render(<TokenPane events={[]} />);
    const pane = document.querySelector('[data-slot="token-pane"]');
    expect(pane).not.toBeNull();
    expect(pane?.textContent).toBe("");
  });
});
