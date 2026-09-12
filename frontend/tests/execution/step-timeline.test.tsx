import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepTimeline } from "@/components/execution/step-timeline";
import { parseRecipeEvent, type RecipeEvent, type StepEvent } from "@/lib/execution/events";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

function readJsonlEvents(fileName: string): RecipeEvent[] {
  const raw = readFileSync(path.join(FIXTURES_DIR, fileName), "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseRecipeEvent(JSON.parse(line)));
}

function stepEvents(fileName: string): StepEvent[] {
  return readJsonlEvents(fileName).filter((event): event is StepEvent => event.type === "step");
}

describe("StepTimeline", () => {
  it("collapses a start+finish pair (happy-path.jsonl) into one done row", () => {
    const events = stepEvents("happy-path.jsonl");
    // Sanity check on the fixture itself: exactly one id, start then finish.
    expect(events).toEqual([
      expect.objectContaining({ id: "s1", status: "start" }),
      expect.objectContaining({ id: "s1", status: "finish", detail: "done" }),
    ]);

    render(<StepTimeline events={events} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Generating summary")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/done/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/done/).textContent).not.toMatch(/in progress/i);
    expect(rows[0]).toHaveAttribute("data-status", "finish");
  });

  it("renders an unclosed step (start with no matching finish/error) as visibly in progress", () => {
    // happy-path.jsonl's first event alone, truncated mid-step -- a real
    // "the stream hasn't caught up yet" state, built directly from the
    // fixture rather than invented from scratch.
    const events = stepEvents("happy-path.jsonl").slice(0, 1);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("start");

    render(<StepTimeline events={events} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-status", "start");
    expect(within(rows[0]).getByText(/in progress/i)).toBeInTheDocument();
    // Distinct visual state: a spinning icon, not just different text.
    expect(rows[0].querySelector(".animate-spin")).not.toBeNull();
  });

  it("preserves first-seen order even when a later-started step finishes first", () => {
    // No single fixture happens to interleave two steps this way, so this
    // sequence is constructed directly (each event still schema-valid via
    // parseRecipeEvent) to exercise the ordering rule precisely: s1 starts
    // first, s2 starts second, but s2 *finishes* before s1 does.
    const raw = [
      { type: "step", id: "s1", name: "First step", status: "start", detail: null, ts: 0 },
      { type: "step", id: "s2", name: "Second step", status: "start", detail: null, ts: 1 },
      { type: "step", id: "s2", name: "Second step", status: "finish", detail: "done", ts: 2 },
      { type: "step", id: "s1", name: "First step", status: "finish", detail: "done", ts: 3 },
    ];
    const events = raw.map((event) => parseRecipeEvent(event) as StepEvent);

    render(<StepTimeline events={events} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("First step")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Second step")).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute("data-status", "finish");
    expect(rows[1]).toHaveAttribute("data-status", "finish");
  });

  it("visually distinguishes an errored step from done/in-progress ones", () => {
    // None of the fixture files contain a StepEvent with status "error"
    // (their error scenarios all emit a top-level ErrorEvent instead), so
    // this one case is constructed directly against the schema.
    const errored = parseRecipeEvent({
      type: "step",
      id: "s1",
      name: "Parsing input file",
      status: "error",
      detail: "KeyError('summary')",
      ts: 0.35,
    }) as StepEvent;

    render(<StepTimeline events={[errored]} />);

    const row = screen.getByRole("listitem");
    expect(row).toHaveAttribute("data-status", "error");
    expect(within(row).getByText(/error/i)).toBeInTheDocument();
    expect(within(row).getByText(/KeyError/)).toBeInTheDocument();
    expect(row.querySelector(".text-destructive")).not.toBeNull();
  });

  it("orders two never-closed steps by first-seen position (partial-then-error.jsonl)", () => {
    const events = stepEvents("partial-then-error.jsonl");
    expect(events).toEqual([
      expect.objectContaining({ id: "s1", status: "start" }),
      expect.objectContaining({ id: "s2", status: "start" }),
    ]);

    render(<StepTimeline events={events} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Generating response")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Fetching supporting data")).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute("data-status", "start");
    expect(rows[1]).toHaveAttribute("data-status", "start");
  });

  it("renders nothing for an empty events array", () => {
    const { container } = render(<StepTimeline events={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(container.querySelector('[data-slot="step-timeline"]')).toBeInTheDocument();
  });
});
